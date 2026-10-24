# Mars Roadster — 国际化（i18n）模块

纯 ES 模块，无外部依赖，无构建步骤，无网络请求。  
支持简体中文 (`zh`) 和英文 (`en`) 双语切换，语言偏好持久化到 `localStorage`。

---

## 文件结构

```
src/i18n/
├── zh.js          # 中文词条（源语言，勿修改键名）
├── en.js          # 英文词条（与 zh.js 键名完全对应）
├── i18n.js        # 核心模块（所有 export）
├── i18n.css       # 语言切换开关样式（由 i18n.js 自动挂载）
├── i18n.test.mjs  # node:test 单元测试
└── README.md      # 本文档
```

---

## 快速接入

```js
import { t, setLang, getLang, applyI18n, mountLangToggle, onLangChange } from './src/i18n/i18n.js';

// 翻译一个 key
console.log(t('key.space'));           // 中文："空格"  英文："Space"
console.log(t('ach.unlocked', { name: '点火' }));  // "成就解锁 · 点火"

// 切换语言（自动持久化、更新 DOM、通知监听器）
setLang('en');

// 页面语言变更时通知（返回取消函数）
const unsub = onLangChange(lang => {
  console.log('当前语言：', lang);
});
unsub(); // 取消订阅

// 将 data-i18n 属性应用到整个文档
applyI18n(document);

// 挂载语言切换开关到 #tools 工具栏
mountLangToggle(document.getElementById('tools'));
```

---

## 完整 API

### `LANGS`

```js
import { LANGS } from './src/i18n/i18n.js';
// ['zh', 'en']
```

---

### `t(key, vars?) → string`

翻译指定 key，并可选地替换 `{placeholder}`。

查找顺序：当前语言词典 → `zh.js`（回退）→ key 本身（最终回退）。

```js
t('brand.sub')                         // → "离地 · 推进器超跑 · 实时 3D"（中文时）
t('ach.unlocked', { name: '极速' })    // → "成就解锁 · 极速"
t('toast.lowFuelLaunchSub', { have: 55, need: 70 })
// → "按下空格时只有 55%，需要 70% 以上 · 落地停几秒就会充满"
t('nonexistent.key')                   // → "nonexistent.key"（key 不存在时原样返回）
```

**规则：**
- 未知 `{placeholder}` 保持原样（不替换，不报错）。
- 不存在的 key 先查 zh，仍没有则返回 key 字符串本身。

---

### `getLang() → 'zh' | 'en'`

返回当前激活语言。

---

### `setLang(lang)`

切换语言。

- 忽略不在 `LANGS` 中的值（静默 no-op）。
- 若语言未发生变化，也为 no-op（不重复通知监听器）。
- 持久化到 `localStorage`（键名 `'liftoff.lang.v1'`），使用 `try/catch` 保护，私人模式也安全。
- 更新 `document.documentElement.lang`（zh → `'zh-CN'`，en → `'en'`）。
- 自动调用 `applyI18n(document)`。
- 通知所有 `onLangChange` 监听器。

```js
setLang('en');
setLang('fr'); // 忽略（不在 LANGS 中）
```

---

### `onLangChange(fn) → unsubscribe`

注册语言变更回调，返回取消订阅函数。

```js
const unsub = onLangChange(lang => {
  // lang 是新语言字符串 'zh' 或 'en'
  updateUI(lang);
});
// 不再需要时：
unsub();
```

---

### `applyI18n(root?)`

将当前语言词条应用到 DOM 节点及其后代。  
`root` 默认为 `document`，也可传单个元素（例如动态插入的弹窗）。

#### 支持三种 data 属性

| 属性 | 效果 |
|------|------|
| `data-i18n="key"` | `el.textContent = t(key)` |
| `data-i18n-html="key"` | `el.innerHTML = t(key)`（用于含 `<kbd>` 的条目） |
| `data-i18n-attr="attr:key;title:key2"` | `el.setAttribute(attr, t(key))` 等 |

```html
<!-- textContent -->
<span data-i18n="hud.fuel">推进剂</span>

<!-- innerHTML（含 <kbd>） -->
<span data-i18n-html="bar.space">按住<kbd>空格</kbd>冲出大气层</span>

<!-- 属性绑定 -->
<button data-i18n-attr="aria-label:tool.screenshot;title:tool.screenshot">◎</button>
```

