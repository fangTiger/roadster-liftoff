import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAchievements } from './achievements.js';
import { achievementsToBits } from '../chain/records.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {} } });
const clean = { clean: true, driftBoost3: 0, canyonJump: false, slotPass: false, saltTopKmh: 0 };
const snap = (time, stats = clean) => ({ events: [{ type: 'lap', lap: 1, time }], stats: clean, completedStats: [stats], race: { lapTimes: [time] } });
test('保留旧位序，竞速八项占位20到27且与旧成就合并', () => {
 const a = createAchievements();
 assert.equal(a.total, 28);
 a.report('drive_start');
 a.reportRace(snap(47, { ...clean, driftBoost3: 3, canyonJump: true, slotPass: true, saltTopKmh: 300 }), { difficulty: 'easy', qualifyMs: 47000 });
 assert.equal(achievementsToBits(a.list()), 0xff00001);
 assert.deepEqual(a.list().slice(20).map(x => x.index), [21,22,23,24,25,26,27,28]);
});
test('资格线包含等号，高手线不含等号；失败圈不解锁零失误', () => {
 const a = createAchievements();
 a.reportRace(snap(52, { ...clean, clean: false, driftBoost3: 2, saltTopKmh: 299.99 }), { difficulty: 'normal', qualifyMs: 52000 });
 assert.deepEqual(a.list().filter(x => x.unlocked).map(x => x.id), ['first_lap','qualified']);
});
test('比赛中从stats解锁机关与漂移，跨圈不累计且重复快照不重复解锁', () => {
 const a = createAchievements(); let count = 0; a.onUnlock(() => count++);
 const s = { events: [], stats: { ...clean, canyonJump: true, slotPass: true, driftBoost3: 3, saltTopKmh: 300 }, completedStats: [], race: { lapTimes: [] } };
 a.reportRace(s, { difficulty: 'hard', qualifyMs: 0 }); a.reportRace(s, { difficulty: 'hard', qualifyMs: 0 });
 assert.equal(count, 4);
 const b = createAchievements(); b.reportRace({ ...snap(100, { ...clean, driftBoost3: 2 }), stats: { ...clean, driftBoost3: 1 } }, { difficulty: 'hard', qualifyMs: 0 });
 assert.equal(b.list().find(x => x.id === 'drift_king').unlocked, false);
 assert.equal(b.list().find(x => x.id === 'qualified').unlocked, false);
});

test('计圈事件携带的圈号和用时配对完成圈统计，单独事件也能解锁', () => {
 const a = createAchievements();
 a.reportRace({ events: [{ type: 'lap', lap: 1, time: 47 }], stats: clean, completedStats: [clean] }, { difficulty: 'easy', qualifyMs: 60000 });
 assert.deepEqual(a.list().filter(x => x.unlocked).map(x => x.id), ['first_lap','qualified','clean_lap','pro_lap']);
});
