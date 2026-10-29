import { test } from 'node:test';
import assert from 'node:assert/strict';

// 最小 DOM 替身只提供真实面板使用的元素接口，检查用户可见行为和交易边界。
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.disabled = false; this.textContent = ''; this.attrs = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(k, v) { this.attrs[k] = v; }
  remove() { this.removed = true; }
  get text() { return this.textContent + this.children.map(n => n.text || '').join(' '); }
}
globalThis.document = { createElement: tag => new Node(tag), head: new Node('head') };
const { mountRaceChain } = await import('./race-panel.js');
const { mountRaceBoard } = await import('./race-board.js');
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
const find = (root, tag) => root.children.flatMap(n => [n, ...find(n, tag)]).filter(n => n.tagName === tag);
function setup() {
  let state = { account: null, chainId: null, phase: '' }, record = { tokenId: 0, achievements: 0 };
  const listeners = new Set(), sent = [];
  const wallet = {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async connect() { state = { ...state, account: '0xabc', chainId: 5042002 }; for (const fn of listeners) fn(state); },
    async readRecord() { return record; }, async readTrack() { return { qualifyMs: 60000, minLapMs: 10000 }; },
    async readVerifier() { return '0x0000000000000000000000000000000000000000'; },
    async readBest() { return { bestMs: 40000, updatedAt: 1n }; },
    async submit(...args) { sent.push(args); record = { tokenId: 1, firstTrack: 1, firstLapMs: 50000, achievements: 7 }; return '0xhash'; },
    async readLeaderboard(trackId) { return [{ address: '0x1234567890', bestMs: trackId * 1000, verified: true, updatedAt: 1n }]; },
  };
  return { wallet, sent, listeners, changeState(next) { state = { ...state, ...next }; for (const fn of listeners) fn(state); } };
}
test('连接、铸造、成功链接和重复挂载卸载', async () => {
  const env = setup(), container = new Node();
  const panel = mountRaceChain(container, { trackId: 1, trackName: '草甸环线', bestLap: 50, bits: 7 }, env);
  assert.match(container.text, /连接钱包/);
  await find(container, 'button')[0].onclick(); await flush();
  assert.match(container.text, /铸造首圈纪念 NFT/);
  await find(container, 'button')[0].onclick(); await flush();
  assert.deepEqual(env.sent, [[1, 50000, 7]]);
  assert.match(container.text, /上链成功/);
  assert.match(find(container, 'a')[0].href, /arcscan.app\/tx\/0xhash/);
  panel.destroy(); assert.equal(env.listeners.size, 0);
});
test('未进资格线提示差距且不发交易，关闭和过快提示', async () => {
  for (const [lap, text] of [[61, /资格线 60.000 秒，差 1.000 秒/], [5, /下限/]]) {
    const env = setup(); await env.wallet.connect(); const root = new Node();
    const panel = mountRaceChain(root, { trackId: 1, trackName: '草甸环线', bestLap: lap, bits: 0 }, env);
    await flush(); assert.match(root.text, text); assert.ok(find(root, 'button')[0].disabled); assert.equal(env.sent.length, 0); panel.destroy();
  }
});
test('榜单三图切换、已核实和首圈详情/各赛道最佳成绩', async () => {
  const env = setup(), root = new Node();
  env.wallet.readRecord = async () => ({ tokenId: 1, firstTrack: 1, firstLapMs: 50000, achievements: 0xfffffff });
  const board = mountRaceBoard(root, env); await flush();
  assert.match(root.text, /默认仅显示已核实成绩/); assert.match(root.text, /已核实/);
  await find(root, 'button').find(n => n.textContent === '连接钱包').onclick(); await flush();
  assert.match(root.text, /28\/28/); assert.match(root.text, /草甸环线/); assert.match(root.text, /首圈/);
  await find(root, 'button').find(n => n.textContent === '湖畔环线').onclick(); await flush();
  assert.match(root.text, /2.00 s/); board.destroy(); assert.equal(env.listeners.size, 0);
});
test('连接事件发生后取消切网，榜单仍可再次连接', async () => {
  const env = setup(), root = new Node();
  env.wallet.connect = async () => { env.changeState({ account: '0xabc', chainId: 1 }); throw { code: 4001 }; };
  const board = mountRaceBoard(root, env);
  await find(root, 'button').find(n => n.textContent === '连接钱包').onclick();
  assert.match(root.text, /取消/);
  assert.ok(find(root, 'button').some(n => n.textContent === '连接钱包' && !n.disabled));
  board.destroy();
});
test('读取失败后的重试只刷新，不隐式提交交易', async () => {
  const env = setup(), root = new Node(); await env.wallet.connect();
  const read = env.wallet.readRecord; let failure = true;
  env.wallet.readRecord = async () => { if (failure) throw new Error('RPC timeout'); return read(); };
  const panel = mountRaceChain(root, { trackId: 1, trackName: '草甸环线', bestLap: 50, bits: 7 }, env);
  await flush(); assert.match(root.text, /网络错误/);
  failure = false; await find(root, 'button')[0].onclick();
  assert.equal(env.sent.length, 0); assert.match(root.text, /铸造首圈纪念 NFT/);
  panel.destroy();
});

