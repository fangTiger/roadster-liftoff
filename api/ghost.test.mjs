import test from 'node:test';
import assert from 'node:assert/strict';
import { BlobNotFoundError } from '@vercel/blob';
import { createVerifyHandler } from './verify.js';
import { createGhostHandler } from './ghost.js';
import { createGhostStore } from './_lib/ghost-store.js';
import { createRaceReader } from './_lib/chain.js';

const address = '0x81d400000000000000000000000000000000707B';
function memoryBlob(cached = false) {
  const records = new Map(), cache = new Map(); let version = 0;
  return {
    records,
    async head(path) {
      const data = records.get(path);
      if (!data) throw new BlobNotFoundError();
      return { url: `https://blob.example/${path}`, etag: data.etag };
    },
    async get(path) {
      const key = path.startsWith('http') ? new URL(path).pathname.slice(1) : path;
      let data = records.get(key);
      if (cached && data) { if (!cache.has(path)) cache.set(path, data); data = cache.get(path); }
      return data ? { statusCode: 200, stream: new Response(data.text).body, headers: new Headers({ etag: data.etag }), blob: { url: `https://blob.example/${path}` } } : null;
    },
    async put(path, text, options) {
      if (options.ifMatch && options.allowOverwrite === false) throw new Error('ifMatch 与禁止覆盖矛盾');
      const old = records.get(path);
      if (options.ifMatch ? old?.etag !== options.ifMatch : old && !options.allowOverwrite) throw Object.assign(new Error('写入冲突'), { status: 412 });
      records.set(path, { text, etag: String(++version) }); return { url: `https://blob.example/${path}` };
    },
    async list({ prefix, cursor }) {
      const entries = [...records.keys()].filter(path => path.startsWith(prefix)), start = Number(cursor || 0);
      return { blobs: entries.slice(start, start + 1).map(pathname => ({ pathname, url: `https://blob.example/${pathname}` })), hasMore: start + 1 < entries.length, cursor: String(start + 1) };
    },
  };
}
const store = () => createGhostStore({ chainId: 5042002, token: 'fake', blob: memoryBlob(), now: () => 100000 });
const request = (body, ip = '127.0.0.1') => new Request('https://example.com/api/verify', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const payload = { address, trackId: 1, replay: { trackId: 1 }, bits0to19: 0xffffffff };
function verifyOptions(extra = {}) {
  return { store: store(), readTrack: async () => ({ qualifyMs: 60000 }), replayVerifier: () => ({ bestLap: 47.1235, achievements: 1 << 20 }), signer: async () => ({ signature: '0xsignature', verifier: address }), now: () => 100000, ...extra };
}
test('存储路径小写、内容完整，相同或更慢不覆盖；并发保留最快', async () => {
  const blob = memoryBlob(), storage = createGhostStore({ chainId: 5042002, token: 'fake', blob, now: () => 100000 });
  await storage.put(1, address, { data: 'one', trackId: 1 }, 50000);
  await storage.put(1, address, { data: 'slow' }, 50000);
  assert.equal((await storage.get(1, address)).data, 'one');
  await Promise.all([storage.put(1, address, { data: 'fast' }, 40000), storage.put(1, address, { data: 'middle' }, 45000)]);
  assert.equal((await storage.get(1, address)).bestMs, 40000);
  assert.ok(blob.records.has(`ghosts/5042002/1/${address.toLowerCase()}.json`));
  await storage.put(1, '0x0000000000000000000000000000000000000001', { data: 'two' }, 60000);
  assert.equal((await storage.list(1)).length, 2);
  const content = JSON.parse([...blob.records.values()][0].text);
  assert.equal(content.updatedAt, 100); assert.equal(content.data, 'fast');
});
test('核实接口采用服务器圈速及高位、低20位掩码、半小时截止与保存', async () => {
  const options = verifyOptions(), calls = [];
  options.signer = async message => { calls.push(message); return { signature: '0xsignature', verifier: address }; };
  const res = await createVerifyHandler(options)(request(payload));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { lapMs: 47124, achievements: 0x1fffff, deadline: 1900, signature: '0xsignature', verifier: address });
  assert.equal(calls[0].player, address);
  assert.equal((await options.store.get(1, address)).bestMs, 47124);
});
test('无效 JSON、地址、赛道、位图和录像返回400，依赖故障503且不暴露异常', async () => {
  const post = createVerifyHandler(verifyOptions());
  for (const body of ['{', 'null', { ...payload, address: 'bad' }, { ...payload, address: [address] }, { ...payload, trackId: 4 }, { ...payload, bits0to19: -1 }, { ...payload, replay: null }]) assert.equal((await post(request(body))).status, 400);
  const invalid = createVerifyHandler(verifyOptions({ replayVerifier: () => { throw new Error('未完成比赛'); } }));
  assert.equal((await invalid(request(payload))).status, 400);
  for (const dependency of ['signer', 'readTrack']) {
    const response = await createVerifyHandler(verifyOptions({ [dependency]: () => { throw new Error('sensitive'); } }))(request(payload));
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sensitive/);
  }
  const oldKey = process.env.VERIFIER_PRIVATE_KEY;
  try {
    delete process.env.VERIFIER_PRIVATE_KEY;
    assert.equal((await createVerifyHandler(verifyOptions({ signer: undefined }))(request(payload))).status, 503);
  } finally { if (oldKey !== undefined) process.env.VERIFIER_PRIVATE_KEY = oldKey; }
});
test('128KB按真实流字节限制，不能靠伪造 content-length 绕过', async () => {
  const post = createVerifyHandler(verifyOptions());
  const encoded = JSON.stringify({ ...payload, padding: '' });
  assert.equal((await post(request({ ...payload, padding: ' '.repeat(131072 - Buffer.byteLength(encoded)) }))).status, 200);
  const oversized = await post(request(' '.repeat(131073)));
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, '请求体超过 128 KB');
  const req = request(' '.repeat(131073)); req.headers.set('content-length', '1');
  assert.equal((await post(req)).status, 413);
  const utf = request(JSON.stringify({ ...payload, padding: '中'.repeat(45000) }));
  assert.equal((await post(utf)).status, 413);
});
test('同一IP一分钟最多10次，窗口后恢复且独立IP不受影响', async () => {
  let now = 100000; const post = createVerifyHandler(verifyOptions({ now: () => now }));
  for (let i = 0; i < 10; i++) assert.equal((await post(request(payload))).status, 200);
  const limited = await post(request(payload)); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  assert.equal((await post(request(payload, '127.0.0.2'))).status, 200);
  now += 60000; assert.equal((await post(request(payload))).status, 200);
});
test('影子列表先筛核实排序取20再跳过无录像，缓存30秒；单地址返回录像', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ address: `0x${String(i + 1).padStart(40, '0')}`, bestMs: 1000 + i, verified: true }));
  const storage = store();
  for (const row of rows.slice(1)) await storage.put(1, row.address, { trackId: 1, data: 'tape' }, row.bestMs);
  const get = createGhostHandler({ store: storage, readLeaderboard: async () => [{ address, bestMs: 1, verified: false }, ...rows.toReversed()] });
  const res = await get(new Request('https://example.com/api/ghost?trackId=1'));
  assert.equal(res.status, 200); assert.match(res.headers.get('cache-control'), /s-maxage=30/);
  const data = await res.json(); assert.equal(data.length, 19); assert.equal(data[0].address, rows[1].address); assert.equal(data.at(-1).address, rows[19].address);
  const single = await get(new Request(`https://example.com/api/ghost?trackId=1&address=${rows[1].address}`));
  assert.equal((await single.json()).data, 'tape'); assert.match(single.headers.get('cache-control'), /s-maxage=30/);
  assert.equal((await get(new Request(`https://example.com/api/ghost?trackId=1&address=${address}`))).status, 404);
  for (const query of ['', '?trackId=4', '?trackId=1&address=bad', '?trackId=01']) assert.equal((await get(new Request(`https://example.com/api/ghost${query}`))).status, 400);
  assert.equal((await createGhostHandler({ readLeaderboard: async () => { throw new Error('secret'); }, store: storage })(new Request('https://example.com/api/ghost?trackId=1'))).status, 503);
});
test('链榜单分页读取全部玩家，保留50名以外核实玩家；资格线来自链上', async () => {
  const calls = [], reader = createRaceReader({ address, readContract: async ({ functionName, args }) => {
    calls.push([functionName, args]);
    if (functionName === 'playerCount') return 205n;
    if (functionName === 'trackOf') return { qualifyMs: 60000 };
    const start = Number(args[1]), count = Number(args[2]);
    return [Array.from({ length: count }, (_, i) => `0x${(start + i + 1).toString(16).padStart(40, '0')}`), [], Array.from({ length: count }, (_, i) => ({ bestMs: start + i + 1000, verified: start + i >= 150 }))];
  } });
  assert.equal((await reader.readLeaderboard(1)).length, 205);
  assert.deepEqual(calls.filter(([name]) => name === 'players').map(([, args]) => args), [[1, 0n, 100n], [1, 100n, 100n], [1, 200n, 5n]]);
  assert.equal((await reader.readTrack(1)).qualifyMs, 60000);
});