> **安全说明：** `data-i18n-html` 仅用于我们自有词典中含 `<kbd>` 的条目。不要将用户输入放入词典，以避免 XSS。

---

### `mountLangToggle(container)`

在 `container` 中追加一个语言切换开关。

- `container` 为 `null` 时静默返回（不报错）。
- 幂等：调用两次只挂载一次，第二次只刷新显示。
- 自动注册 `onLangChange` 监听器，语言切换后实时更新显示。
- Click / Enter / Space 切换语言；Enter 和 Space 会阻止事件冒泡，游戏不会收到。

```js
// 挂载到 #tools 工具栏（右上角磨砂玻璃面板）
mountLangToggle(document.getElementById('tools'));
```

---

### `detectLang({ saved?, languages? }) → 'zh' | 'en'`

纯函数，不依赖任何全局对象，供测试使用。

```js
import { detectLang } from './src/i18n/i18n.js';

detectLang({ saved: 'en' })                    // → 'en'
detectLang({ languages: ['zh-TW', 'en-US'] }) // → 'zh'
detectLang({ languages: ['ja', 'en-US'] })    // → 'en'
detectLang({})                                 // → 'zh'（兜底）
```

---

## 如何添加一个新 key

1. **在 `zh.js` 中添加**（源语言）：

   ```js
   'my.feature.label': '功能名称',
   'my.feature.hint': '需要 {count} 枚金币',
   ```

2. **在 `en.js` 中添加相同 key**（保持所有 `{placeholder}` 不变）：

   ```js
   'my.feature.label': 'Feature Name',
   'my.feature.hint': 'Requires {count} coins',
   ```

3. **在 HTML 中使用**：

   ```html
   <span data-i18n="my.feature.label">功能名称</span>
   ```

4. **在 JS 中使用**：

   ```js
   t('my.feature.hint', { count: 50 }) // → "需要 50 枚金币" / "Requires 50 coins"
   ```

5. **运行测试**确认两本词典一致：

   ```bash
   node --test src/i18n/i18n.test.mjs
   ```

---

## 翻译规则（en.js）

- **简洁优先**：按钮、底部按键栏、toast 空间有限，不要比中文长太多。
- **保留 `{placeholder}`**：位置和名称与 zh.js 完全一致。
- **保留 HTML 标签**：含 `<kbd>` 的条目保留标签，数量必须与 zh.js 相同。
- **专业术语**：Kármán line（卡门线）、Mach 1（1 马赫）、sonic boom（音爆）、troposphere / stratosphere / mesosphere / thermosphere。
- **成就名称**：使用游戏惯用风格，例如 "0.8s Club"、"Sonic Boom"、"Kármán Line"、"Frequent Flyer"、"Meet the Legend"。
- **画质档位**：Auto / Low / Medium / High / Ultra。
- **品牌词**：离地 = Liftoff；前辈 = the Legend；2018 Roadster = the 2018 Roadster with Starman。
- **`lang.toggle`**：zh 为 "切换语言"，en 为 "Switch language"。

---

## 语言检测逻辑

模块加载时按以下优先级确定初始语言：

| 优先级 | 来源 | 规则 |
|--------|------|------|
| 1 | `localStorage['liftoff.lang.v1']` | 值为 `'zh'` 或 `'en'` 时直接使用 |
| 2 | `navigator.languages` / `navigator.language` | 任意条目以 `"zh"` 开头 → `'zh'`，否则 `'en'` |
| 3 | 兜底（无 navigator / Node.js） | `'zh'` |

---

## 运行测试

```bash
node --test src/i18n/i18n.test.mjs
```

预期：39 个断言全部通过，0 失败。

测试覆盖：
- 词典键集完全一致（无多余、无缺失、无空值）
- 每个含 `{placeholder}` 的条目，两本词典占位符集合相同
- 每个含 `<kbd>` 的条目，两本词典标签数量相同
- `t()` 的正常查找、zh 回退、key 回退、placeholder 替换、未知 placeholder 保留
- `detectLang()` 覆盖所有分支：saved 优先、zh-TW/zh-CN → zh、en-US/ja → en、空输入 → zh
- `setLang` 忽略未知语言、相同语言 no-op、监听器通知、取消订阅
