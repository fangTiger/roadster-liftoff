import test from 'node:test';
import assert from 'node:assert/strict';
import def from './track/data/meadow.js';
import { buildTrack, trackHash } from './track/build.js';
import { createSession } from './sim/session.js';
import { autopilot } from './sim/autopilot.js';
import { createRecorder, decode, stateHash } from './sim/replay.js';
import { DT } from './sim/physics.js';
import { RESET } from './sim/input-bits.js';

const track = buildTrack(def), original = createSession(track, { laps: def.laps }), recorder = createRecorder(), hashes = [], inputs = [];
while (!original.snapshot.race.finished && inputs.length < 43200) {
  const bits = autopilot(original.snapshot, track);
  inputs.push(bits); recorder.record(bits); original.step(bits); hashes.push(stateHash(original.snapshot));
}
assert.ok(original.snapshot.race.finished);
const replay = recorder.encode({ track: trackHash(def), trackId: def.id, laps: def.laps });
const bestLap = original.snapshot.race.bestLap;
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('录像写入地图编号，缺失或非法编号无法解码', () => {
  assert.equal(replay.trackId, def.id);
  assert.deepEqual(decode(replay), inputs);
  for (const trackId of [undefined, null, 0, 4, '1']) assert.throws(() => decode({ ...replay, trackId }));
});

test('影子按步重放与原局逐位一致，结束后固定，玩家会话保持独立', async () => {
  const { createGhost } = await import('./ghost.js');
  const ghost = createGhost(track, replay), player = createSession(track, { laps: def.laps }), reference = createSession(track, { laps: def.laps });
  assert.equal(ghost.totalTime, null); assert.equal(ghost.checkpointSteps.length, 0);   // 不预演：跑之前没有分段
  for (let i = 0; i < inputs.length; i++) {
    ghost.step(); reference.step(inputs[i]);
    assert.deepEqual(ghost.snapshot, reference.snapshot, `第 ${i + 1} 步状态不一致`);
    assert.equal(stateHash(ghost.snapshot), hashes[i], `第 ${i + 1} 步不一致`);
  }
  const final = ghost.snapshot;
  ghost.step(); ghost.step();
  assert.deepEqual(ghost.snapshot, final);
  assert.equal(player.snapshot.step, 0);
  assert.equal(ghost.checkpointSteps.length, track.checkpointGates.length * def.laps);
  assert.equal(ghost.checkpointSteps.at(-1), inputs.length);
  assert.equal(ghost.totalTime, original.snapshot.race.elapsed);
  assert.equal(ghost.checkpointTimes.at(-1), original.snapshot.race.elapsed);
});

test('检查点时间差：领先、落后、持平、影子未到；步数以固定步长换算', async () => {
  const { timeDelta, createGhost } = await import('./ghost.js');
  assert.equal(timeDelta(10, 11.23).toFixed(2), '-1.23');
  assert.equal(timeDelta(10.85, 10).toFixed(2), '0.85');
  assert.equal(timeDelta(10, 10), 0);
  assert.equal(timeDelta(10, undefined), null);
  assert.equal(timeDelta(10, null), null);
  const ghost = createGhost(track, replay); for (let i = 0; i < inputs.length; i++) ghost.step();
  assert.ok(ghost.checkpointSteps.length > 0);
  ghost.checkpointSteps.forEach((step, i) => assert.ok(Math.abs(ghost.checkpointTimes[i] - (step - 360) * DT) < 1e-8));
});

test('真实检查点比较：影子未到时隐藏，通过后按同圈同门比较', async () => {
  const { checkpointDelta, createGhost } = await import('./ghost.js');
  // 先用一个跑完的影子拿到分段步数，再用新影子逐步比较
  const done = createGhost(track, replay); for (let i = 0; i < inputs.length; i++) done.step();
  const ghost = createGhost(track, replay), reference = createSession(track, { laps: def.laps });
  const firstStep = done.checkpointSteps[0];
  for (let i = 0; i < firstStep; i++) reference.step(inputs[i]);
  const snapshot = reference.snapshot;
  assert.equal(checkpointDelta(snapshot, ghost), null);
  for (let i = 0; i < firstStep; i++) ghost.step();
  assert.equal(checkpointDelta(snapshot, ghost), 0);
  assert.equal(checkpointDelta({ ...snapshot, race: { ...snapshot.race, elapsed: snapshot.race.elapsed - 1.23 } }, ghost).toFixed(2), '-1.23');
  assert.equal(checkpointDelta({ ...snapshot, race: { ...snapshot.race, elapsed: snapshot.race.elapsed + .85 } }, ghost).toFixed(2), '0.85');
  for (let i = firstStep; i < done.checkpointSteps[track.checkpointGates.length]; i++) reference.step(inputs[i]);
  assert.equal(checkpointDelta(reference.snapshot, ghost), null);
});