test('公开Blob缓存旧内容时，连续刷新成绩仍读取新版本并保留最快', async () => {
  const storage = createGhostStore({ chainId: 5042002, token: 'fake', blob: memoryBlob(true) });
  await storage.put(1, address, { data: 'first' }, 50000);
  assert.equal((await storage.get(1, address)).bestMs, 50000);
  await storage.put(1, address, { data: 'second' }, 40000);
  await storage.put(1, address, { data: 'third' }, 30000);
  assert.equal((await storage.get(1, address)).bestMs, 30000);
});

test('100 KB 请求进入核实并保存，不放宽录像校验', async () => {
  let checked = false;
  const options = verifyOptions({ replayVerifier: replay => { checked = true; assert.equal(replay.trackId, 1); return { bestLap: 47, achievements: 0 }; } });
  const encoded = JSON.stringify({ ...payload, padding: '' });
  const body = { ...payload, padding: ' '.repeat(100 * 1024 - Buffer.byteLength(encoded)) };
  assert.equal(Buffer.byteLength(JSON.stringify(body)), 100 * 1024);
  assert.equal((await createVerifyHandler(options)(request(body))).status, 200);
  assert.equal(checked, true);
  assert.equal((await options.store.get(1, address)).bestMs, 47000);
  const invalid = createVerifyHandler(verifyOptions({ replayVerifier() { throw new Error('录像无效'); } }));
  assert.equal((await invalid(request(body))).status, 400);
  const declared = request(payload); declared.headers.set('content-length', '131073');
  assert.equal((await createVerifyHandler(options)(declared)).status, 413);
});
