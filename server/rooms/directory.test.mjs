/**
 * directory.test.mjs — 房间目录纯逻辑单元测试
 * 运行方式：node --test server/rooms/directory.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDirectory } from './directory.js';

// ── 快速 hash/verify（不走 scrypt，测试专用） ─────────────────────────────────

function makeInstantCrypto() {
  // 存储格式与真实版相同前缀，但用简单 hex 替代，测试专用
  async function hash(pw) { return `scrypt$aabbcc$${Buffer.from(pw).toString('hex')}`; }
  async function verify(pw, stored) {
    if (!stored?.startsWith('scrypt$')) return false;
    const parts = stored.split('$');
    return Buffer.from(pw).toString('hex') === parts[2];
  }
  return { hash, verify };
}

// ── 工厂辅助 ──────────────────────────────────────────────────────────────────

function makeDir(opts = {}) {
  const { hash, verify } = makeInstantCrypto();
  return createDirectory({ hash, verify, ...opts });
}

function makeRoom(overrides = {}) {
  return {
    code: 'ABCD12',
    name: '测试房间',
    locked: false,
    passwordHash: null,
    hostId: 'h1',
    trackId: 1,
    mode: 'speed',
    phase: 'lobby',
    players: [
      { id: 'h1', name: '房主', bot: false, connected: true },
    ],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// validateCreate
// ══════════════════════════════════════════════════════════════════════════════

test('validateCreate: 普通公开房间', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: '我的赛车房', locked: false });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, '我的赛车房');
  assert.equal(r.value.locked, false);
  assert.equal(r.value.passwordHash, null);
});

test('validateCreate: 加锁 + 合法密码', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: '密室', locked: true, password: '1234' });
  assert.equal(r.ok, true);
  assert.equal(r.value.locked, true);
  assert.ok(r.value.passwordHash, '应有 passwordHash');
  assert.ok(r.value.passwordHash.startsWith('scrypt$'), 'hash 格式正确');
});

test('validateCreate: 加锁 + 密码不是 4 位数字 → BAD_PASSWORD', async () => {
  const dir = makeDir();
  for (const bad of ['abc', '12345', '123', '', 'abcd', '12 4']) {
    const r = await dir.validateCreate({ name: 'x', locked: true, password: bad });
    assert.equal(r.ok, false, `密码 "${bad}" 应被拒绝`);
    assert.equal(r.code, 'BAD_PASSWORD');
  }
});

test('validateCreate: locked 非 boolean → BAD_LOCKED', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: 'x', locked: 'yes' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_LOCKED');
});

test('validateCreate: 名称包含控制字符被清理', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: 'AB\u0000\u001FCD', locked: false });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'ABCD');
});

test('validateCreate: 名称超过 20 个代码点被截断', async () => {
  const dir = makeDir();
  // 21 个汉字
  const long = '甲'.repeat(21);
  const r = await dir.validateCreate({ name: long, locked: false });
  assert.equal(r.ok, true);
  assert.equal([...r.value.name].length, 20);
});

test('validateCreate: 名称全是空白 → 返回空字符串', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: '   ', locked: false });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, '');
});

test('validateCreate: undefined 名称 → 返回空字符串', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: undefined, locked: false });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, '');
});

test('validateCreate: 未加锁时 password 被忽略', async () => {
  const dir = makeDir();
  const r = await dir.validateCreate({ name: 'open', locked: false, password: '9999' });
  assert.equal(r.ok, true);
  assert.equal(r.value.passwordHash, null);
});

// ══════════════════════════════════════════════════════════════════════════════
// summary — 不暴露密码
// ══════════════════════════════════════════════════════════════════════════════

test('summary: 绝不包含 scrypt 或 password 字段', () => {
  const dir = makeDir();
  const room = makeRoom({ locked: true, passwordHash: 'scrypt$aabb$1234' });
  const s = dir.summary(room);
  const json = JSON.stringify(s);
  assert.ok(!json.includes('scrypt'), 'JSON 不应含 scrypt');
  assert.ok(!json.includes('password'), 'JSON 不应含 password');
  assert.ok(!('passwordHash' in s), '不应有 passwordHash 字段');
});

test('summary: 基本字段正确', () => {
  const dir = makeDir();
  const s = dir.summary(makeRoom());
  assert.equal(s.code, 'ABCD12');
  assert.equal(s.name, '测试房间');
  assert.equal(s.hostName, '房主');
  assert.equal(s.players, 1);
  assert.equal(s.max, 6);
  assert.equal(s.phase, 'lobby');
  assert.equal(s.locked, false);
  assert.equal(s.joinable, true);
  assert.equal(s.reason, null);
});

test('summary: 满员 → joinable=false, reason=FULL', () => {
  const dir = makeDir();
  const players = Array.from({ length: 6 }, (_, i) =>
    ({ id: `p${i}`, name: `P${i}`, bot: false, connected: true })
  );
  const s = dir.summary(makeRoom({ players }));
  assert.equal(s.joinable, false);
  assert.equal(s.reason, 'FULL');
});

test('summary: 比赛中 → joinable=false, reason=RACING', () => {
  const dir = makeDir();
  const s = dir.summary(makeRoom({ phase: 'racing' }));
  assert.equal(s.joinable, false);
  assert.equal(s.reason, 'RACING');
});

test('summary: 找不到 host → hostName=""', () => {
  const dir = makeDir();
  const s = dir.summary(makeRoom({ hostId: 'notexist' }));
  assert.equal(s.hostName, '');
});

// ══════════════════════════════════════════════════════════════════════════════
// list — 排序 & 过滤
// ══════════════════════════════════════════════════════════════════════════════

test('list: 无连接真人的房间被过滤', () => {
  const dir = makeDir();
  const botsOnly = makeRoom({
    code: 'BOT001',
    players: [{ id: 'b1', name: 'Bot', bot: true, connected: true }],
  });
  const result = dir.list([botsOnly]);
  assert.equal(result.length, 0);
});

test('list: 断线玩家的房间被过滤（无连接真人）', () => {
  const dir = makeDir();
  const dcRoom = makeRoom({
    code: 'DC0001',
    players: [{ id: 'p1', name: 'A', bot: false, connected: false }],
  });
  assert.equal(dir.list([dcRoom]).length, 0);
});

test('list: 排序 — 可加入优先，再人数降序，再 code', () => {
  const dir = makeDir();
  const human = (id, connected = true) => ({ id, name: id, bot: false, connected });

  const full = makeRoom({
    code: 'AAAA00',
    players: Array.from({ length: 6 }, (_, i) => human(`f${i}`)),
  });
  const racing = makeRoom({
    code: 'BBBB00',
    phase: 'racing',
    players: [human('r1'), human('r2'), human('r3')],
  });
  const open2 = makeRoom({
    code: 'CCCC00',
    players: [human('o1'), human('o2')],
  });
  const open1 = makeRoom({
    code: 'DDDD00',
    players: [human('o3')],
  });
  const open2b = makeRoom({
    code: 'EEEE00', // same player count as open2 but higher code → sort after
    players: [human('o4'), human('o5')],
  });

  const result = dir.list([full, racing, open2, open1, open2b]);
  // 可加入: CCCC00(2人), EEEE00(2人), DDDD00(1人); 不可加入: AAAA00, BBBB00
  assert.equal(result[0].code, 'CCCC00');
  assert.equal(result[1].code, 'EEEE00');
  assert.equal(result[2].code, 'DDDD00');
  // 不可加入的顺序: AAAA00 vs BBBB00 — 两者都不可加入，按人数降序（full=6 > racing=3）
  assert.equal(result[3].code, 'AAAA00');
  assert.equal(result[4].code, 'BBBB00');
});

// ══════════════════════════════════════════════════════════════════════════════
// checkJoin
// ══════════════════════════════════════════════════════════════════════════════

test('checkJoin: 未加锁房间直接通过', async () => {
  const dir = makeDir();
  const r = await dir.checkJoin(makeRoom(), { clientKey: 'c1' });
  assert.equal(r.ok, true);
});

test('checkJoin: 已满 → FULL', async () => {
  const dir = makeDir();
  const players = Array.from({ length: 6 }, (_, i) =>
    ({ id: `p${i}`, name: `P${i}`, bot: false, connected: true })
  );
  const r = await dir.checkJoin(makeRoom({ players }), { clientKey: 'c1' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'FULL');
});

test('checkJoin: 比赛中 → RACING', async () => {
  const dir = makeDir();
  const r = await dir.checkJoin(makeRoom({ phase: 'racing' }), { clientKey: 'c1' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'RACING');
});

test('checkJoin: 加锁房间未提供密码 → PASSWORD_REQUIRED', async () => {
  const dir = makeDir();
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const r = await dir.checkJoin(makeRoom({ locked: true, passwordHash }), { clientKey: 'c1' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PASSWORD_REQUIRED');
});

test('checkJoin: 加锁房间密码正确 → ok', async () => {
  const dir = makeDir();
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('5678');
  const r = await dir.checkJoin(
    makeRoom({ locked: true, passwordHash }),
    { password: '5678', clientKey: 'c1' }
  );
  assert.equal(r.ok, true);
});

test('checkJoin: 加锁房间密码错误 → BAD_PASSWORD', async () => {
  const dir = makeDir();
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const r = await dir.checkJoin(
    makeRoom({ locked: true, passwordHash }),
    { password: '9999', clientKey: 'c1' }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_PASSWORD');
});

test('checkJoin: 4 次错误仍可尝试，第 5 次 → LOCKED_OUT', async () => {
  let ts = 1000;
  const dir = makeDir({ now: () => ts });
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const room = makeRoom({ locked: true, passwordHash });
  const opts = { clientKey: 'c2' };

  // 4 次错误
  for (let i = 0; i < 4; i++) {
    const r = await dir.checkJoin(room, { ...opts, password: 'wrong' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BAD_PASSWORD', `第 ${i + 1} 次应为 BAD_PASSWORD`);
  }

  // 第 5 次错误 → LOCKED_OUT
  const r5 = await dir.checkJoin(room, { ...opts, password: 'wrong' });
  assert.equal(r5.ok, false);
  assert.equal(r5.code, 'LOCKED_OUT');
});

test('checkJoin: 锁定期内再次尝试 → LOCKED_OUT（不调用 verify）', async () => {
  let ts = 1000;
  const dir = makeDir({ now: () => ts });
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const room = makeRoom({ locked: true, passwordHash });
  const opts = { clientKey: 'c3' };

  // 触发 5 次锁定
  for (let i = 0; i < 5; i++) {
    await dir.checkJoin(room, { ...opts, password: 'bad' });
  }

  // 锁定期内（+1 秒）
  ts += 1000;
  const r = await dir.checkJoin(room, { ...opts, password: '1234' }); // 即使密码正确也锁定
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LOCKED_OUT');
});

test('checkJoin: 锁定期后恢复，正确密码通过', async () => {
  let ts = 1000;
  const dir = makeDir({ now: () => ts });
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const room = makeRoom({ locked: true, passwordHash });
  const opts = { clientKey: 'c4' };

  // 触发锁定
  for (let i = 0; i < 5; i++) {
    await dir.checkJoin(room, { ...opts, password: 'bad' });
  }

  // 推进 61 秒
  ts += 61_000;
  const r = await dir.checkJoin(room, { ...opts, password: '1234' });
  assert.equal(r.ok, true);
});

test('checkJoin: 成功后重置计数，可以再次尝试错误密码', async () => {
  let ts = 1000;
  const dir = makeDir({ now: () => ts });
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const room = makeRoom({ locked: true, passwordHash });
  const opts = { clientKey: 'c5' };

  // 3 次错误
  for (let i = 0; i < 3; i++) {
    await dir.checkJoin(room, { ...opts, password: 'bad' });
  }

  // 成功 → 重置
  const ok = await dir.checkJoin(room, { ...opts, password: '1234' });
  assert.equal(ok.ok, true);

  // 再 4 次错误 → 仍是 BAD_PASSWORD（未锁定）
  for (let i = 0; i < 4; i++) {
    const r = await dir.checkJoin(room, { ...opts, password: 'bad' });
    assert.equal(r.code, 'BAD_PASSWORD', `重置后第 ${i + 1} 次应为 BAD_PASSWORD`);
  }
});

test('checkJoin: 不同 clientKey 互不影响', async () => {
  let ts = 1000;
  const dir = makeDir({ now: () => ts });
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const room = makeRoom({ locked: true, passwordHash });

  // c6 锁定
  for (let i = 0; i < 5; i++) {
    await dir.checkJoin(room, { clientKey: 'c6', password: 'bad' });
  }

  // c7 不受影响
  const r = await dir.checkJoin(room, { clientKey: 'c7', password: '1234' });
  assert.equal(r.ok, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// forget
// ══════════════════════════════════════════════════════════════════════════════

test('forget: 清除指定房间的限流记录后可再次累积', async () => {
  let ts = 1000;
  const dir = makeDir({ now: () => ts });
  const { hash } = makeInstantCrypto();
  const passwordHash = await hash('1234');
  const room = makeRoom({ code: 'FORGET', locked: true, passwordHash });
  const opts = { clientKey: 'c8' };

  // 锁定
  for (let i = 0; i < 5; i++) {
    await dir.checkJoin(room, { ...opts, password: 'bad' });
  }

  dir.forget('FORGET');

  // 记录已清除，不再锁定
  const r = await dir.checkJoin(room, { ...opts, password: '1234' });
  assert.equal(r.ok, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// inviteUrl
// ══════════════════════════════════════════════════════════════════════════════

test('inviteUrl: 未加锁房间', () => {
  const dir = makeDir();
  const url = dir.inviteUrl('https://game.example', { code: 'XY1234', locked: false }, '');
  assert.equal(url, 'https://game.example?room=XY1234');
});

test('inviteUrl: 加锁 + 提供密码', () => {
  const dir = makeDir();
  const url = dir.inviteUrl('https://game.example', { code: 'XY1234', locked: true }, '5678');
  assert.equal(url, 'https://game.example?room=XY1234&pw=5678');
});

test('inviteUrl: 加锁但不提供密码', () => {
  const dir = makeDir();
  const url = dir.inviteUrl('https://game.example', { code: 'XY1234', locked: true });
  assert.equal(url, 'https://game.example?room=XY1234');
});
