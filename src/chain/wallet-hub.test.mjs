import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chain, recordsAddress } from './config.js';
import { createRecordsWallet } from './wallet.js';
import { setLang } from '../i18n/i18n.js';

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.textContent = ''; this.attrs = {}; this.events = {}; this.style = {}; this.hidden = false; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(key, fn) { this.events[key] = fn; }
  removeEventListener(key) { delete this.events[key]; }
  contains(node) { return node === this || this.children.some(n => n.contains(node)); }
  focus() { document.activeElement = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  get text() { return this.textContent + this.children.map(n => n.text).join(' '); }
}
globalThis.document = { createElement: tag => new Node(tag), head: new Node(), body: new Node(), events: {}, addEventListener(key, fn) { this.events[key] = fn; }, removeEventListener(key) { delete this.events[key]; }, querySelectorAll: () => [] };
const { mountNFTCard } = await import('./nft-card.js');
const { mountWalletHub, openMyNFT, openProfile } = await import('./wallet-hub.js');
const { createSuccessToast } = await import('./wallet-toast.js');
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const find = (root, tag) => root.children.flatMap(n => [n, ...find(n, tag)]).filter(n => n.tagName === tag);
const record = { tokenId: 7, firstTrack: 2, firstLapMs: 50000, achievements: 7, mintedAt: 1700000000n, updatedAt: 1800000000n };
function setup() {
  let state = { account: null, chainId: null, phase: '' }; const listeners = new Set(), calls = [];
  const wallet = { get state() { return state; }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async connect() { calls.push('connect'); change({ account: '0x1234567890123456789012345678901234567890', chainId: chain.id }); },
    async disconnect() { calls.push('disconnect'); change({ account: null, chainId: null }); }, async switchNetwork() { calls.push('switch'); change({ chainId: chain.id }); },
    async readLeaderboard() { return []; }, async readRecord() { return record; }, async readBest(addr, id) { calls.push(id); return { bestMs: id === 3 ? 0 : id * 10000, verified: id === 1 }; } };
  function change(next) { state = { ...state, ...next }; listeners.forEach(fn => fn(state)); }
  return { wallet, change, calls, listeners };
}
test('NFT 卡片连接、链上读取三赛道、链接及图片降级', async () => {
  const env = setup(), root = new Node(), card = mountNFTCard(root, env);
  assert.match(root.text, /连接钱包/); await find(root, 'button')[0].onclick(); await flush();
  assert.match(root.text, /#0007/); assert.match(root.text, /湖畔环线/); assert.match(root.text, /3\/28/);
  assert.match(root.text, /已核实/); assert.match(root.text, /玩家自报/); assert.match(root.text, /暂无成绩/);
  assert.deepEqual(env.calls.filter(n => typeof n === 'number'), [1, 2, 3]);
  const image = find(root, 'img')[0]; assert.equal(image.src, '/api/nft/image/7?v=1800000000'); image.onerror();
  assert.equal(image.hidden, true); assert.match(root.text, /图片暂不可用/);
  assert.ok(find(root, 'a').some(n => n.href === `${chain.blockExplorers.default.url}/token/${recordsAddress}?a=7`));
  assert.ok(find(root, 'a').some(n => n.href === '/api/nft/view/7'));
  card.destroy(); assert.equal(env.listeners.size, 0);
});
test('tokenId 为零时显示资格线引导，不请求 bestOf', async () => {
  const env = setup(); await env.wallet.connect(); env.wallet.readRecord = async () => ({ tokenId: 0 });
  const root = new Node(), card = mountNFTCard(root, env); await flush();
  assert.match(root.text, /资格线/); assert.equal(find(root, 'a')[0].href, '/?race'); assert.deepEqual(env.calls, ['connect']); card.destroy();
});
test('公共客户端通过 wallet 接口读取 recordOf 与 bestOf', async () => {
  const calls = [], provider = { request: async ({ method }) => method === 'eth_chainId' ? chain.id : ['0xabc'] };
  const wallet = createRecordsWallet({ address: recordsAddress, getProvider: () => provider, getWalletClient: () => ({}), publicClient: { readContract: async ({ functionName, args }) => { calls.push([functionName, args]); return functionName === 'recordOf' ? record : { bestMs: 50000 }; } } });
  await wallet.connect(); const card = mountNFTCard(new Node(), { wallet }); await flush();
  assert.deepEqual(calls.map(n => n[0]), ['recordOf', 'bestOf', 'bestOf', 'bestOf']); card.destroy();
});
test('切换账户与卸载会丢弃旧读取，错误可重试', async () => {
  const env = setup(); await env.wallet.connect(); let resolve;
  env.wallet.readRecord = () => new Promise(done => { resolve = done; });
  const root = new Node(), card = mountNFTCard(root, env); env.change({ account: null });
  resolve(record); await flush(); assert.doesNotMatch(root.text, /#0007/);
  env.wallet.readRecord = async () => { throw new Error('RPC timeout'); }; env.change({ account: '0xdef' }); await flush(); assert.match(root.text, /网络错误/);
  env.wallet.readRecord = async () => record; await find(root, 'button')[0].onclick(); await flush(); assert.match(root.text, /#0007/);
  card.destroy(); assert.equal(env.listeners.size, 0);
});
test('入口连接后导航个人主页，菜单保留切链与断开，语言同步', async () => {
  const env = setup(), root = new Node(), destinations = [];
  const hub = mountWalletHub(root, { ...env, navigate: href => destinations.push(href) });
  await find(root, 'button')[0].onclick(); assert.match(root.text, /0x1234…7890/);
  find(root, 'button')[0].onclick(); assert.deepEqual(destinations, ['/?profile']);
  env.change({ chainId: 1 });
  await find(root, 'button').find(n => n.textContent.includes('切换到')).onclick(); assert.ok(env.calls.includes('switch'));
  assert.ok(find(root, 'a').some(n => n.href === '/?profile&tab=leaderboard'));
  setLang('en'); assert.match(root.text, /Disconnect/); setLang('zh');
  await find(root, 'button').find(n => n.textContent === '断开连接').onclick(); assert.match(root.text, /连接钱包/);
  hub.destroy(); assert.equal(env.listeners.size, 0);
});
test('旧资料入口与铸造成功入口分别导航榜单和个人主页', () => {
  const paths = [], navigate = href => paths.push(href);
  openProfile({ tab: 'leaderboard', navigate }); openMyNFT({ tab: 'leaderboard', navigate });
  assert.deepEqual(paths, ['/?profile&tab=leaderboard', '/?profile']);
});
test('成功提示持续 3.6 秒且新提示重置计时，销毁清理', () => {
  const delays = [], cleared = [], timers = [];
  const root = new Node(), toast = createSuccessToast(root, { schedule(fn, ms) { delays.push(ms); timers.push(fn); return timers.length; }, cancel(id) { cleared.push(id); } });
  toast.show('minted', 7); assert.match(root.text, /#7/); assert.deepEqual(delays, [3600]);
  toast.show('updated', 7); assert.match(root.text, /已更新/); assert.deepEqual(cleared, [1]); timers.at(-1)(); assert.equal(find(root, 'section')[0].hidden, true); toast.destroy();
});
test('成功提示按成就提示缩放后的实际边界避让', () => {
  const old = document.querySelector; document.querySelector = selector => selector === '#race-hud' ? null : ({ getBoundingClientRect: () => ({ bottom: 158 }) });
  const root = new Node(), toast = createSuccessToast(root, { schedule: () => 1, cancel() {} });
  toast.show('minted', 7); assert.equal(find(root, 'section')[0].style.top, '170px');
  toast.destroy(); document.querySelector = old;
});
test('赛车页成功提示放在底部，避开完赛成就提示与成绩卡', () => {
  const old = document.querySelector; document.querySelector = selector => selector === '#race-hud' ? {} : ({ getBoundingClientRect: () => ({ bottom: 158 }) });
  const root = new Node(), toast = createSuccessToast(root, { schedule: () => 1, cancel() {} });
  toast.show('minted', 7); const section = find(root, 'section')[0];
  assert.equal(section.style.top, 'auto'); assert.equal(section.style.bottom, '96px');
  toast.destroy(); document.querySelector = old;
});
test('提示逐帧跟随成就入场，3.6 秒结束会取消动画帧', () => {
  const previous = { query: document.querySelector, request: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame };
  let bottom = 158, expire; const frames = [], cancelled = [];
  document.querySelector = selector => selector === '#race-hud' ? null : ({ getBoundingClientRect: () => ({ bottom }) });
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = id => cancelled.push(id);
  const root = new Node(), toast = createSuccessToast(root, { schedule(fn) { expire = fn; return 1; }, cancel() {} });
  try {
    toast.show('minted', 7); bottom = 254; frames[0]();
    assert.equal(find(root, 'section')[0].style.top, '266px'); expire(); assert.deepEqual(cancelled, [2]);
    assert.equal(find(root, 'section')[0].hidden, true);
  } finally { toast.destroy(); document.querySelector = previous.query; globalThis.requestAnimationFrame = previous.request; globalThis.cancelAnimationFrame = previous.cancel; }
});
