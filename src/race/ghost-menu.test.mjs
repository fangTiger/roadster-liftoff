import test from 'node:test';
import assert from 'node:assert/strict';
import def from './track/data/meadow.js';
import lake from './track/data/lakeside.js';
import { setLang } from '../i18n/i18n.js';
import { createRecorder } from './sim/replay.js';
import { trackHash } from './track/build.js';
import * as menu from './menu.js';

class Element {
  children = []; attrs = {}; disabled = false; textContent = ''; hidden = false;
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  replaceChildren(...nodes) { this.children = nodes; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus() { document.activeElement = this; }
  remove() {}
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const address = '0x1234567890123456789012345678901234567890', other = '0x9876567890123456789012345678901234567890';
const recorder = createRecorder(); recorder.record(0);
const replay = { ...recorder.encode({ track: trackHash(def), trackId: 1, laps: 3 }), bestMs: 52345 };
const local = { replay, bestLap: 52.345 };
const entry = { address, bestMs: 50000 };
function setup(overrides = {}) {
  const old = globalThis.document, events = {}, data = new Map(), calls = [], listeners = new Set();
  globalThis.document = { createElement: () => new Element(), querySelectorAll: () => [], addEventListener: (key, fn) => { events[key] = fn; }, removeEventListener: key => { delete events[key]; } };
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const wallet = { state: { account: null }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const fetcher = async url => { calls.push(url); return Response.json(url.includes('address=') ? replay : [entry]); };
  const root = new Element(), options = menu.mountGhostOptions(root, def, { record: null, storage, wallet, fetcher, ...overrides });
  const nodes = () => descendants(root), trigger = nodes().find(node => node.attrs['aria-haspopup'] === 'listbox');
  const choose = key => nodes().find(node => node.attrs['data-value'] === key).onclick();
  return { root, options, nodes, trigger, choose, calls, data, wallet, events, listeners, change(account) { wallet.state = { account }; listeners.forEach(fn => fn()); }, destroy() { options.destroy(); globalThis.document = old; } };
}
test('挂载即预加载，自动第一名，单一控件显示圈速，切换语言保留选择', async () => {
  const env = setup();
  try {
    await env.options.ready;
    assert.equal(env.calls.filter(url => !url.includes('address=')).length, 1);
    assert.deepEqual(env.options.replay, replay); assert.equal(env.options.name, '0x1234…7890');
    assert.equal(env.nodes().filter(node => node.type === 'button' && !node.hidden && node.attrs.role !== 'option').length, 1);
    assert.match(env.trigger.textContent, /影子.*0x1234…7890.*50.000/);
    env.trigger.onclick(); assert.equal(env.trigger.attrs['aria-expanded'], 'true');
    assert.equal(env.nodes().filter(node => node.attrs.role === 'option').length, 3);
    setLang('en'); assert.match(env.trigger.textContent, /Ghost/); assert.deepEqual(env.options.replay, replay);
    env.choose('none'); assert.equal(env.options.replay, null); assert.equal(env.data.get('race.ghost.choice.1'), 'none');
  } finally { setLang('zh'); env.destroy(); }
});
test('本地我的最佳优先，不下载排行榜录像；无效记忆回退，不同地图记忆隔离', async () => {
  const data = new Map([['race.ghost.choice.1', other], ['race.ghost.choice.2', 'none']]);
  const env = setup({ record: local, storage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) } });
  try { await env.options.ready; assert.equal(env.options.replay, replay); assert.match(env.trigger.textContent, /我的最佳.*52.345/); assert.equal(env.calls.length, 1); }
  finally { env.destroy(); }
  const remembered = setup({ record: local, storage: { getItem: () => 'none' } });
  try { await remembered.options.ready; assert.equal(remembered.options.replay, null); assert.match(remembered.trigger.textContent, /无/); }
  finally { remembered.destroy(); }
});
test('共享来源每图只读取一次榜单，前 10 过滤且单条按选择下载', async () => {
  assert.equal(typeof menu.createGhostSource, 'function');
  const calls = [], source = menu.createGhostSource({ fetcher: async url => {
    calls.push(url); return Response.json(url.includes('address=') ? replay : Array.from({ length: 12 }, (_, i) => ({ address: '0x' + String(i + 1).padStart(40, '0'), bestMs: 50000 + i })));
  } });
  const a = setup({ record: local, source });
  try {
    await a.options.ready;
    const second = menu.mountGhostOptions(new Element(), def, { record: local, source, wallet: a.wallet });
    await second.ready; second.destroy();
    assert.equal(calls.length, 1); assert.equal(a.nodes().filter(node => node.attrs.role === 'option').length, 12);
    await a.choose('0x0000000000000000000000000000000000000002');
    assert.equal(calls.length, 2); assert.match(calls[1], /address=/);
    const b = menu.mountGhostOptions(new Element(), lake, { record: local, source, wallet: a.wallet }); await b.ready; b.destroy();
    assert.equal(calls.filter(url => !url.includes('address=')).length, 2);
  } finally { a.destroy(); }
});
test('钱包恢复重新评估自动选择，取回我的已核实录像；手动选择不被覆盖', async () => {
  const env = setup();
  try {
    await env.options.ready; env.change(other); await flush(); await env.options.ready;
    assert.match(env.calls.at(-1), new RegExp('address=' + other)); assert.match(env.trigger.textContent, /我的最佳.*52.345/);
    env.choose('none'); env.change(address); await flush();
    assert.equal(env.options.replay, null); assert.match(env.trigger.textContent, /无/);
    assert.equal(env.listeners.size, 1);
  } finally { env.destroy(); }
});
test('钱包的旧请求不会覆盖切换账户或手动选择', async () => {
  let finish; const env = setup({ fetcher: async url => {
    if (!url.includes('address=')) return Response.json([]);
    return new Promise(resolve => { finish = resolve; });
  } });
  try {
    await env.options.ready; env.change(address); await flush(); env.choose('none');
    finish(Response.json(replay)); await flush(); assert.equal(env.options.replay, null);
  } finally { env.destroy(); }
});
test('列表与下载失败显示状态，坏录像拒绝；重选可重试；下载中发车立即降级', async () => {
  let mode = 'bad'; const env = setup({ record: local, fetcher: async url => {
    if (!url.includes('address=')) return Response.json([entry]);
    if (mode === 'pending') return new Promise(() => {});
    return Response.json(mode === 'bad' ? { ...replay, track: 'bad' } : replay);
  }, timeoutMs: 20 });
  try {
    await env.options.ready; await env.choose(address); assert.equal(env.options.replay, null);
    assert.ok(env.nodes().some(node => /失败/.test(node.textContent)));
    mode = 'ok'; await env.choose(address); assert.deepEqual(env.options.replay, replay);
    mode = 'pending'; await env.choose('none'); void env.choose(address);
    assert.equal(env.options.replay, null); assert.equal(env.options.loading, true);
    assert.equal(env.options.takeReplay(), null); assert.ok(env.nodes().some(node => /无影子/.test(node.textContent)));
  } finally { env.destroy(); }
});
test('键盘打开、方向移动、Enter选择、Esc和点外关闭，存储不可用不阻塞', async () => {
  const env = setup({ record: local, storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
  const key = value => env.trigger.onkeydown({ key: value, preventDefault() {}, stopPropagation() {} });
  try {
    await env.options.ready; key(' '); assert.equal(env.trigger.attrs['aria-expanded'], 'true');
    key('Home'); key('ArrowDown'); key('ArrowDown'); key('Enter'); await env.options.ready;
    assert.equal(env.options.name, '0x1234…7890'); assert.equal(env.trigger.attrs['aria-expanded'], 'false');
    key('Enter'); key('Escape'); assert.equal(env.trigger.attrs['aria-expanded'], 'false');
    env.trigger.onclick(); env.events.pointerdown({ target: new Element() }); assert.equal(env.trigger.attrs['aria-expanded'], 'false');
  } finally { env.destroy(); }
});
test('榜单失败与空榜不阻塞本地最佳或无，接口超时最终结束', async () => {
  const env = setup({ record: local, fetcher: async () => { throw Error('offline'); } });
  try { await env.options.ready; assert.equal(env.options.replay, replay); assert.ok(env.nodes().some(node => /失败/.test(node.textContent))); }
  finally { env.destroy(); }
  const empty = setup({ fetcher: async () => Response.json([]) });
  try { await empty.options.ready; assert.equal(empty.options.replay, null); assert.match(empty.trigger.textContent, /无/); }
  finally { empty.destroy(); }
});

test('榜单仍加载时尊重已记住的无，本地最佳自动就绪不依赖网络', async () => {
  const env = setup({ record: local, storage: { getItem: () => 'none' }, fetcher: () => new Promise(() => {}), timeoutMs: 20 });
  try { assert.equal(env.options.replay, null); assert.match(env.trigger.textContent, /无/); }
  finally { env.destroy(); }
});
test('自动下载期间手动选无仍可在完成后选择我的最佳', async () => {
  let finish; const env = setup({ fetcher: async url => url.includes('address=') ? new Promise(resolve => { finish = resolve; }) : Response.json([]) });
  try {
    await env.options.ready; env.change(address); await flush(); env.choose('none'); finish(Response.json(replay)); await flush();
    const mine = env.nodes().find(node => node.attrs['data-value'] === 'best');
    assert.equal(mine.attrs['aria-disabled'], 'false'); assert.equal(env.options.replay, null);
  } finally { env.destroy(); }
});
test('失效记忆的录像下载失败时回退到本地最佳', async () => {
  const env = setup({ record: local, storage: { getItem: () => address }, fetcher: async url => url.includes('address=') ? Response.json({ error: 'missing' }, { status: 404 }) : Response.json([entry]) });
  try { await env.options.ready; assert.equal(env.options.replay, replay); assert.match(env.trigger.textContent, /我的最佳/); }
  finally { env.destroy(); }
});
test('接口超时后结束加载并回退为无', async () => {
  const env = setup({ fetcher: () => new Promise(() => {}), timeoutMs: 15 });
  try { await env.options.ready; assert.equal(env.options.loading, false); assert.equal(env.options.replay, null); assert.ok(env.nodes().some(node => /失败/.test(node.textContent))); }
  finally { env.destroy(); }
});

test('手动选无后连接钱包只刷新我的来源，不改变手动选择', async () => {
  const env = setup();
  try { await env.options.ready; env.choose('none'); env.change(other); await flush();
    assert.match(env.calls.at(-1), new RegExp('address=' + other));
    assert.equal(env.nodes().find(node => node.attrs['data-value'] === 'best').attrs['aria-disabled'], 'false'); assert.equal(env.options.replay, null);
  } finally { env.destroy(); }
});
test('手动选我的最佳后换账户读取新账户，旧录像不可冒充我的最佳', async () => {
  const newReplay = { ...replay, bestMs: 60000 };
  const env = setup({ fetcher: async url => !url.includes('address=') ? Response.json([]) : Response.json(url.includes(other) ? newReplay : replay) });
  try { await env.options.ready; env.change(address); await flush(); env.choose('best'); env.change(other);
    assert.equal(env.options.replay, null); await flush(); await env.options.ready;
    assert.deepEqual(env.options.replay, newReplay); assert.match(env.trigger.textContent, /60.000/);
  } finally { env.destroy(); }
});
test('自动下载失败后钱包恢复成功清除旧下载错误', async () => {
  const env = setup({ fetcher: async url => !url.includes('address=') ? Response.json([entry]) : url.includes(other) ? Response.json(replay) : Response.json({}, { status: 503 }) });
  try { await env.options.ready; assert.match(env.trigger.textContent, /失败/); env.change(other); await flush(); await env.options.ready;
    assert.deepEqual(env.options.replay, replay); assert.doesNotMatch(env.trigger.textContent, /失败/);
  } finally { env.destroy(); }
});

test('记忆排行榜影子仍加载时不可用本地最佳冒充，快速发车降级为无', async () => {
  const env = setup({ record: local, storage: { getItem: () => address }, fetcher: () => new Promise(() => {}), timeoutMs: 15 });
  try { assert.equal(env.options.replay, null); assert.equal(env.options.loading, true); assert.equal(env.options.takeReplay(), null); }
  finally { env.destroy(); }
});

test('手动我的最佳失效回退后恢复自动模式，后续钱包可重新选择自己的录像', async () => {
  const env = setup();
  try { await env.options.ready; env.change(address); await flush(); env.choose('best');
    env.change(null); await flush(); assert.equal(env.options.name, '0x1234…7890');
    env.change(other); await flush(); await env.options.ready;
    assert.match(env.trigger.textContent, /我的最佳/); assert.deepEqual(env.options.replay, replay);
  } finally { env.destroy(); }
});

test('个人主页可指定榜外影子，下载成功后加入选项并记忆，覆盖本地默认', async () => {
  const env = setup({ record: local, requestedAddress: other });
  try {
    await env.options.ready;
    assert.deepEqual(env.options.replay, replay); assert.equal(env.options.name, '0x9876…7890');
    assert.ok(env.calls.some(url => url.includes('address=' + other)));
    assert.equal(env.data.get('race.ghost.choice.1'), other);
  } finally { env.destroy(); }
});

test('指定影子下载失败不回退其他玩家，保留目标供手动重试且禁止自动发车', async () => {
  let failed = true;
  const env = setup({ record: local, requestedAddress: other, fetcher: async url => {
    if (url.includes('address=') && failed) return new Response('', { status: 503 });
    return Response.json(url.includes('address=') ? replay : [entry]);
  } });
  try {
    await env.options.ready;
    assert.equal(env.options.requestedReady, false); assert.equal(env.options.replay, null);
    assert.match(env.trigger.textContent, /失败/);
    failed = false; await env.choose(other);
    assert.equal(env.options.requestedReady, true); assert.deepEqual(env.options.replay, replay);
  } finally { env.destroy(); }
});

test('指定目标下载中标记加载，不暴露旧本地录像供提前发车', async () => {
  let release;
  const env = setup({ record: local, requestedAddress: other, source: { list: async () => [], replay: () => new Promise(resolve => { release = resolve; }) } });
  try {
    await flush(); assert.equal(env.options.loading, true); assert.equal(env.options.replay, null);
    release(replay); await env.options.ready; assert.equal(env.options.loading, false);
  } finally { env.destroy(); }
});