test('影子拒绝其他地图与损坏录像，未完赛录像没有总时间', async () => {
  const { createGhost } = await import('./ghost.js');
  assert.throws(() => createGhost(track, { ...replay, trackId: 2 }));
  assert.throws(() => createGhost(track, { ...replay, track: 'bad' }));
  assert.throws(() => createGhost(track, { ...replay, data: '!' }));
  // 未完赛录像：可以创建，但跑完后没有总时间
  const short = createRecorder(); short.record(0);
  const partial = createGhost(track, short.encode({ track: trackHash(def), trackId: def.id, laps: def.laps })); partial.step(); partial.step();
  assert.equal(partial.totalTime, null);
});

test('按地图保存整局、最快圈和日期，仅更快时覆盖，损坏记录当作没有', async () => {
  const { saveBestGhost, readBestGhost } = await import('./ghost-store.js');
  const storage = memoryStorage(), date = '2026-10-29T00:00:00.000Z';
  assert.equal(saveBestGhost(def, replay, bestLap, { storage, date }), true);
  assert.deepEqual(readBestGhost(def, storage), { replay, bestLap, date });
  assert.ok(storage.getItem(`race.ghost.${def.id}`));
  assert.equal(saveBestGhost(def, replay, bestLap, { storage, date: '2026-10-30T00:00:00.000Z' }), false);
  assert.equal(saveBestGhost(def, replay, bestLap + 1, { storage }), false);
  assert.equal(readBestGhost({ ...def, id: 2 }, storage), null);
  const valid = storage.getItem(`race.ghost.${def.id}`);
  for (const bad of ['{', 'null', '{}', JSON.stringify({ replay: { ...replay, track: 'bad' }, bestLap, date }), JSON.stringify({ replay, bestLap: -1, date }), JSON.stringify({ replay, bestLap, date: 'bad' })]) {
    storage.setItem(`race.ghost.${def.id}`, bad);
    assert.equal(readBestGhost(def, storage), null);
  }
  storage.setItem(`race.ghost.${def.id}`, valid);
});

test('更快的有效录像替换较慢的整局录像，未完赛和损坏输入不能保存', async () => {
  const { saveBestGhost, readBestGhost } = await import('./ghost-store.js');
  const storage = memoryStorage(), slow = createSession(track, { laps: def.laps }), recording = createRecorder(), resetLaps = new Set();
  for (let i = 0; i < 43200 && !slow.snapshot.race.finished; i++) {
    const snapshot = slow.snapshot;
    let bits = autopilot(snapshot, track);
    if (!snapshot.race.frozen && !resetLaps.has(snapshot.race.lap)) { resetLaps.add(snapshot.race.lap); bits = RESET; }
    recording.record(bits); slow.step(bits);
  }
  assert.ok(slow.snapshot.race.finished); assert.ok(slow.snapshot.race.bestLap > bestLap);
  const slower = recording.encode({ track: trackHash(def), trackId: def.id, laps: def.laps });
  assert.equal(saveBestGhost(def, slower, slow.snapshot.race.bestLap, { storage }), true);
  assert.equal(saveBestGhost(def, replay, bestLap, { storage }), true);
  assert.deepEqual(readBestGhost(def, storage).replay, replay);
  const emptyStorage = memoryStorage(), unfinished = createRecorder(); unfinished.record(0);
  assert.equal(saveBestGhost(def, unfinished.encode({ track: trackHash(def), trackId: def.id, laps: def.laps }), 1, { storage: emptyStorage }), false);
  assert.equal(saveBestGhost(def, { ...replay, data: '!' }, bestLap, { storage: emptyStorage }), false);
  assert.equal(emptyStorage.getItem(`race.ghost.${def.id}`), null);
});

test('本地存储不可用、读取拒绝、配额写满时均不抛错', async () => {
  const { saveBestGhost, readBestGhost } = await import('./ghost-store.js');
  const blocked = { getItem() { throw new Error('禁止读取'); }, setItem() { throw new Error('禁止写入'); } };
  assert.equal(readBestGhost(def, blocked), null);
  assert.equal(saveBestGhost(def, replay, bestLap, { storage: blocked }), false);
  assert.equal(saveBestGhost(def, replay, bestLap, { storage: { getItem: () => null, setItem() { throw new Error('配额已满'); } } }), false);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('存储不可用'); } });
  try {
    assert.equal(readBestGhost(def), null);
    assert.equal(saveBestGhost(def, replay, bestLap), false);
  } finally { delete globalThis.localStorage; }
});
