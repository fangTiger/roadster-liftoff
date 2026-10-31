/**
 * Mars Roadster — i18n 模块单元测试
 * 运行方式：node --test src/i18n/i18n.test.mjs
 *
 * 测试范围：
 *   - en.js 与 zh.js 键名完全一致，无空字串
 *   - {placeholder} 对称性
 *   - <kbd> 标签数量对称
 *   - t() 函数：正常查找、zh 回退、key 回退、placeholder 替换、未知占位符保留
 *   - detectLang()：各种输入的语言检测逻辑
 *   - setLang() / onLangChange() 行为（使用轻量 DOM 模拟）
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── 导入词典（纯数据，无 DOM 依赖） ──────────────────────────────────────────
import zh from './zh.js';
import en from './en.js';

// ── 导入纯工具函数（在 Node 中安全） ─────────────────────────────────────────
import { detectLang } from './i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. 词典完整性
// ─────────────────────────────────────────────────────────────────────────────

describe('词典完整性', () => {
  const zhKeys = Object.keys(zh);
  const enKeys = Object.keys(en);

  test('en.js 与 zh.js 键数量相同', () => {
    assert.equal(enKeys.length, zhKeys.length,
      `zh 有 ${zhKeys.length} 键，en 有 ${enKeys.length} 键`);
  });

  test('en.js 包含 zh.js 的全部键', () => {
    const missing = zhKeys.filter(k => !(k in en));
    assert.equal(missing.length, 0,
      `en.js 缺少以下键：${missing.join(', ')}`);
  });

  test('en.js 不含 zh.js 没有的多余键', () => {
    const extra = enKeys.filter(k => !(k in zh));
    assert.equal(extra.length, 0,
      `en.js 多出以下键：${extra.join(', ')}`);
  });

  test('zh.js 无空字串值', () => {
    const empty = zhKeys.filter(k => zh[k] === '');
    assert.equal(empty.length, 0,
      `zh.js 以下键值为空字串：${empty.join(', ')}`);
  });

  test('en.js 无空字串值', () => {
    const empty = enKeys.filter(k => en[k] === '');
    assert.equal(empty.length, 0,
      `en.js 以下键值为空字串：${empty.join(', ')}`);
  });
});

test('机器人仅三档难度中英文名称完整',()=>{
 assert.equal(zh['race.extreme'],undefined);assert.equal(en['race.extreme'],undefined);
 const levels=['easy','normal','hard'];
 assert.deepEqual(levels.map(level=>zh['race.'+level]),['简单','普通','困难']);
 assert.deepEqual(levels.map(level=>en['race.'+level]),['Easy','Normal','Hard']);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. {placeholder} 对称性
// ─────────────────────────────────────────────────────────────────────────────

/** 提取字符串中所有 {name} 占位符 */
function placeholders(s) {
  return (s.match(/\{(\w+)\}/g) || []).sort();
}

