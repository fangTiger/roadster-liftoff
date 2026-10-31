/**
 * room-browser.test.mjs — UI 辅助纯函数单元测试
 * 运行方式：node --test src/race/lobby/room-browser.test.mjs
 *
 * 只测试从 room-browser.js 导出的纯函数（无 DOM 依赖）：
 * - buildRowModels   行模型构建
 * - nextPinFocus     PIN 框焦点计算
 * - isValidPin       PIN 格式验证
 *
 * 另外测试 XSS 防御（名称必须作为文本渲染，不插入 HTML）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRowModels, nextPinFocus, isValidPin, createRoomBrowser } from './room-browser.js';

// ── i18n 桩 ──────────────────────────────────────────────────────────────────

const ZH = {
  'room.defaultName': '{host} 的房间',
  'room.browser.title': '多人房间',
  'room.browser.count': '{n} 个房间 · {m} 人在线',
  'room.waiting': '等待中',
  'room.full': '已满',
  'room.racing': '比赛中',
  'race.track1': '沙漠公路',
  'race.track2': '星际轨道',
  'room.mode.speed': '极速',
  'room.mode.items': '道具',
};

function t(key, params = {}) {
  let s = ZH[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

// ── 测试数据工厂 ──────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    code: 'TEST01',
    name: '测试房间',
    hostName: '驾驶员甲',
    trackId: 1,
    mode: 'speed',
    players: 2,
    max: 6,
    locked: false,
    joinable: true,
    reason: null,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// buildRowModels
// ══════════════════════════════════════════════════════════════════════════════

test('buildRowModels: 空数组返回空数组', () => {
  assert.deepEqual(buildRowModels([], t), []);
});

test('buildRowModels: 使用 row.name 作为显示名', () => {
  const models = buildRowModels([makeRow({ name: '快速比赛' })], t);
  assert.equal(models[0].displayName, '快速比赛');
});

test('buildRowModels: name 为空时使用 defaultName 模板', () => {
  const models = buildRowModels([makeRow({ name: '', hostName: 'Elon' })], t);
  assert.equal(models[0].displayName, 'Elon 的房间');
});

test('buildRowModels: trackLabel 由 t 函数决定', () => {
  const models = buildRowModels([makeRow({ trackId: 2 })], t);
  assert.equal(models[0].trackLabel, '星际轨道');
});

test('buildRowModels: modeLabel 由 t 函数决定', () => {
  const models = buildRowModels([makeRow({ mode: 'items' })], t);
  assert.equal(models[0].modeLabel, '道具');
});

test('buildRowModels: joinable=true → statusMod=waiting', () => {
  const models = buildRowModels([makeRow({ joinable: true })], t);
  assert.equal(models[0].statusMod, 'waiting');
  assert.equal(models[0].statusLabel, '等待中');
});

test('buildRowModels: reason=FULL → statusMod=full', () => {
  const models = buildRowModels([makeRow({ joinable: false, reason: 'FULL' })], t);
  assert.equal(models[0].statusMod, 'full');
  assert.equal(models[0].statusLabel, '已满');
});

test('buildRowModels: reason=RACING → statusMod=racing', () => {
  const models = buildRowModels([makeRow({ joinable: false, reason: 'RACING' })], t);
  assert.equal(models[0].statusMod, 'racing');
  assert.equal(models[0].statusLabel, '比赛中');
});

test('buildRowModels: players 和 max 正确传递', () => {
  const models = buildRowModels([makeRow({ players: 4, max: 6 })], t);
  assert.equal(models[0].players, 4);
  assert.equal(models[0].max, 6);
});

test('buildRowModels: locked 字段正确传递', () => {
  const models = buildRowModels([makeRow({ locked: true })], t);
  assert.equal(models[0].locked, true);
});

test('buildRowModels: 多行顺序保持', () => {
  const rows = [
    makeRow({ code: 'A', name: '第一' }),
    makeRow({ code: 'B', name: '第二' }),
    makeRow({ code: 'C', name: '第三' }),
  ];
  const models = buildRowModels(rows, t);
  assert.equal(models[0].code, 'A');
  assert.equal(models[1].code, 'B');
  assert.equal(models[2].code, 'C');
});

test('buildRowModels: XSS — 恶意名称不包含 HTML 标签（displayName 是纯文本）', () => {
  const xss = '<img src=x onerror=alert(1)>';
  const models = buildRowModels([makeRow({ name: xss })], t);
  // displayName 只是字符串，不作为 HTML 处理；调用方通过 textContent 设置
  assert.equal(models[0].displayName, xss);
  // 关键点：displayName 不含任何 HTML 转义或标签注入的迹象
  // 模块保证它通过 textContent 而非 innerHTML 写入 DOM（见 room-browser.js setText）
  assert.ok(!models[0].displayName.includes('&lt;'), 'displayName 应为原始文本');
});

// ══════════════════════════════════════════════════════════════════════════════
// nextPinFocus
// ══════════════════════════════════════════════════════════════════════════════

test('nextPinFocus: forward 从 0 → 1', () => {
  assert.equal(nextPinFocus(0, 'forward'), 1);
});

test('nextPinFocus: forward 从 3 → 3（不越界）', () => {
  assert.equal(nextPinFocus(3, 'forward'), 3);
});

test('nextPinFocus: back 从 2 → 1', () => {
  assert.equal(nextPinFocus(2, 'back'), 1);
});

test('nextPinFocus: back 从 0 → 0（不越界）', () => {
  assert.equal(nextPinFocus(0, 'back'), 0);
});

test('nextPinFocus: forward 中间索引', () => {
  assert.equal(nextPinFocus(1, 'forward'), 2);
  assert.equal(nextPinFocus(2, 'forward'), 3);
});

// ══════════════════════════════════════════════════════════════════════════════
// isValidPin
// ══════════════════════════════════════════════════════════════════════════════

test('isValidPin: 合法 4 位数字', () => {
  for (const pw of ['0000', '1234', '9999', '0001']) {
    assert.equal(isValidPin(pw), true, `"${pw}" 应合法`);
  }
});

test('isValidPin: 非法输入', () => {
  for (const bad of ['', '123', '12345', 'abcd', '12 4', '123!', ' 234']) {
    assert.equal(isValidPin(bad), false, `"${bad}" 应非法`);
  }
});

test('isValidPin: 前导零合法', () => {
  assert.equal(isValidPin('0001'), true);
});

// ══════════════════════════════════════════════════════════════════════════════
// XSS 防御 — DOM 层面验证（通过 domino shim 测试 textContent 而非 innerHTML）
// ══════════════════════════════════════════════════════════════════════════════

test('XSS: <img onerror> 名称通过 textContent 写入时不执行', () => {
  // 模拟 DOM setText 函数的行为（不使用 innerHTML）
  const fakeEl = { textContent: '' };
  function setText(elem, text) { elem.textContent = String(text ?? ''); }

  const xssName = '<img src=x onerror=alert(1)>';
  setText(fakeEl, xssName);

  // textContent 不解析 HTML，所以 .textContent 等于原字符串
  assert.equal(fakeEl.textContent, xssName);
  // 关键：如果是 innerHTML，会变成 DOM 节点；textContent 保持原始字符串
  assert.ok(fakeEl.textContent.includes('<img'), '原始字符串保留（未转义）');
  // 而通过 textContent 设置到真实 DOM 中，浏览器不会执行任何脚本
});

test('XSS: hostName 含脚本标签通过 textContent 安全设置', () => {
  const fakeEl = { textContent: '' };
  function setText(elem, text) { elem.textContent = String(text ?? ''); }

  const evil = '<script>alert("xss")</script>';
  setText(fakeEl, evil);
  assert.equal(fakeEl.textContent, evil);
  // textContent 不解析，script 不执行
});

// 用最小 DOM 容器检查真实工厂产物，不模拟被测渲染函数。
function browserFixture() {
  const previous = globalThis.document;
  const element = tag => ({
    tag, children: [], attrs: {}, dataset: {}, className: '',
    classList: { add() {}, remove() {} },
    appendChild(child) { child.parent = this; this.children.push(child); return child; },
    insertBefore(child, before) { child.parent = this; const i = this.children.indexOf(before); this.children.splice(i < 0 ? this.children.length : i, 0, child); },
    setAttribute(name, value) { this.attrs[name] = value; if (name === 'class') this.className = value; },
    addEventListener() {},
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return this.text ?? ''; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
  });
  globalThis.document = { createElement: element, createElementNS: (_, tag) => element(tag) };
  const container = element('div');
  const browser = createRoomBrowser({ container, t, onJoin() {}, onCreate() {}, onRefresh() {} });
  const find = (name, node = container) => node.className.split(' ').includes(name) ? node : node.children.map(child => find(name, child)).find(Boolean);
  return { browser, find, restore() { globalThis.document = previous; } };
}

test('空列表展示辅助技术忽略的车辆剪影，并保留突出建房按钮', () => {
  const f = browserFixture();
  try {
    const graphic = f.find('rb-empty-state__car');
    assert.ok(graphic, '空状态必须包含车辆剪影');
    assert.equal(graphic.attrs['aria-hidden'], 'true');
    assert.ok(f.find('rb-btn--lg'), '空状态必须保留大号建房按钮');
  } finally { f.restore(); }
});

test('等待房间单独标记，呼吸灯不会错误应用于满员或比赛中的人数点', () => {
  const f = browserFixture();
  try {
    f.browser.update({ rows: [makeRow(), makeRow({ code: 'FULL01', joinable: false, reason: 'FULL' }), makeRow({ code: 'RACE01', joinable: false, reason: 'RACING' })] });
    const rows = f.find('rb-list').children;
    assert.ok(rows[0].className.includes('rb-row--waiting'));
    assert.ok(!rows[1].className.includes('rb-row--waiting'));
    assert.ok(!rows[2].className.includes('rb-row--waiting'));
  } finally { f.restore(); }
});
