# Mars Roadster — 成绩分享模块

纯 ES 模块，无外部依赖，无构建步骤，无网络请求。
一局游戏结束后弹出成绩面板，生成可保存 / 分享的卡片图片（横版 1200×630 或竖版 1080×1350）。

---

## 文件结构

```
src/share/
├── share.js          # 核心模块：面板 DOM、Canvas 卡片、纯工具函数
├── share.css         # 样式（磨砂玻璃、英雄区、统计网格、按钮）
├── demo.html         # 独立演示页（可直接在浏览器打开）
├── share.test.mjs    # node:test 单元测试（纯函数）
└── README.md         # 本文档
```

> `share.css` 由 `share.js` 在首次打开面板时**自动挂载**（`<link>` 注入），无需手动引入。

---

## 快速接入

### 1. 导入并创建实例

```js
import { createShare } from './src/share/share.js';

const share = createShare({
  logoUrl: '/logo.png',               // 默认 '/logo.png'
  author:  'Captain@mycndota',        // 显示在卡片页脚
  siteUrl: 'mars-roadster.example.com', // 可选，页脚附加
  credit:  'Built with Arc Studio + Claude Code',
});
```

### 2. 监听面板关闭（游戏恢复输入）

```js
share.onClose(() => {
  game.resumeInput(); // 游戏重新开始接收键盘输入
});
```

### 3. 游戏结束时打开成绩面板

```js
// screenshot 可传 HTMLCanvasElement / HTMLImageElement / ImageBitmap / data URL / null
const screenshot = renderer.domElement; // 例如 Three.js renderer canvas
await share.open(stats, screenshot);
```

---

## stats 对象字段说明

所有字段均为可选；缺失时显示"—"。

| 字段 | 类型 | 说明 |
|------|------|------|
| `topSpeedKmh` | `number` | 本局最高时速（km/h） |
| `launchSec` | `number` | 最快 0–100 km/h 用时（秒，保留两位小数） |
| `maxAltM` | `number` | 最高海拔（米） |
| `distanceKm` | `number` | 本局里程（km） |
| `coins` | `number` | 本局收集金币数 |
| `hops` | `number` | 本局离地次数 |
| `flightSec` | `number` | 本局飞行总时长（秒） |
| `reachedSpace` | `boolean` | 是否进入太空（超过卡门线 100 km） |
| `metOldFriend` | `boolean` | 是否在轨道上遇见 2018 Starman 老前辈 |
| `home` | `boolean` | 是否从轨道再入并安全着陆 |
| `achievements` | `{ unlocked, total }` | 成就进度 |
| `date` | `Date` | 本局日期（默认 `new Date()`） |

---

## 完整 API

### `createShare(opts?) → instance`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `logoUrl` | `string` | `'/logo.png'` | Logo 图像 URL（同源，不会污染 Canvas） |
| `author` | `string` | `'Captain@mycndota'` | 卡片页脚作者名 |
| `siteUrl` | `string` | `''` | 卡片页脚网站（留空则不显示） |
| `credit` | `string` | `'Built with Arc Studio + Claude Code'` | 版权行文字 |

---

### `instance.open(stats, screenshot)`

打开成绩面板（异步，面板内含卡片预览渲染）。

```js
await share.open(stats, screenshot);
```

- `screenshot`: `HTMLCanvasElement | HTMLImageElement | ImageBitmap | string(dataURL) | null`
- 传 `null` 时，卡片使用内置深空渐变背景（无需截图）。
- 面板打开期间：
  - 键盘事件在**捕获阶段**被拦截，不会传至游戏（`stopPropagation`）
  - 焦点被锁定在面板内（Tab / Shift+Tab 循环）
  - Escape / Enter 关闭面板

---

### `instance.close()`

关闭面板，触发所有 `onClose` 回调，还原之前的焦点。

---

### `instance.isOpen` （getter）

`boolean`，面板当前是否打开。

---

### `instance.onClose(fn)`

注册面板关闭后的回调（可多次调用添加多个）。

```js
share.onClose(() => {
  console.log('面板已关闭，游戏恢复');
});
```

---

### `instance.renderCard(stats, screenshot, format?)`

单独渲染一张分享卡片，返回 `Promise<HTMLCanvasElement>`。

