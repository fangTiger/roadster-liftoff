/**
 * Mars Roadster — 分享模块单元测试
 * 运行方式：node --test src/share/share.test.mjs
 *
 * 仅测试纯函数（不依赖 DOM）：
 *   formatAltitude, formatSpeed, formatDuration, formatDate, pickHeadline
 *
 * 使用 Node.js 内置 node:test，无需任何第三方库。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── 导入被测函数 ──────────────────────────────────────────────────────────────
// share.js 内部使用了 import.meta.url（用于挂载 CSS），在 Node.js 环境下可正常执行。
// renderCard / createShare 依赖浏览器 API，此文件不测试它们。
import {
  formatAltitude,
  formatSpeed,
  formatDuration,
  formatDate,
  pickHeadline,
} from './share.js';

// ─── formatAltitude ───────────────────────────────────────────────────────────

describe('formatAltitude', () => {
  // null / undefined / NaN → "—"
  test('null 返回 —', () => {
    assert.equal(formatAltitude(null), '—');
  });
  test('undefined 返回 —', () => {
    assert.equal(formatAltitude(undefined), '—');
  });
  test('NaN 返回 —', () => {
    assert.equal(formatAltitude(NaN), '—');
  });

  // < 1000 m → "N m"
  test('0 m', () => {
    assert.equal(formatAltitude(0), '0 m');
  });
  test('850 m', () => {
    assert.equal(formatAltitude(850), '850 m');
  });
  test('999 m', () => {
    assert.equal(formatAltitude(999), '999 m');
  });
  test('999.6 m：原始值 < 1000，仍走 "m" 分支，取整为 1000 m', () => {
    // formatAltitude 先判断 m < 1000（999.6 < 1000 = true），再 Math.round → "1000 m"
    assert.equal(formatAltitude(999.6), '1000 m');
  });

  // < 10 km → "N.N km"（一位小数）
  test('1000 m → 1.0 km', () => {
    assert.equal(formatAltitude(1000), '1 km');
  });
  test('3400 m → 3.4 km', () => {
    assert.equal(formatAltitude(3400), '3.4 km');
  });
  test('9999 m → 10 km 刚好跨越分支', () => {
    // 9999 / 1000 = 9.999 < 10 → "10 km"（+0.toFixed(1) 再解析）
    // 9.999.toFixed(1) = "10.0" → +"10.0" = 10 → "10 km"
    assert.equal(formatAltitude(9999), '10 km');
  });

  // >= 10 km → 整数 km
  test('12000 m → 12 km', () => {
    assert.equal(formatAltitude(12000), '12 km');
  });
  test('412000 m → 412 km', () => {
    assert.equal(formatAltitude(412000), '412 km');
  });
  test('100000 m（卡门线）→ 100 km', () => {
    assert.equal(formatAltitude(100000), '100 km');
  });
});

// ─── formatSpeed ─────────────────────────────────────────────────────────────

describe('formatSpeed', () => {
  test('null 返回 —', () => {
    assert.equal(formatSpeed(null), '—');
  });
  test('NaN 返回 —', () => {
    assert.equal(formatSpeed(NaN), '—');
  });
  test('0 → "0 km/h"', () => {
    assert.equal(formatSpeed(0), '0 km/h');
  });
  test('100 → "100 km/h"', () => {
    assert.equal(formatSpeed(100), '100 km/h');
  });
  test('1000 → "1,000 km/h"（千位分隔符）', () => {
    assert.equal(formatSpeed(1000), '1,000 km/h');
  });
  test('27600 → "27,600 km/h"', () => {
    assert.equal(formatSpeed(27600), '27,600 km/h');
  });
  test('小数取整：380.9 → "381 km/h"', () => {
    assert.equal(formatSpeed(380.9), '381 km/h');
  });
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  test('null 返回 —', () => {
    assert.equal(formatDuration(null), '—');
  });
  test('0 秒 → "0 秒"', () => {
    assert.equal(formatDuration(0), '0 秒');
  });
  test('42 秒', () => {
    assert.equal(formatDuration(42), '42 秒');
  });
  test('59 秒', () => {
    assert.equal(formatDuration(59), '59 秒');
  });
  test('60 秒 → "1 分 00 秒"', () => {
    assert.equal(formatDuration(60), '1 分 00 秒');
  });
  test('185 秒 → "3 分 05 秒"', () => {
    assert.equal(formatDuration(185), '3 分 05 秒');
  });
  test('3600 秒 → "60 分 00 秒"', () => {
    assert.equal(formatDuration(3600), '60 分 00 秒');
  });
  test('小数向下取整：42.7 → "43 秒"', () => {
    // Math.round(42.7) = 43 → < 60 → "43 秒"
    assert.equal(formatDuration(42.7), '43 秒');
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  test('返回 YYYY-MM-DD 格式', () => {
    const d = new Date(2026, 9, 24); // 月份从 0 开始
    assert.equal(formatDate(d), '2026-10-24');
  });
  test('月份 / 日期补零', () => {
    const d = new Date(2026, 0, 5); // 1 月 5 日
    assert.equal(formatDate(d), '2026-01-05');
  });
  test('null → 返回今天（格式正确）', () => {
    const result = formatDate(null);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
  test('undefined → 返回今天', () => {
    const result = formatDate(undefined);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
  test('无效 Date → 返回今天', () => {
    const result = formatDate(new Date('invalid'));
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── pickHeadline ──────────────────────────────────────────────────────────────

describe('pickHeadline — 优先级顺序', () => {

  test('home=true 优先级最高', () => {
    const h = pickHeadline({ home: true, metOldFriend: true, reachedSpace: true, maxAltM: 412000, hops: 5, topSpeedKmh: 380 });
    assert.equal(h.title, '往返太空，安全返航');
    assert.equal(h.value, '412 km');
  });

  test('metOldFriend=true（home=false）', () => {
    const h = pickHeadline({ home: false, metOldFriend: true, reachedSpace: true, maxAltM: 408000 });
    assert.equal(h.title, '在轨道上与前辈同框');
    assert.equal(h.value, '408 km');
  });

  test('reachedSpace=true（没有 metOldFriend）', () => {
    const h = pickHeadline({ reachedSpace: true, maxAltM: 150000 });
    assert.equal(h.title, '冲出大气层');
    assert.equal(h.value, '150 km');
  });

  test('maxAltM >= 450（没有 reachedSpace）', () => {
    const h = pickHeadline({ maxAltM: 1800 });
    assert.equal(h.title, '穿出云层');
    assert.equal(h.value, '1.8 km');
  });

  test('maxAltM === 450 恰好达到阈值', () => {
    const h = pickHeadline({ maxAltM: 450 });
    assert.equal(h.title, '穿出云层');
  });

  test('maxAltM < 450，hops > 0', () => {
    const h = pickHeadline({ maxAltM: 12, hops: 1 });
    assert.equal(h.title, '离地起飞');
    assert.equal(h.value, '12 m');
  });

  test('hops = 0，回退到沙漠公路', () => {
    const h = pickHeadline({ topSpeedKmh: 385, hops: 0 });
    assert.equal(h.title, '沙漠公路');
    assert.equal(h.value, '385 km/h');
  });

  test('空对象 → 沙漠公路（值为 —）', () => {
    const h = pickHeadline({});
    assert.equal(h.title, '沙漠公路');
    assert.equal(h.value, '—');
  });

  test('no args → 沙漠公路', () => {
    const h = pickHeadline();
    assert.equal(h.title, '沙漠公路');
  });

  test('home=false, metOldFriend=false, reachedSpace=false, maxAltM=449 → hops 分支', () => {
    const h = pickHeadline({ maxAltM: 449, hops: 3 });
    assert.equal(h.title, '离地起飞');
  });

  // home 覆盖 metOldFriend
  test('home=true 即使 metOldFriend=false 也选 home', () => {
    const h = pickHeadline({ home: true, metOldFriend: false, maxAltM: 400000 });
    assert.equal(h.title, '往返太空，安全返航');
  });
});
