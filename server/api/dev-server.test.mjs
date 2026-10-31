import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from './dev-server.js';
import { createVerifyHandler } from '../../api/verify.js';
import { createGhostHandler } from '../../api/ghost.js';
import { createGhostStore } from '../../api/_lib/ghost-store.js';
import viteConfig from '../../vite.config.js';

async function listen(t, options) {
  const server = createApiServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('真实 HTTP 适配核实流与文件影子，100 KB 通过、超限拒绝', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const address = '0x0000000000000000000000000000000000000001';
  const store = createGhostStore({ mode: 'file', directory, chainId: 5042002 });
  const origin = await listen(t, { verify: createVerifyHandler({ store, readTrack: async () => ({ qualifyMs: 58000 }), replayVerifier: () => ({ bestLap: 50, achievements: 0 }), signer: async () => ({ signature: '0xmock' }) }), ghost: createGhostHandler({ store, readLeaderboard: async () => [{ address, verified: true, bestMs: 50000 }] }) });
  const body = { address, trackId: 1, replay: { trackId: 1, data: 'tape' }, bits0to19: 0, padding: '' };
  body.padding = ' '.repeat(102400 - Buffer.byteLength(JSON.stringify(body)));
  const verified = await fetch(`${origin}/api/verify`, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(verified.status, 200); assert.equal((await verified.json()).lapMs, 50000);
  const list = await (await fetch(`${origin}/api/ghost?trackId=1`)).json();
  assert.equal(list.length, 1);
  const ghost = await fetch(new URL(list[0].url, origin));
  assert.equal((await ghost.json()).data, 'tape');
  const large = await fetch(`${origin}/api/verify`, { method: 'POST', body: ' '.repeat(131073) });
  assert.equal(large.status, 413); assert.match((await large.json()).error, /128 KB/);
  const chunks = new ReadableStream({ start(controller) {
    for (let i = 0; i < 14; i++) controller.enqueue(new Uint8Array(10000).fill(32));
    controller.close();
  } });
  const chunked = await fetch(`${origin}/api/verify`, { method: 'POST', body: chunks, duplex: 'half' });
  assert.equal(chunked.status, 413); assert.match((await chunked.json()).error, /128 KB/);
});
test('挂载 NFT 所有路径、返回方法限制和404，异常不泄露', async t => {
  const origin = await listen(t, { metadata: async req => Response.json({ path: new URL(req.url).pathname }), image: async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }), view: async () => new Response('<html>预览</html>', { headers: { 'content-type': 'text/html' } }), ghost: async () => { throw new Error('不能泄露的内部错误'); } });
  assert.deepEqual(await (await fetch(`${origin}/api/nft/12`)).json(), { path: '/api/nft/12' });
  assert.equal((await fetch(`${origin}/api/nft/image/12`)).headers.get('content-type'), 'image/png');
  assert.match(await (await fetch(`${origin}/api/nft/view/12`)).text(), /预览/);
  const method = await fetch(`${origin}/api/verify`); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST');
  assert.equal((await fetch(`${origin}/api/nft/12`, { method: 'POST' })).status, 405);
  for (const path of ['/api/nope', '/api/nft/view/12/extra']) assert.equal((await fetch(origin + path)).status, 404);
  const failed = await fetch(`${origin}/api/ghost?trackId=1`); assert.equal(failed.status, 500); assert.doesNotMatch(await failed.text(), /不能泄露/);
});
test('Vite 只在开发代理 API，且不加载任何 .env 文件', () => {
  const dev = viteConfig({ command: 'serve' }), prod = viteConfig({ command: 'build' });
  assert.equal(dev.server.proxy['/api'].target, 'http://127.0.0.1:8934');
  assert.equal(prod.server?.proxy?.['/api'], undefined);
  assert.equal(dev.envDir, false); assert.equal(prod.envDir, false);
});
