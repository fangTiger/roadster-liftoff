import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track/build.js';
import def from './track/data/meadow.js';
import { createSession } from './sim/session.js';
import { DT } from './sim/physics.js';

test('HUD 领先绿、落后红、约两秒后隐藏，缺失时不显示，完赛显示总时间差', async () => {
  const { createHud } = await import('./hud.js');
  const previous = { document: globalThis.document, innerWidth: globalThis.innerWidth, devicePixelRatio: globalThis.devicePixelRatio };
  const elements = new Map(), context = new Proxy({}, { get: () => () => {} });
  const element = () => ({ style: {}, dataset: {}, getContext: () => context, querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); } });
  globalThis.document = { createElement: element, head: { append() {} }, body: { append() {} } };
  globalThis.innerWidth = 1200; globalThis.devicePixelRatio = 1;
  try {
    const track = buildTrack(def), hud = createHud(track), s = createSession(track).snapshot;
    hud.update(s, { delta: -1.23, deltaStep: 0 });
    const delta = elements.get('.rh-delta');
    assert.equal(delta.textContent, '−1.23'); assert.equal(delta.dataset.tone, 'ahead'); assert.equal(delta.hidden, false);
    hud.update(s, { delta: .85, deltaStep: 0 });
    assert.equal(delta.textContent, '+0.85'); assert.equal(delta.dataset.tone, 'behind');
    hud.update({ ...s, step: Math.ceil(2 / DT) }, { delta: .85, deltaStep: 0 }); assert.equal(delta.hidden, true);
    hud.update(s, { delta: null }); assert.equal(delta.hidden, true);
    hud.update({ ...s, race: { ...s.race, finished: true, bestLap: 50, lapTimes: [50, 51, 52] } }, { totalDelta: -1.23 });
    assert.match(elements.get('.rh-result').innerHTML, /与影子总时间差.*−1.23/);
  } finally { Object.assign(globalThis, previous); }
});
