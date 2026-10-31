/** 直接测试生产模块，防止内联副本掩盖实现回归。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatPosition, buildSeatLayout, diffLayouts, extractPlateData } from './garage.js';
// ── 测试辅助数据工厂 ──────────────────────────────────────────────────────

function makeRoom(playerOverrides = []) {
  return {
    code: 'TEST01',
    hostId: 'h1',
    phase: 'lobby',
    mode: 'speed',
    trackId: 1,
    players: playerOverrides,
  };
}

function makePlayer(seat, id, opts = {}) {
  return {
    id, name: `P${id}`, seat,
    color: '#ef5350', ready: false, bot: false,
    difficulty: 'normal', connected: true,
    ...opts,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// seatPosition 测试
// ══════════════════════════════════════════════════════════════════════════

test('seatPosition: 返回 6 个不同坐标', () => {
  const positions = Array.from({ length: 6 }, (_, i) => seatPosition(i));
  const xs = positions.map(p => p.x);
  const unique = new Set(xs.map(x => x.toFixed(4)));
  assert.equal(unique.size, 6, '6 个席位的 X 坐标应各不相同');
});

test('seatPosition: 浅弧等距，展台直径之间保留间隙', () => {
 for(let i=1;i<6;i++) { const a=seatPosition(i-1),b=seatPosition(i);assert.ok(b.x-a.x>5);assert.ok(Math.abs(a.z-b.z)<3); }
});

test('seatPosition: 席位 0 和 5 关于 X 轴对称（左右镜像）', () => {
  const p0 = seatPosition(0);
  const p5 = seatPosition(5);
  assert.ok(Math.abs(p0.x + p5.x) < 0.001, 'X 坐标应对称');
  assert.ok(Math.abs(p0.z - p5.z) < 0.001, 'Z 坐标应相同');
});

test('seatPosition: 位置和朝向均为有限数', () => {
 for(let i=0;i<6;i++) assert.ok(Object.values(seatPosition(i)).every(Number.isFinite));
});

// ══════════════════════════════════════════════════════════════════════════
// buildSeatLayout 测试
// ══════════════════════════════════════════════════════════════════════════

test('buildSeatLayout: room=null 返回全空数组', () => {
  const layout = buildSeatLayout(null, 'x');
  assert.equal(layout.length, 6);
  assert.ok(layout.every(x => x === null));
});

test('buildSeatLayout: 空 players 返回全空', () => {
  const layout = buildSeatLayout(makeRoom([]), 'x');
  assert.ok(layout.every(x => x === null));
});

test('buildSeatLayout: 玩家出现在正确席位', () => {
  const room = makeRoom([
    makePlayer(0, 'p1'),
    makePlayer(3, 'p2'),
    makePlayer(5, 'p3'),
  ]);
  const layout = buildSeatLayout(room, 'p1');
  assert.equal(layout[0]?.id, 'p1');
  assert.equal(layout[1], null);
  assert.equal(layout[3]?.id, 'p2');
  assert.equal(layout[5]?.id, 'p3');
});

test('buildSeatLayout: isSelf 只对 selfId 为 true', () => {
  const room = makeRoom([makePlayer(0, 'me'), makePlayer(1, 'other')]);
  const layout = buildSeatLayout(room, 'me');
  assert.equal(layout[0]?.isSelf, true);
  assert.equal(layout[1]?.isSelf, false);
});

test('buildSeatLayout: isHost 只对 hostId 为 true', () => {
  const room = makeRoom([makePlayer(0, 'h1'), makePlayer(1, 'p2')]);
  room.hostId = 'h1';
  const layout = buildSeatLayout(room, 'p2');
  assert.equal(layout[0]?.isHost, true);
  assert.equal(layout[1]?.isHost, false);
});

test('buildSeatLayout: connected 默认 true，false 时传递', () => {
  const room = makeRoom([
    makePlayer(0, 'p1', { connected: true }),
    makePlayer(1, 'p2', { connected: false }),
  ]);
  const layout = buildSeatLayout(room, 'x');
  assert.equal(layout[0]?.connected, true);
  assert.equal(layout[1]?.connected, false);
});

test('buildSeatLayout: ready 布尔强制转换', () => {
  const room = makeRoom([
    makePlayer(0, 'p1', { ready: 1 }),
    makePlayer(1, 'p2', { ready: 0 }),
  ]);
  const layout = buildSeatLayout(room, 'x');
  assert.equal(layout[0]?.ready, true);
  assert.equal(layout[1]?.ready, false);
});

test('buildSeatLayout: seat 超出范围（< 0 或 >= 6）被忽略', () => {
  const room = makeRoom([
    makePlayer(-1, 'bad1'),
    makePlayer(6, 'bad2'),
    makePlayer(7, 'bad3'),
  ]);
  const layout = buildSeatLayout(room, 'x');
  assert.ok(layout.every(x => x === null), '越界席位应被忽略');
});

test('buildSeatLayout: difficulty 缺省为 normal', () => {
  const p = makePlayer(0, 'p1');
  delete p.difficulty;
  const room = makeRoom([p]);
  const layout = buildSeatLayout(room, 'x');
  assert.equal(layout[0]?.difficulty, 'normal');
});

// ══════════════════════════════════════════════════════════════════════════
// diffLayouts 测试
// ══════════════════════════════════════════════════════════════════════════

const empty6 = () => Array(6).fill(null);

test('diffLayouts: 两个全空布局无变化', () => {
  const diff = diffLayouts(empty6(), empty6());
  assert.deepEqual(diff, { added: [], removed: [], changed: [] });
});

test('diffLayouts: 新增一个玩家', () => {
  const prev = empty6();
  const next = empty6();
  next[2] = { id: 'p1', color: '#fff', ready: false, connected: true, name: 'A', isHost: false, isSelf: false, bot: false, difficulty: 'normal' };
  const diff = diffLayouts(prev, next);
  assert.deepEqual(diff.added, [2]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
});

test('diffLayouts: 移除一个玩家', () => {
  const prev = empty6();
  prev[3] = { id: 'p1', color: '#fff', ready: false, connected: true, name: 'A', isHost: false, isSelf: false, bot: false, difficulty: 'normal' };
  const diff = diffLayouts(prev, empty6());
  assert.deepEqual(diff.removed, [3]);
  assert.deepEqual(diff.added, []);
});

test('diffLayouts: 颜色变化 = 移除 + 添加', () => {
  const makeEntry = (color) => ({ id: 'p1', color, ready: false, connected: true, name: 'A', isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6(); prev[1] = makeEntry('#ff0000');
  const next = empty6(); next[1] = makeEntry('#00ff00');
  const diff = diffLayouts(prev, next);
  assert.ok(diff.removed.includes(1));
  assert.ok(diff.added.includes(1));
  assert.deepEqual(diff.changed, []);
});

test('diffLayouts: id 变化 = 移除 + 添加', () => {
  const make = (id) => ({ id, color: '#fff', ready: false, connected: true, name: 'X', isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6(); prev[0] = make('old');
  const next = empty6(); next[0] = make('new');
  const diff = diffLayouts(prev, next);
  assert.ok(diff.removed.includes(0));
  assert.ok(diff.added.includes(0));
});

test('diffLayouts: ready 变化 = changed', () => {
  const make = (ready) => ({ id: 'p1', color: '#fff', ready, connected: true, name: 'A', isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6(); prev[4] = make(false);
  const next = empty6(); next[4] = make(true);
  const diff = diffLayouts(prev, next);
  assert.deepEqual(diff.changed, [4]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
});

test('diffLayouts: connected 变化 = changed', () => {
  const make = (connected) => ({ id: 'p1', color: '#fff', ready: false, connected, name: 'A', isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6(); prev[5] = make(true);
  const next = empty6(); next[5] = make(false);
  const diff = diffLayouts(prev, next);
  assert.deepEqual(diff.changed, [5]);
});

test('diffLayouts: 名字变化 = changed', () => {
  const make = (name) => ({ id: 'p1', color: '#fff', ready: false, connected: true, name, isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6(); prev[2] = make('Alice');
  const next = empty6(); next[2] = make('Bob');
  const diff = diffLayouts(prev, next);
  assert.deepEqual(diff.changed, [2]);
});

test('diffLayouts: 同一布局对比自身无变化', () => {
  const layout = empty6();
  layout[0] = { id: 'p1', color: '#fff', ready: true, connected: true, name: 'A', isHost: true, isSelf: false, bot: false, difficulty: 'hard' };
  layout[3] = { id: 'p2', color: '#f00', ready: false, connected: true, name: 'B', isHost: false, isSelf: true, bot: false, difficulty: 'normal' };
  const diff = diffLayouts(layout, layout);
  assert.deepEqual(diff, { added: [], removed: [], changed: [] });
});

test('diffLayouts: 多个席位同时变化', () => {
  const make = (id, seat) => ({ id, color: '#aaa', ready: false, connected: true, name: 'X', isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6();
  prev[0] = make('a', 0); prev[2] = make('b', 2); prev[4] = make('c', 4);
  const next = empty6();
  next[1] = make('d', 1); next[2] = make('b', 2); next[5] = make('e', 5);
  const diff = diffLayouts(prev, next);
  // 席位 0, 4 移除；席位 1, 5 添加；席位 2 不变
  assert.ok(diff.removed.includes(0));
  assert.ok(diff.removed.includes(4));
  assert.ok(diff.added.includes(1));
  assert.ok(diff.added.includes(5));
  assert.deepEqual(diff.changed, []);
});

// ══════════════════════════════════════════════════════════════════════════
// extractPlateData 测试
// ══════════════════════════════════════════════════════════════════════════

test('extractPlateData: null 输入返回 null', () => {
  assert.equal(extractPlateData(null, k => k), null);
});

test('extractPlateData: 基本字段正确传递', () => {
  const data = {
    id: 'p1', name: '骑士', color: '#ef5350', ready: true,
    bot: false, difficulty: 'hard', connected: true,
    isHost: true, isSelf: false,
  };
  const plate = extractPlateData(data, k => k);
  assert.equal(plate.name, '骑士');
  assert.equal(plate.isHost, true);
  assert.equal(plate.isSelf, false);
  assert.equal(plate.isBot, false);
  assert.equal(plate.difficulty, 'hard');
  assert.equal(plate.ready, true);
  assert.equal(plate.connected, true);
  assert.equal(plate.color, '#ef5350');
});

test('extractPlateData: 名字缺失时回退到 room.emptySeat', () => {
  const data = {
    id: 'p1', name: '', color: '#fff', ready: false,
    bot: false, difficulty: 'normal', connected: true,
    isHost: false, isSelf: false,
  };
  const plate = extractPlateData(data, k => `[${k}]`);
  assert.equal(plate.name, '[room.emptySeat]');
});

test('extractPlateData: bot 标志正确传递', () => {
  const data = {
    id: 'bot1', name: 'Bot', color: '#c58aff', ready: true,
    bot: true, difficulty: 'easy', connected: true,
    isHost: false, isSelf: false,
  };
  const plate = extractPlateData(data, k => k);
  assert.equal(plate.isBot, true);
  assert.equal(plate.difficulty, 'easy');
});

test('extractPlateData: t 函数未传入时用 key 回退', () => {
  const data = {
    id: 'p1', name: '', color: '#fff', ready: false,
    bot: false, difficulty: 'normal', connected: true,
    isHost: false, isSelf: false,
  };
  // 不传 t（undefined），extractPlateData 内部应回退到键名字符串
  const plate = extractPlateData(data, undefined);
  assert.equal(plate.name, 'room.emptySeat');
});

// ══════════════════════════════════════════════════════════════════════════
// 边界条件
// ══════════════════════════════════════════════════════════════════════════

test('buildSeatLayout: 6 个玩家全满席位', () => {
  const players = Array.from({ length: 6 }, (_, i) => makePlayer(i, `p${i}`));
  const room = makeRoom(players);
  const layout = buildSeatLayout(room, 'p0');
  assert.equal(layout.filter(Boolean).length, 6);
  for (let i = 0; i < 6; i++) assert.equal(layout[i]?.id, `p${i}`);
});

test('buildSeatLayout: 同席位两个玩家，后来者覆盖', () => {
  // 实际游戏不应出现此情况，但模块不应崩溃
  const room = makeRoom([
    makePlayer(2, 'first'),
    makePlayer(2, 'second'),
  ]);
  const layout = buildSeatLayout(room, 'x');
  // 后来者覆盖
  assert.equal(layout[2]?.id, 'second');
});

test('diffLayouts: 全部 6 个席位同时添加', () => {
  const make = (i) => ({ id: `p${i}`, color: '#fff', ready: false, connected: true, name: `P${i}`, isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = empty6();
  const next = Array.from({ length: 6 }, (_, i) => make(i));
  const diff = diffLayouts(prev, next);
  assert.deepEqual(diff.added.sort(), [0,1,2,3,4,5]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
});

test('diffLayouts: 全部 6 个席位同时移除', () => {
  const make = (i) => ({ id: `p${i}`, color: '#fff', ready: false, connected: true, name: `P${i}`, isHost: false, isSelf: false, bot: false, difficulty: 'normal' });
  const prev = Array.from({ length: 6 }, (_, i) => make(i));
  const diff = diffLayouts(prev, empty6());
  assert.deepEqual(diff.removed.sort(), [0,1,2,3,4,5]);
  assert.deepEqual(diff.added, []);
});

test('房主展台名牌显示房主，准备状态只用于其他玩家，断线仍标记断线',()=>{
 const base={name:'甲',isHost:true,connected:true,ready:false};
 for(const ready of [true,false])assert.equal(extractPlateData({...base,ready},key=>key).status,'room.host');
 assert.equal(extractPlateData({...base,isHost:false,ready:true},key=>key).status,'room.readyState');
 assert.equal(extractPlateData({...base,isHost:false},key=>key).status,'room.waiting');
 assert.equal(extractPlateData({...base,connected:false},key=>key).status,'room.disconnected');
});