```js
const card = await share.renderCard(stats, screenshot, 'landscape');
// 下载为 PNG
const a = document.createElement('a');
a.download = 'my-run.png';
a.href = card.toDataURL('image/png');
a.click();
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `stats` | `object` | 成绩对象 |
| `screenshot` | `*` | 截图源（同 `open`） |
| `format` | `'landscape' \| 'portrait'` | 横版 1200×630 / 竖版 1080×1350，默认横版 |

---

## 纯工具函数（可单独导入）

```js
import {
  formatAltitude,
  formatSpeed,
  formatDuration,
  formatDate,
  pickHeadline,
  renderCard,        // 底层卡片渲染函数（需传完整 opts）
} from './src/share/share.js';
```

### `formatAltitude(m) → string`

| 输入 | 输出 |
|------|------|
| `null` / `NaN` | `"—"` |
| `< 1000` | `"850 m"` |
| `< 10000`（即 < 10 km）| `"3.4 km"` |
| `>= 10000` | `"412 km"` |

### `formatSpeed(kmh) → string`

整数 + 千位分隔符 + ` km/h`。例如 `27600 → "27,600 km/h"`。

### `formatDuration(sec) → string`

| 秒数 | 输出 |
|------|------|
| `null` | `"—"` |
| `< 60` | `"42 秒"` |
| `>= 60` | `"3 分 05 秒"` |

### `formatDate(date?) → string`

返回 `YYYY-MM-DD`；传 `null` / `undefined` / 无效 Date 时返回今天。

### `pickHeadline(stats) → { title, value }`

按优先级选取英雄标题：

| 优先级 | 条件 | title | value |
|--------|------|-------|-------|
| 1 | `home === true` | 往返太空，安全返航 | `formatAltitude(maxAltM)` |
| 2 | `metOldFriend === true` | 在轨道上与前辈同框 | `formatAltitude(maxAltM)` |
| 3 | `reachedSpace === true` | 冲出大气层 | `formatAltitude(maxAltM)` |
| 4 | `maxAltM >= 450` | 穿出云层 | `formatAltitude(maxAltM)` |
| 5 | `hops > 0` | 离地起飞 | `formatAltitude(maxAltM)` |
| 6 | 其他 | 沙漠公路 | `formatSpeed(topSpeedKmh)` |

---

## 运行单元测试

```bash
node --test src/share/share.test.mjs
```

覆盖所有纯函数及 `pickHeadline` 的六个优先级分支，共 44 个断言，预期全部通过。

---

## UI 行为说明

### 成绩面板

- 全屏半透明遮罩 + 居中磨砂玻璃卡片（最宽 760px）
- 响应式：≤ 640px 统计网格切为 2 列，按钮纵向堆叠；≤ 390px 减少内边距
- 尊重 `prefers-reduced-motion`：关闭缩放入场动画

### 按钮可见性

| 按钮 | 显示条件 |
|------|----------|
| 保存图片 | 始终显示 |
| 分享 | `navigator.canShare({ files: [File] })` 为 `true` |
| 复制图片 | `ClipboardItem` 可用且 `navigator.clipboard.write` 存在 |
| 继续驾驶 | 始终显示（主要按钮，渐变橙色） |

### 卡片预览

- 横版 / 竖版切换按钮；切换后重新渲染（显示"渲染中…"遮罩）
- 预览 canvas 自适应面板宽度缩放，不影响导出分辨率

### 键盘

| 按键 | 效果 |
|------|------|
| `Escape` | 关闭面板 |
| `Enter` | 关闭面板 |
| `Tab` / `Shift+Tab` | 在面板内循环焦点 |
| 其他按键 | 被面板捕获（`stopPropagation`），不传至游戏 |

---

## 分享卡片结构（Canvas）

```
┌─────────────────────────────────────────┐
│ Logo ▌ Mars Roadster    日期（右对齐）    │
│      ▌ 离地 · 推进器超跑                 │
│                                          │
│ 英雄标题（小）                            │
│ 英雄数值（大，渐变色）                    │
│                                          │
│ ┌─────────────────────────────────────┐  │
│ │ 极速     │ 0–100    │ 最高海拔       │  │
│ │ 里程     │ 金币 🪙   │ 成就 n/total  │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ [进入太空] [与前辈同框] [安全返航]        │
│                                          │
│ 作者 Captain@mycndota · Built with…     │
└─────────────────────────────────────────┘
```

- 背景：截图 cover 铺满 + 单侧暗色渐变（提升可读性）
- 无截图时：内置深空渐变 + 随机星点
- Logo 加载超时 2 秒后跳过，不阻塞渲染

---

## 与游戏主循环集成示例

```js
// main.js
import { createShare } from './src/share/share.js';

const share = createShare({ logoUrl: '/logo.png' });

share.onClose(() => {
  game.paused = false;
  game.input.enable();
});

function onRunEnd(stats) {
  game.paused = true;
  game.input.disable();

  // 截取当前帧
  const screenshot = renderer.domElement;
  share.open(stats, screenshot);
}
```
