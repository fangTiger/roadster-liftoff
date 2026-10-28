import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../track/build.js';
import meadow from '../track/data/meadow.js';
import { createCarState, stepCar } from './physics.js';
import { THROTTLE, BRAKE, LEFT, RIGHT, DRIFT } from './input-bits.js';
// 模拟会开车的玩家：入弯前控速直行，到漂移点按住漂移键并边漂边调（速度方向落后于前方路线就按往弯内的方向键，转多了就松开），
// 车头对准出弯方向时松开漂移；要求全程不撞墙
const track = buildTrack(meadow), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function driftThrough(s0, s1, kmh, lead) {
  const v0 = kmh / 3.6, p = track.at(s0 - 120), c = createCarState({ x: p.x, z: p.z, y: p.y, yaw: Math.atan2(p.tx, p.tz), s: s0 - 120 });
  c.vx = p.tx * v0; c.vz = p.tz * v0; c.near = track.nearest(c.x, c.z);
  let phase = 0, walls = 0;
  for (let i = 0; i < 120 * 12; i++) {
    const n = track.nearest(c.x, c.z, c.near), speed = Math.hypot(c.vx, c.vz); let bits;
    if (phase === 0) { const q = track.at(n.s + 12), e = wrap(Math.atan2(q.x - c.x, q.z - c.z) - c.yaw); bits = (speed > v0 ? BRAKE : THROTTLE) | (e > .02 ? LEFT : e < -.02 ? RIGHT : 0); if (n.s >= s0 - lead) phase = 1; }
    else if (phase === 1) { const out = track.at(s1), aim = track.at(n.s + 18), need = wrap(Math.atan2(aim.x - c.x, aim.z - c.z) - Math.atan2(c.vx, c.vz)); bits = THROTTLE | DRIFT | (need > .02 ? LEFT : 0); if (Math.abs(wrap(Math.atan2(out.tx, out.tz) - c.yaw)) < .05 || n.s > s1 + 20) phase = 2; }
    else { const q = track.at(n.s + 14), e = wrap(Math.atan2(q.x - c.x, q.z - c.z) - c.yaw); bits = THROTTLE | (e > .02 ? LEFT : e < -.02 ? RIGHT : 0); if (n.s > s1 + 60) return walls; }
    walls += stepCar(c, bits, { track, step: i }).filter(e => e.type === 'wall').length;
  }
  return Infinity;
}
const passes = (s0, s1, kmh) => [0, 10, 20, 30, 40, 55, 70].some(lead => driftThrough(s0, s1, kmh, lead) === 0);
test('140 km/h 能漂过简单地图的 90° 弯（半径 70 米），220 km/h 也能', () => {
  assert.ok(passes(420, 530, 140)); assert.ok(passes(420, 530, 220));
});
test('140 km/h 能漂过简单地图的回头弯（半径 45 米）', () => {
  const sec = track.sections[3]; assert.ok(passes(sec.from, sec.to, 140));
});
