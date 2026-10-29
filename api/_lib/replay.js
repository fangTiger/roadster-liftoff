import { runReplay } from '../../src/race/sim/replay.js';
import { TRACKS } from '../../src/race/track/data/index.js';
import { raceAchievementBits } from '../../src/achievements/race.js';

export const MAX_REPLAY_STEPS = 3 * 300 * 120 + 3 * 120;
export function verifyReplay(replay, { trackId = replay?.trackId, qualifyMs = 0 } = {}) {
  const entry = TRACKS.find(value => value.def.id === trackId);
  if (!entry || !replay || replay.trackId !== trackId || replay.laps !== 3 || !Number.isInteger(replay.steps) || replay.steps <= 0 || replay.steps > MAX_REPLAY_STEPS) throw new Error('录像地图、圈数或长度无效');
  const result = runReplay(entry.def, replay, { includeStats: true });
  if (result.lapTimes.length !== 3 || result.lapTimes.some(time => !Number.isFinite(time) || time <= 0 || time > 300)) throw new Error('录像圈速超出范围');
  return { ...result, achievements: raceAchievementBits(result, { difficulty: entry.difficulty, qualifyMs }) };
}
