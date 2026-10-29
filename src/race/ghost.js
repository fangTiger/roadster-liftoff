import { createSession } from './sim/session.js';
import { decode } from './sim/replay.js';
import { trackHash } from './track/build.js';
import { TRACKS } from './track/data/index.js';

// 检查点按「圈数 × 每圈检查点数 + 当前检查点」编号，避免跨圈比较错位。
export function checkpointCount(snapshot) {
  return snapshot.race.sectorTimes.reduce((count, sectors) => count + sectors.length, 0) + snapshot.race.currentSectors.length;
}

export function timeDelta(playerTime, ghostTime) {
  return Number.isFinite(playerTime) && Number.isFinite(ghostTime) ? playerTime - ghostTime : null;
}

// 只比较影子已实际通过的同圈同门，未到时不显示预测差值。
export function checkpointDelta(snapshot, ghost) {
  const count = checkpointCount(snapshot);
  if (!ghost || count === 0 || checkpointCount(ghost.snapshot) < count) return null;
  return timeDelta(snapshot.race.elapsed, ghost.checkpointTimes[count - 1]);
}

export function createGhost(track, replay) {
  const inputs = decode(replay), def = TRACKS.find(entry => entry.def.id === replay.trackId)?.def;
  if (!def || replay.track !== trackHash(def)) throw new Error('影子赛道不匹配');
  const checkpointSteps = [], checkpointTimes = [];
  // 不预演：影子与玩家同步推进，每通过一道检查点就记下当时的模拟计时（预演在困难地图要 1 秒以上）
  const session = createSession(track, { laps: replay.laps });
  let cursor = 0;
  return {
    checkpointSteps, checkpointTimes,
    // 影子完赛后才有总时间
    get totalTime() { return session.race.finished ? session.race.elapsed : null; },
    step() {
      if (cursor >= inputs.length) return;
      session.step(inputs[cursor++]);
      const count = checkpointCount({ race: session.race });
      while (checkpointSteps.length < count) { checkpointSteps.push(cursor); checkpointTimes.push(session.race.elapsed); }
    },
    get snapshot() { return session.snapshot; },
  };
}