test('上链面板错误与地图名随语言切换，翻译不会触发提交', async () => {
  const { setLang } = await import('../i18n/i18n.js');
  const oldQuery = document.querySelectorAll;
  document.querySelectorAll = () => [];
  const env = setup(); await env.wallet.connect();
  env.wallet.readRecord = async () => { throw new Error('RPC timeout'); };
  const root = new Node(), panel = mountRaceChain(root, { trackId: 1, trackName: '草甸环线', bestLap: 50, bits: 0 }, env);
  await flush(); assert.match(root.text, /网络错误/);
  try { setLang('en'); assert.match(root.text, /Network error/); assert.match(root.text, /Meadow Loop/); assert.doesNotMatch(root.text, /网络错误/); assert.equal(env.sent.length, 0); }
  finally { panel.destroy(); setLang('zh'); document.querySelectorAll = oldQuery; }
});

test('提交先读取核实者、POST录像取签名，再用服务器参数提交', async () => {
  const env = setup(), root = new Node(), calls = []; await env.wallet.connect();
  env.wallet.readVerifier = async () => '0x0000000000000000000000000000000000000001';
  env.fetcher = async (url, options) => { calls.push('verify'); assert.equal(url, '/api/verify'); assert.deepEqual(JSON.parse(options.body), { address: '0xabc', trackId: 1, replay: { data: 'tape' }, bits0to19: 7 }); return Response.json({ lapMs: 49999, achievements: 0x100007, deadline: 1900, signature: '0xsig' }); };
  const submit = env.wallet.submit; env.wallet.submit = async (...args) => { calls.push('submit'); return submit(...args); };
  const panel = mountRaceChain(root, { trackId: 1, bestLap: 50, bits: 0xff00007, replay: { data: 'tape' } }, env); await flush();
  await find(root, 'button')[0].onclick();
  assert.deepEqual(calls, ['verify', 'submit']); assert.deepEqual(env.sent, [[1, 49999, 0x100007, 1900, '0xsig']]); panel.destroy();
});
test('核实失败显示接口原因，保留按钮允许重试且失败时不提交', async () => {
  const env = setup(), root = new Node(); await env.wallet.connect(); let failed = true;
  env.wallet.readVerifier = async () => '0x0000000000000000000000000000000000000001';
  env.fetcher = async () => failed ? Response.json({ error: '核实请求过于频繁' }, { status: 429 }) : Response.json({ lapMs: 50000, achievements: 7, deadline: 1900, signature: '0xsig' });
  const panel = mountRaceChain(root, { trackId: 1, bestLap: 50, bits: 7, replay: {} }, env); await flush();
  await find(root, 'button')[0].onclick(); assert.equal(env.sent.length, 0); assert.match(root.text, /核实请求过于频繁/); assert.equal(find(root, 'button')[0].disabled, false);
  failed = false; await find(root, 'button')[0].onclick(); assert.equal(env.sent.length, 1); panel.destroy();
});
test('零核实者走自报，不请求接口；核实过程中切换账户禁止提交', async () => {
  const env = setup(), root = new Node(); await env.wallet.connect();
  env.wallet.readVerifier = async () => '0x0000000000000000000000000000000000000000';
  env.fetcher = async () => assert.fail('零地址不需核实');
  let panel = mountRaceChain(root, { trackId: 1, bestLap: 50, bits: 7 }, env); await flush();
  await find(root, 'button')[0].onclick(); assert.deepEqual(env.sent, [[1, 50000, 7]]); panel.destroy();
  const next = setup(); await next.wallet.connect(); next.wallet.readVerifier = async () => '0x0000000000000000000000000000000000000001';
  next.fetcher = async () => { next.changeState({ account: '0xdef' }); return Response.json({ lapMs: 50000, achievements: 7, deadline: 1900, signature: '0xsig' }); };
  panel = mountRaceChain(root, { trackId: 1, bestLap: 50, bits: 7, replay: {} }, next); await flush();
  await find(root, 'button')[0].onclick(); assert.equal(next.sent.length, 0); panel.destroy();
});
test('排行榜默认只看核实，切换全部可见自报成绩', async () => {
  const env = setup(), root = new Node();
  env.wallet.readLeaderboard = async () => [{ address: '0x111111111111', bestMs: 1000, verified: false }, { address: '0x222222222222', bestMs: 2000, verified: true }];
  const board = mountRaceBoard(root, env); await flush(); assert.doesNotMatch(root.text, /1\.00 s/); assert.match(root.text, /2\.00 s/);
  await find(root, 'button').find(node => node.textContent === '全部').onclick(); await flush(); assert.match(root.text, /1\.00 s/); board.destroy();
});
