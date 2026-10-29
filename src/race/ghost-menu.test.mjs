import test from 'node:test';
import assert from 'node:assert/strict';
import def from './track/data/meadow.js';
import { setLang } from '../i18n/i18n.js';

class Element {
  children = []; attrs = {}; disabled = false; textContent = '';
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attrs[key] = value; }
  remove() {}
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);

test('选图影子默认无、最佳记录可切换且带圈速、无记录与排行榜禁用，切换语言保留选择', async () => {
  const { mountGhostOptions } = await import('./menu.js');
  const previous = globalThis.document, storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {} } });
  globalThis.document = { createElement: () => new Element(), querySelectorAll: () => [] };
  try {
    const empty = new Element(), options = mountGhostOptions(empty, def, { record: null });
    const buttons = descendants(empty).filter(node => node.type === 'button');
    assert.equal(options.replay, null); assert.equal(buttons[1].disabled, true); assert.equal(buttons[2].disabled, true);
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
