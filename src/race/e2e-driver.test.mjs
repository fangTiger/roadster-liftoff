import test from 'node:test';
import assert from 'node:assert/strict';
import { createE2eDriver } from './e2e-driver.js';
import { createSession } from './sim/session.js';
import { buildTrack, trackHash } from './track/build.js';
import { TRACKS } from './track/data/index.js';
import { createRecorder } from './sim/replay.js';
import { verifyReplay } from '../../api/_lib/replay.js';

test('开发 hard 驾驶器逐物理步录制三圈，原服务端重放进入 58 秒资格线', () => {
  const def = TRACKS[0].def, track = buildTrack(def), session = createSession(track, { laps: def.laps });
  const drive = createE2eDriver(), recorder = createRecorder();
  for (let step = 0; step < 120 * 240 && !session.race.finished; step++) {
    const bits = drive(session.snapshot, track); recorder.record(bits); session.step(bits);
  }
  assert.equal(session.race.finished, true);
  const replay = recorder.encode({ trackId: 1, track: trackHash(def), laps: def.laps });
  const verified = verifyReplay(replay, { trackId: 1, qualifyMs: 58000 });
  assert.ok(verified.bestLap <= 58, `最快圈 ${verified.bestLap}`);
  assert.ok(verified.bestLap >= 15);
  assert.equal(verified.bestLap, session.race.bestLap);
});