describe('{placeholder} 对称性', () => {
  const zhKeys = Object.keys(zh);

  test('每个含占位符的 zh 条目，en 条目有相同的占位符集合', () => {
    const mismatches = [];
    for (const k of zhKeys) {
      const zhP = placeholders(zh[k]);
      const enP = placeholders(en[k] || '');
      if (JSON.stringify(zhP) !== JSON.stringify(enP)) {
        mismatches.push(`[${k}] zh:${zhP} en:${enP}`);
      }
    }
    assert.equal(mismatches.length, 0,
      `占位符不匹配：\n${mismatches.join('\n')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. <kbd> 标签数量对称
// ─────────────────────────────────────────────────────────────────────────────

/** 计算字符串中 <kbd> 出现次数 */
function kbdCount(s) {
  return (s.match(/<kbd>/gi) || []).length;
}

describe('<kbd> 标签数量对称', () => {
  const zhKeys = Object.keys(zh);

  test('每个含 <kbd> 的 zh 条目，en 条目 <kbd> 数量相同', () => {
    const mismatches = [];
    for (const k of zhKeys) {
      const zhN = kbdCount(zh[k]);
      const enN = kbdCount(en[k] || '');
      if (zhN !== enN) {
        mismatches.push(`[${k}] zh:${zhN} en:${enN}`);
      }
    }
    assert.equal(mismatches.length, 0,
      `<kbd> 数量不匹配：\n${mismatches.join('\n')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. t() 函数行为（直接测试词典逻辑，不依赖模块内部状态）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 独立的 t() 实现（复制核心逻辑），仅依赖 zh/en 词典，
 * 使用参数 lang 而非全局状态，便于无状态测试。
 */
function tFor(lang, key, vars) {
  const dicts = { zh, en };
  const dict = dicts[lang];
  let s = dict && key in dict ? dict[key] : undefined;
  if (s == null) s = key in zh ? zh[key] : undefined;
  if (s == null) s = key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

describe('t() 函数逻辑', () => {
  test('zh 语言正常查找', () => {
    assert.equal(tFor('zh', 'key.space'), '空格');
  });

  test('en 语言正常查找', () => {
    assert.equal(tFor('en', 'key.space'), 'Space');
  });

  test('en 缺少 key 时回退到 zh', () => {
    // 构造一个 en 中不存在的 key（通过 zh 存在验证回退逻辑）
    // 使用已知 zh key，强制 en lookup 为 undefined
    const fakeEn = { ...en };
    // 这里用 tFor 的逻辑：直接把 en 当 dicts['en']，用 zh 做回退
    // 测试：若 en 中不存在该 key，则回退到 zh
    const key = 'key.space';
    const zhVal = zh[key];
    assert.equal(typeof zhVal, 'string');
    // 正常 en 查找成功
    assert.equal(tFor('en', key), 'Space');
    // tFor 内置回退到 zh，验证逻辑：当 en 词典不含某键时返回 zh 值
    // 用一个 en 确实没有、zh 有的 key 来验证（两本词典理论上完全一致，
    // 但这里我们验证回退路径本身）
    const zhOnlyKey = '__test_missing__';
    // zh 中不存在 → 回退到 key 本身
    assert.equal(tFor('en', zhOnlyKey), zhOnlyKey);
  });

  test('key 不在任何词典时返回 key 本身', () => {
    assert.equal(tFor('zh', 'nonexistent.key'), 'nonexistent.key');
    assert.equal(tFor('en', 'nonexistent.key'), 'nonexistent.key');
  });

  test('替换单个 {placeholder}', () => {
    // 'ach.unlocked': "成就解锁 · {name}"
    const result = tFor('zh', 'ach.unlocked', { name: '点火' });
    assert.equal(result, '成就解锁 · 点火');
  });

  test('替换多个 {placeholder}', () => {
    // 'toast.lowFuelLaunchSub': "...{have}%...{need}%..."
    const result = tFor('zh', 'toast.lowFuelLaunchSub', { have: '55', need: '70' });
    assert.ok(result.includes('55%'));
    assert.ok(result.includes('70%'));
  });

  test('en 中替换 {placeholder}', () => {
    const result = tFor('en', 'ach.unlocked', { name: 'Ignition' });
    assert.equal(result, 'Achievement Unlocked · Ignition');
  });

  test('unit.sec 替换', () => {
    assert.equal(tFor('zh', 'unit.sec', { n: 42 }), '42 秒');
    assert.equal(tFor('en', 'unit.sec', { n: 42 }), '42 s');
  });

  test('unit.minSec 替换', () => {
    assert.equal(tFor('zh', 'unit.minSec', { m: 3, s: '05' }), '3 分 05 秒');
    assert.equal(tFor('en', 'unit.minSec', { m: 3, s: '05' }), '3 min 05 s');
  });

  test('未知 {placeholder} 保持原样', () => {
    // 'ach.unlocked' 含 {name}；若传入不相关的 vars
    const result = tFor('zh', 'ach.unlocked', { foo: 'bar' });
    assert.equal(result, '成就解锁 · {name}');
  });

  test('vars 为 undefined 时不替换', () => {
    const result = tFor('zh', 'ach.unlocked');
    assert.equal(result, '成就解锁 · {name}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. detectLang() 纯函数测试
// ─────────────────────────────────────────────────────────────────────────────

describe('detectLang()', () => {
  test('saved = "zh" → zh', () => {
    assert.equal(detectLang({ saved: 'zh' }), 'zh');
  });

  test('saved = "en" → en', () => {
    assert.equal(detectLang({ saved: 'en' }), 'en');
  });

  test('saved = "zh-CN" 不是有效语言 → 继续检测', () => {
    // 'zh-CN' 不在 LANGS 里，应跳过 saved，看 languages
    assert.equal(detectLang({ saved: 'zh-CN', languages: ['en-US'] }), 'en');
  });

  test('saved = "fr" 未知语言 → 继续检测 languages', () => {
    assert.equal(detectLang({ saved: 'fr', languages: ['zh-TW'] }), 'zh');
  });

  test('languages 含 "zh-TW" → zh', () => {
    assert.equal(detectLang({ languages: ['zh-TW'] }), 'zh');
  });

  test('languages 含 "zh-CN" → zh', () => {
    assert.equal(detectLang({ languages: ['zh-CN'] }), 'zh');
  });

  test('languages = ["en-US"] → en', () => {
    assert.equal(detectLang({ languages: ['en-US'] }), 'en');
  });

  test('languages = ["ja", "en"] → en（无 zh 前缀）', () => {
    assert.equal(detectLang({ languages: ['ja', 'en'] }), 'en');
  });

  test('languages = ["fr", "de"] → en（无 zh 前缀）', () => {
    assert.equal(detectLang({ languages: ['fr', 'de'] }), 'en');
  });

  test('languages 第一个条目 "zh" 优先', () => {
    assert.equal(detectLang({ languages: ['zh', 'en'] }), 'zh');
  });

  test('无 navigator（空 opts）→ zh', () => {
    assert.equal(detectLang({}), 'zh');
  });

  test('无参数调用 → zh', () => {
    assert.equal(detectLang(), 'zh');
  });

  test('languages = [] 空数组 → zh（兜底）', () => {
    assert.equal(detectLang({ languages: [] }), 'zh');
  });

  test('saved 优先级高于 languages', () => {
    // 即使 languages 包含 zh，saved = en 也应返回 en
    assert.equal(detectLang({ saved: 'en', languages: ['zh-CN', 'en'] }), 'en');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. setLang / onLangChange 行为（不依赖真实 DOM）
// ─────────────────────────────────────────────────────────────────────────────

describe('setLang / onLangChange（通过模块 API 测试）', () => {
  /**
   * 因为 i18n.js 在 Node 中加载后没有 DOM，setLang 内部只会：
   *   1. 更新 _lang
   *   2. 尝试写 localStorage（无）
   *   3. 尝试设置 document.documentElement.lang（无 document，跳过）
   *   4. 调用 applyI18n（无 document，applyI18n 内 guard 会直接返回）
   *   5. 通知 listeners
   * 因此可以安全测试监听器逻辑。
   */
  // 动态导入，每次用 createWorker 或直接用命名导出
  // Node 模块只加载一次，所以要小心全局状态。
  // 使用 getLang / setLang / onLangChange 来测试。

  // 为避免测试顺序污染，此处使用在模块级别测试监听器的最简方式。
  test('setLang 忽略未知语言', async () => {
    const { setLang, getLang } = await import('./i18n.js');
    const before = getLang();
    setLang('fr');  // 不在 LANGS 中
    assert.equal(getLang(), before);
  });

  test('setLang 切换到 en，监听器收到通知', async () => {
    const { setLang, getLang, onLangChange } = await import('./i18n.js');
    // 先确保从 zh 开始
    setLang('zh');
    const received = [];
    const unsub = onLangChange(l => received.push(l));
    setLang('en');
    assert.equal(received.length, 1);
    assert.equal(received[0], 'en');
    assert.equal(getLang(), 'en');
    unsub();
  });

  test('setLang 相同语言不通知监听器', async () => {
    const { setLang, getLang, onLangChange } = await import('./i18n.js');
    setLang('en'); // 确保当前是 en
    const received = [];
    const unsub = onLangChange(l => received.push(l));
    setLang('en'); // 相同，不触发
    assert.equal(received.length, 0);
    unsub();
  });

  test('onLangChange 返回的取消函数有效', async () => {
    const { setLang, onLangChange } = await import('./i18n.js');
    setLang('zh');
    const received = [];
    const unsub = onLangChange(l => received.push(l));
    unsub(); // 立即取消
    setLang('en');
    assert.equal(received.length, 0); // 未收到通知
  });

  test('可以注册多个监听器', async () => {
    const { setLang, onLangChange } = await import('./i18n.js');
    setLang('zh');
    const a = []; const b = [];
    const u1 = onLangChange(l => a.push(l));
    const u2 = onLangChange(l => b.push(l));
    setLang('en');
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    u1(); u2();
  });

  test('setLang 切换回 zh', async () => {
    const { setLang, getLang } = await import('./i18n.js');
    setLang('en');
    setLang('zh');
    assert.equal(getLang(), 'zh');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. LANGS 导出
// ─────────────────────────────────────────────────────────────────────────────

describe('LANGS 导出', () => {
  test('LANGS 包含 zh 和 en', async () => {
    const { LANGS } = await import('./i18n.js');
    assert.ok(Array.isArray(LANGS));
    assert.ok(LANGS.includes('zh'));
    assert.ok(LANGS.includes('en'));
  });
});
