// 只接受游戏模拟时间：暂停和后台停帧时不会额外累计。
export function createRoundTrip() {
  let elapsed = null, best = null, last = null;
  return {
    onMode(prev, next) {
      if (prev === 'drive' && next === 'ascent') elapsed = 0;
    },
    tick(dt) { if (elapsed != null && Number.isFinite(dt) && dt > 0) elapsed += dt; },
    onEvent(name) {
      if (name === 'ascent_abort') elapsed = null;
      if (name === 'reentry_home' && elapsed != null) {
        last = Math.round(elapsed * 1000);
        best = best == null ? last : Math.min(best, last);
        elapsed = null;
      }
    },
    get best() { return best; },
    get last() { return last; },
  };
}
