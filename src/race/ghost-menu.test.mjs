import test from 'node:test';
import assert from 'node:assert/strict';
import def from './track/data/meadow.js';
import { setLang } from '../i18n/i18n.js';

class Element {
  children = []; attrs = {}; disabled = false; textContent = '';
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attrs[key] = value; }
  replaceChildren(...nodes) { this.children = nodes; }
  remove() {}
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);

test('选图影子默认无、最佳记录可切换且带圈速、无记录禁用本地最佳且排行榜可加载，切换语言保留选择', async () => {
  const { mountGhostOptions } = await import('./menu.js');
  const previous = globalThis.document, storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {} } });
  globalThis.document = { createElement: () => new Element(), querySelectorAll: () => [] };
  try {
    const empty = new Element(), options = mountGhostOptions(empty, def, { record: null });
    const buttons = descendants(empty).filter(node => node.type === 'button');
    assert.equal(options.replay, null); assert.equal(buttons[1].disabled, true); assert.equal(buttons[2].disabled, false);
    options.destroy();
    const container = new Element(), replay = { trackId: 1 };
    const best = mountGhostOptions(container, def, { record: { replay, bestLap: 52.345 } });
    const choices = descendants(container).filter(node => node.type === 'button');
    assert.match(choices[1].textContent, /我的最佳.*52.345/);
    choices[1].onclick(); assert.equal(best.replay, replay);
    setLang('en'); assert.match(choices[1].textContent, /My best/); assert.equal(best.replay, replay);
    choices[0].onclick(); assert.equal(best.replay, null);
    best.destroy();
  } finally { setLang('zh'); globalThis.document = previous; if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor); else delete globalThis.localStorage; }
});

test('排行榜影子按需列出、选择后下载录像并显示钱包缩写，下载失败可重试', async () => {
  const { mountGhostOptions } = await import('./menu.js');
  const { createRecorder } = await import('./sim/replay.js');
  const { trackHash } = await import('./track/build.js');
  const recorder = createRecorder(); recorder.record(0);
  const replay = recorder.encode({ track: trackHash(def), trackId: 1, laps: 3 });
  const old = globalThis.document; globalThis.document = { createElement: () => new Element() };
  try {
    const root = new Element(), calls = []; let failed = true;
    const address = '0x1234567890123456789012345678901234567890';
    const options = mountGhostOptions(root, def, { record: null, fetcher: async url => {
      calls.push(url);
      if (!url.includes('address=')) return Response.json([{ address, bestMs: 50000, url: 'https://blob.example/tape.json' }]);
      return failed ? Response.json({ error: '录像下载失败' }, { status: 503 }) : Response.json(replay);
    } });
    const buttons = () => descendants(root).filter(node => node.type === 'button');
    assert.equal(buttons()[2].disabled, false);
    await buttons()[2].onclick(); assert.match(calls[0], /trackId=1/);
    const ranked = buttons().find(node => /0x1234…7890/.test(node.textContent)); assert.ok(ranked);
    await ranked.onclick(); assert.equal(options.replay, null); assert.ok(descendants(root).some(node => /录像下载失败/.test(node.textContent)));
    failed = false; await ranked.onclick(); assert.deepEqual(options.replay, replay); assert.equal(options.name, '0x1234…7890');
    assert.match(calls[1], /trackId=1&address=0x1234/);
    buttons()[0].onclick(); assert.equal(options.replay, null); options.destroy();
  } finally { globalThis.document = old; }
});

test('影子下载完成前改选无，旧请求不会恢复影子', async () => {
  const { mountGhostOptions } = await import('./menu.js');
  const old = globalThis.document; globalThis.document = { createElement: () => new Element() };
  try {
    let finish; const root = new Element();
    const options = mountGhostOptions(root, def, { record: null, fetcher: async url => url.includes('address=') ? new Promise(resolve => { finish = resolve; }) : Response.json([{ address: '0x1234567890123456789012345678901234567890', bestMs: 50000 }]) });
    let buttons = () => descendants(root).filter(node => node.type === 'button');
    await buttons()[2].onclick(); const pending = buttons()[3].onclick(); buttons()[0].onclick();
    finish(Response.json({ trackId: 1 })); await pending; assert.equal(options.replay, null); options.destroy();
  } finally { globalThis.document = old; }
});

test('取消下载后发车无需等待已取消的网络请求', async () => {
  const { mountGhostOptions } = await import('./menu.js');
  const old = globalThis.document; globalThis.document = { createElement: () => new Element() };
  try {
    const root = new Element();
    const options = mountGhostOptions(root, def, { record: null, fetcher: async url => url.includes('address=') ? new Promise(() => {}) : Response.json([{ address: '0x1234567890123456789012345678901234567890', bestMs: 50000 }]) });
    const buttons = () => descendants(root).filter(node => node.type === 'button');
    await buttons()[2].onclick(); void buttons()[3].onclick(); buttons()[0].onclick();
    assert.equal(await Promise.race([options.ready.then(() => 'ready'), new Promise(resolve => setImmediate(() => resolve('pending')))]), 'ready');
    options.destroy();
  } finally { globalThis.document = old; }
});
