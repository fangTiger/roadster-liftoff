import { decode, runReplay } from './sim/replay.js';
import { trackHash } from './track/build.js';

function validateRecord(def, record) {
  if (!record || !Number.isFinite(record.bestLap) || record.bestLap <= 0 || typeof record.date !== 'string' || !Number.isFinite(Date.parse(record.date))) return false;
  const replay = record.replay;
  if (!replay || replay.trackId !== def.id || replay.track !== trackHash(def) || replay.laps !== def.laps) return false;
  decode(replay);
  return runReplay(def, replay).bestLap === record.bestLap;
}

export function readBestGhost(def, storage) {
  try {
    const record = JSON.parse((storage ?? globalThis.localStorage).getItem(`race.ghost.${def.id}`));
    return validateRecord(def, record) ? record : null;
  } catch { return null; }
}

export function saveBestGhost(def, replay, bestLap, { storage, date } = {}) {
  try {
    const target = storage ?? globalThis.localStorage, previous = readBestGhost(def, target);
    if (previous && bestLap >= previous.bestLap) return false;
    const record = { replay, bestLap, date: date ?? new Date().toISOString() };
    if (!validateRecord(def, record)) return false;
    target.setItem(`race.ghost.${def.id}`, JSON.stringify(record));
    return true;
  } catch { return false; }
}
