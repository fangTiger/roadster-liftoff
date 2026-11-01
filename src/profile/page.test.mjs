import test from 'node:test';
import assert from 'node:assert/strict';
import { mountProfile } from './page.js';
import { chain } from '../chain/config.js';
class Node {
  children = []; attrs = {}; style = { setProperty() {} }; hidden = false; textContent = ''; className = '';
  constructor(tag) { this.tagName = tag; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  querySelector(selector) { return nodes(this).slice(1).find(n => selector === '.lang-toggle' && n.className === 'lang-toggle') || null; }
  addEventListener() {} removeEventListener() {} focus() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  get text() { return this.textContent + this.children.map(n => n.text).join(' '); }
}
globalThis.document = { createElement: tag => new Node(tag), head: new Node('head'), body: new Node('body'), querySelectorAll: () => [] };
const address = '0x4206000000000000000000000000000000000000';
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(resolve => setImmediate(resolve)); };
const nodes = root => [root, ...root.children.flatMap(nodes)];
function setup(search = '?profile&address=' + address) {
  const listeners = new Set(), reads = [], state = { account: null, chainId: null };
  const wallet = { state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async readRecord() { return { tokenId: 2, firstTrack: 1, firstLapMs: 45000, achievements: 7, mintedAt: 1700000000, updatedAt: 1700000000 }; },
    async readBest(_, id) { return { bestMs: id === 3 ? 0 : 45000, verified: true }; },
    async readTrack() { return { qualifyMs: 50000 }; },
    async readLeaderboard(id) { reads.push(id); return [{ address, bestMs: 45000, verified: true }]; },
    async connect() { state.account = address; state.chainId = chain.id; listeners.forEach(fn => fn()); },
    async disconnect() { state.account = null; listeners.forEach(fn => fn()); },
  };
  const client = { getBlockNumber: async () => 0n, getLogs: async () => [], getBlock: async () => ({ timestamp: 1700000000n }) };
  const root = new Node('main'), page = mountProfile(root, { wallet, client, search });
  return { root, page, reads, wallet, listeners };
}
test('访客查看已铸造地址，不连接也读取全部公开数据，28格和榜单共享', async () => {
  const env = setup(); await flush();
  assert.match(env.root.text, /#0002/); assert.match(env.root.text, /45.00 s/);
  assert.equal(nodes(env.root).filter(n => n.attrs['data-achievement']).length, 28);
  assert.equal(nodes(env.root).some(n => n.textContent === '断开连接'), false);
  await env.page.selectTab('leaderboard'); await flush();
  assert.deepEqual(env.reads.sort(), [1, 2, 3]);
  assert.ok(nodes(env.root).some(n => n.tagName === 'a' && n.href?.includes('profile&address=')));
  env.page.destroy(); assert.equal(env.listeners.size, 0);
});
test('无地址连接引导、无效地址提示，连接后切换为本人并可断开', async () => {
  const env = setup('?profile&address=0x4206'); await flush();
  assert.match(env.root.text, /地址格式无效/); assert.match(env.root.text, /连接钱包/);
  await env.wallet.connect(); await flush(); assert.match(env.root.text, /断开连接/);
  await env.wallet.disconnect(); await flush(); assert.doesNotMatch(env.root.text, /#0002/);
  env.page.destroy();
});
test('NFT读取失败不影响成绩和榜单，未铸造依然展示成绩', async () => {
  const env = setup(); env.wallet.readRecord = async () => { throw Error('RPC timeout'); };
  await env.page.refresh(); await flush();
  assert.match(env.root.text, /网络错误/); assert.match(env.root.text, /45.00 s/);
  env.wallet.readRecord = async () => ({ tokenId: 0, achievements: 0 });
  await env.page.refresh(); await flush(); assert.match(env.root.text, /资格线/); assert.match(env.root.text, /45.00 s/);
  env.page.destroy();
});

test('挑战链接在中键或复制链接时也包含目标地址，不依赖点击处理器', async () => {
  const env = setup(); await flush();
  const link = nodes(env.root).find(n => n.tagName === 'a' && n.textContent === '挑战 TA 的影子');
  assert.ok(link.href.includes('ghostAddress=' + address)); env.page.destroy();
});
