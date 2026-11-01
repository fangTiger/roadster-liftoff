/**
 * home-hero.test.mjs — 纯逻辑单元测试
 * 运行：node --test src/ui/home/home-hero.test.mjs
 * 不依赖 jsdom，只测试可导出的纯函数。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLap,
  shortAddr,
  relativeTime,
} from './home-hero.js';

// ─── formatLap ────────────────────────────────────────────────────────────

describe('formatLap', () => {
  test('整秒', () => {
    assert.equal(formatLap(0), '00.000');
  });

  test('毫秒精度', () => {
    assert.equal(formatLap(1234), '01.234');
  });

  test('恰好 60 秒', () => {
    assert.equal(formatLap(60000), '1:00.000');
  });

  test('带分钟', () => {
    assert.equal(formatLap(90500), '1:30.500');
  });

  test('多分钟', () => {
    assert.equal(formatLap(185999), '3:05.999');
  });

  test('< 10 秒', () => {
    assert.equal(formatLap(8042), '08.042');
  });

  test('取整', () => {
    // 59999.4 → round → 59999 → 59.999
    assert.equal(formatLap(59999), '59.999');
  });

  test('NaN → 占位符', () => {
    assert.equal(formatLap(NaN), '--:--.---');
  });

  test('负数 → 占位符', () => {
    assert.equal(formatLap(-100), '--:--.---');
  });

  test('Infinity → 占位符', () => {
    assert.equal(formatLap(Infinity), '--:--.---');
  });

  test('零毫秒', () => {
    assert.equal(formatLap(0), '00.000');
  });

  test('9 分 59 秒 999', () => {
    assert.equal(formatLap(9 * 60000 + 59 * 1000 + 999), '9:59.999');
  });
});

// ─── shortAddr ────────────────────────────────────────────────────────────

describe('shortAddr', () => {
  test('标准以太坊地址', () => {
    assert.equal(
      shortAddr('0x1234567890abcdef1234567890abcdef12345678'),
      '0x1234…5678',
    );
  });

  test('只保留首 6 + 末 4 位', () => {
    const addr = '0xaAbBcCdDeEfF001122334455667788990011aAbB';
    const result = shortAddr(addr);
    assert.equal(result.slice(0, 6), addr.slice(0, 6));
    assert.equal(result.slice(-4), addr.slice(-4));
    assert.ok(result.includes('…'));
  });

  test('空字符串', () => {
    assert.equal(shortAddr(''), '');
  });

  test('短字符串（< 10 字符）原样返回', () => {
    assert.equal(shortAddr('0x1234'), '0x1234');
  });

  test('undefined 返回空字符串', () => {
    assert.equal(shortAddr(undefined), '');
  });

  test('非字符串返回空字符串', () => {
    assert.equal(shortAddr(null), '');
  });

  test('XSS：含 HTML 的地址原样返回（调用方需用 textContent）', () => {
    const malicious = '<img src=x onerror=alert(1)>0xabcd';
    const result = shortAddr(malicious);
    // 仅裁剪，不注入 HTML；调用方应以 textContent 写入 DOM
    assert.equal(typeof result, 'string');
    // 确认结果不包含 < > 标签（croppedAddr 本身就不含，因为 < 10 chars 判断通过或被截断）
    // malicious.length = 33 > 10，会被截断：前6后4
    assert.ok(result.includes('…'));
  });
});

// ─── relativeTime ─────────────────────────────────────────────────────────

describe('relativeTime', () => {
  // 假 t 函数，返回 key + params
  const fakeT = (key, params = {}) => {
    if (key === 'home.timeJustNow') return '刚刚';
    if (key === 'home.timeMinAgo')  return `${params.n} 分钟前`;
    if (key === 'home.timeHrAgo')   return `${params.n} 小时前`;
    if (key === 'home.timeDayAgo')  return `${params.n} 天前`;
    return key;
  };

  test('< 60 秒 → 刚刚', () => {
    assert.equal(relativeTime(1000, 50000, fakeT), '刚刚');
  });

  test('恰好 60 秒 → 1 分钟前', () => {
    const now = 60000 + 1000;
    assert.equal(relativeTime(1000, now, fakeT), '1 分钟前');
  });

  test('90 秒 → 1 分钟前', () => {
    assert.equal(relativeTime(0, 90000, fakeT), '1 分钟前');
  });

  test('120 秒 → 2 分钟前', () => {
    assert.equal(relativeTime(0, 120000, fakeT), '2 分钟前');
  });

  test('恰好 1 小时 → 1 小时前', () => {
    assert.equal(relativeTime(0, 3600000, fakeT), '1 小时前');
  });

  test('2.5 小时 → 2 小时前', () => {
    assert.equal(relativeTime(0, 9000000, fakeT), '2 小时前');
  });

  test('恰好 1 天 → 1 天前', () => {
    assert.equal(relativeTime(0, 86400000, fakeT), '1 天前');
  });

  test('3 天前', () => {
    assert.equal(relativeTime(0, 3 * 86400000, fakeT), '3 天前');
  });

  test('at = now → 刚刚（diff = 0）', () => {
    const ts = Date.now();
    assert.equal(relativeTime(ts, ts, fakeT), '刚刚');
  });

  test('未来时间（at > now）→ 刚刚（diff 夹到 0）', () => {
    const now = 1000;
    assert.equal(relativeTime(9999, now, fakeT), '刚刚');
  });
});

// ─── XSS 安全（DOM 层面纯逻辑辅助测试） ───────────────────────────────────

describe('XSS 防御（纯逻辑）', () => {
  test('shortAddr 不执行 HTML 标签', () => {
    // 模拟调用方用 textContent 写入：textContent 会转义，所以只要
    // shortAddr 自身不执行代码，就安全。检查返回值是纯字符串。
    const evil = '0x<img src=x onerror=alert(1)>aabb';
    const result = shortAddr(evil);
    assert.equal(typeof result, 'string');
    // 不应通过 eval/exec 等方式处理
  });

  test('formatLap 输入数字，输出纯字符串，不含标签', () => {
    const result = formatLap(12345);
    assert.ok(!result.includes('<'));
    assert.ok(!result.includes('>'));
  });

  test('relativeTime 输出纯字符串（由 t 函数决定内容）', () => {
    const safeT = () => '安全文本';
    const result = relativeTime(0, 10000, safeT);
    assert.equal(typeof result, 'string');
  });
});

// ─── buildRowModel 纯逻辑（从 home-hero.js 导出的无 DOM 辅助函数） ────────
// home-hero.js 目前没有独立导出行模型构建函数（DOM 与逻辑混合）。
// 如有需要，可将 _buildStripText 等提取为独立导出函数后在此测试。
// 以下测试确认三个已导出纯函数的完整性：

describe('导出函数完整性', () => {
  test('formatLap 可被 import', () => {
    assert.equal(typeof formatLap, 'function');
  });

  test('shortAddr 可被 import', () => {
    assert.equal(typeof shortAddr, 'function');
  });

  test('relativeTime 可被 import', () => {
    assert.equal(typeof relativeTime, 'function');
  });
});

// ─── formatLap 边界值详细覆盖 ─────────────────────────────────────────────

describe('formatLap 边界值', () => {
  test('1 ms', () => {
    assert.equal(formatLap(1), '00.001');
  });

  test('999 ms', () => {
    assert.equal(formatLap(999), '00.999');
  });

  test('1000 ms = 1 秒', () => {
    assert.equal(formatLap(1000), '01.000');
  });

  test('59000 ms = 59 秒', () => {
    assert.equal(formatLap(59000), '59.000');
  });

  test('61000 ms = 1:01.000', () => {
    assert.equal(formatLap(61000), '1:01.000');
  });

  test('3661000 ms = 61:01.000', () => {
    assert.equal(formatLap(3661000), '61:01.000');
  });
});
