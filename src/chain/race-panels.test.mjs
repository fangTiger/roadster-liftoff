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
  assert.match(root.text, /玩家自报成绩/); assert.match(root.text, /已核实/);
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
