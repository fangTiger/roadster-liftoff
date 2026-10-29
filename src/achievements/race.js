// 高手线按秒配置，与链上的资格线独立。
export const PRO_LAP_SECONDS = { easy: 48, normal: 52, hard: 90 };
export const RACE_ACHIEVEMENTS = ['first_lap', 'qualified', 'canyon_jump', 'slot_pass', 'clean_lap', 'drift_king', 'valley_speed', 'pro_lap'];

// 浏览器与服务器共用判定；当前圈只授予机关成就，完成圈由事件配对统计。
export function raceAchievements({ stats = {}, completedStats = [], events = [] }, { difficulty, qualifyMs } = {}) {
  const unlocked = new Set();
  for (const value of [stats, ...completedStats]) {
    if (value.canyonJump) unlocked.add('canyon_jump');
    if (value.slotPass) unlocked.add('slot_pass');
    if (value.driftBoost3 >= 3) unlocked.add('drift_king');
    if (value.saltTopKmh >= 300) unlocked.add('valley_speed');
  }
  for (const { lap, time } of events.filter(event => event.type === 'lap')) {
    unlocked.add('first_lap');
    if (Number(qualifyMs) > 0 && time * 1000 <= Number(qualifyMs)) unlocked.add('qualified');
    if (completedStats[lap - 1]?.clean) unlocked.add('clean_lap');
    if (time < PRO_LAP_SECONDS[difficulty]) unlocked.add('pro_lap');
  }
  return RACE_ACHIEVEMENTS.filter(id => unlocked.has(id));
}
export function raceAchievementBits(snapshot, options) {
  return raceAchievements(snapshot, options).reduce((bits, id) => bits | (1 << (20 + RACE_ACHIEVEMENTS.indexOf(id))), 0);
}
