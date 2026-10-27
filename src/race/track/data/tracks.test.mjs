import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, DEFAULT_DIFFICULTY } from './index.js';
import { buildTrack } from '../build.js';
import { createSession } from '../../sim/session.js';
import { autopilot } from '../../sim/autopilot.js';
test('三张地图对应三档难度，编号互不相同，默认简单', () => {
  assert.deepEqual(TRACKS.map(t => t.difficulty), ['easy', 'normal', 'hard']);
  assert.equal(new Set(TRACKS.map(t => t.def.id)).size, 3);
  assert.equal(DEFAULT_DIFFICULTY, 'easy');
});
for (const t of TRACKS) test(`${t.label}「${t.def.name.zh}」闭合、检查点齐全，机器人能无重置跑完一圈`, () => {
  const track = buildTrack(t.def), a = track.samples, n = a.length / 7;
  assert.ok(Math.hypot(a[0] - a[(n - 1) * 7], a[1] - a[(n - 1) * 7 + 1]) < 1e-6);
  assert.equal(track.checkpointGates.length, t.def.sections.length);
  const s = createSession(track, { laps: 1 }); let snap = s.snapshot, steps = 0;
  while (!snap.race.finished && steps < 120 * 200) { s.step(autopilot(snap, track)); snap = s.snapshot; steps++; }
  assert.ok(snap.race.finished); assert.equal(snap.events.filter(e => e.type === 'reset').length, 0);
});
