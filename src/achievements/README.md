# 离地 LIFTOFF — 成就系统

纯 ES 模块，无外部依赖，无构建步骤。支持持久化（localStorage）、吐司通知队列、全屏成就面板，与主游戏 HUD 视觉风格统一。

---

## 文件结构

```
src/achievements/
├── achievements.js   # 核心模块（纯逻辑 + DOM）
├── achievements.css  # 样式（磨砂玻璃、吐司、面板、网格）
└── demo.html         # 独立演示页（无需服务器，直接在浏览器打开）
```

> `achievements.css` 由 `achievements.js` 在首次需要显示 UI 时**自动挂载**（`<link>` 注入），无需手动引入。

---

## 快速接入

### 1. 在主游戏中导入

```js
import { createAchievements } from './src/achievements/achievements.js';

const ach = createAchievements();          // 使用默认 storageKey
// 或
const ach = createAchievements({ storageKey: 'liftoff.achievements.v1' });
```

### 2. 监听解锁事件（可选）

```js
ach.onUnlock(({ id, name, desc, date }) => {
  console.log(`解锁：${name}（${date}）`);
});
```

### 3. 在游戏主循环中调用 update()

```js
// 每帧调用一次
function gameLoop() {
  ach.update({
    speedKmh:   vehicle.speedKmh,    // 当前时速
    distanceKm: vehicle.distanceKm,  // 本局行驶里程（km，从 0 开始）
    offroad:    vehicle.offroad,      // 越野程度 0..1
    hops:       vehicle.hops,         // 本局离地次数
    altitudeM:  vehicle.altitudeM,    // 当前海拔（m）
    mode:       camera.mode,          // 当前镜头模式
  });
}
```

> `distanceKm` 填写**本局里程**（每局从 0 开始）；系统内部自动计算增量并跨局累加，持久化到 localStorage。

### 4. 上报离散游戏事件

```js
// 玩家首次驾驶
ach.report('drive_start');

// 0–100 km/h 计时结束
ach.report('launch_time', { seconds: 0.82 });

// 底部推进器启动，车离地
ach.report('airborne');

// 悬停高度达到 10 m
ach.report('hover10');

// 落地
ach.report('land');

// 竖直速度突破 1 马赫
ach.report('boom');

// 穿出云层
ach.report('clouds');

// 进入平流层（~12 km）
ach.report('stratosphere');

// 越过卡门线（100 km）
ach.report('karman');

// 进入轨道（每次调用都计入累计次数）
ach.report('orbit');

// 在轨道上遇见 2018 年老前辈
ach.report('meet');

// 从轨道再入并平稳降落
ach.report('reentry_home');

// 中止上升
ach.report('ascent_abort', { fuelEmpty: true });   // 燃料耗尽 → 解锁"差一点"
ach.report('ascent_abort', { fuelEmpty: false });  // 主动中止 → 不触发

// 切换摄像机机位（需切换全部 5 个才解锁"导演"）
// 有效机位：'chase' | 'low' | 'cine' | 'cockpit' | 'free'
ach.report('camera', { mode: 'chase' });

// 保存截图
ach.report('screenshot');

// 鸣笛（目前无成就绑定，预留扩展）
ach.report('horn');
```

---

## 完整 API

### `createAchievements(opts?) → instance`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storageKey` | `string` | `'liftoff.achievements.v1'` | localStorage 键名 |

返回成就实例，包含以下成员：

---

### `instance.report(event, data?)`

上报一次离散游戏事件。

| 事件名 | data 字段 | 触发成就 |
|--------|-----------|----------|
| `drive_start` | — | 点火 |
| `launch_time` | `seconds: number` | seconds < 0.9 → 0.8 秒俱乐部 |
| `airborne` | — | 第一次起飞 |
| `hover10` | — | 悬停 |
| `land` | — | （无，预留） |
| `boom` | — | 音爆 |
| `clouds` | — | 云上 |
| `stratosphere` | — | 平流层 |
| `karman` | — | 卡门线 |
| `orbit` | — | 累计 3 次 → 太空常客 |
| `meet` | — | 与前辈同框 |
| `reentry_home` | — | 安全返航 |
| `ascent_abort` | `fuelEmpty: boolean` | fuelEmpty=true → 差一点 |
| `camera` | `mode: string` | 全 5 个 → 导演（持久化） |
| `screenshot` | — | 摄影师 |
| `horn` | — | （无，预留） |

---

### `instance.update(state)`

每帧调用，根据连续状态判断阈值成就。

| 字段 | 类型 | 说明 |
|------|------|------|
| `speedKmh` | `number` | 当前时速（km/h） |
| `distanceKm` | `number` | 本局累计里程（km，每局从 0 开始） |
| `offroad` | `number` | 越野程度，0 = 公路，1 = 完全越野 |
| `hops` | `number` | 本局离地次数 |
| `altitudeM` | `number` | 当前海拔（m）；本版本由 `report` 事件替代，保留供扩展 |
| `mode` | `string` | 当前镜头模式（保留供扩展） |

**通过 update() 触发的成就：**

| 成就 | 条件 |
|------|------|
| 极速 | `speedKmh >= 380` |
| 越野 | `offroad > 0.5 && speedKmh > 150` |
| 弹跳 | `hops >= 5`（本局） |
| 长途 | 累计 `distanceKm >= 10`（跨局持久化） |

---

### `instance.list() → Achievement[]`

返回所有 18 个成就的快照数组：

```ts
{
  id:       string;   // 成就 ID
  index:    number;   // 1–18
  name:     string;   // 中文名称
  desc:     string;   // 描述
  unlocked: boolean;
  date:     string | null;  // 'YYYY-MM-DD' 或 null
}
```

---

### `instance.unlocked` （getter）

已解锁成就的数量（`number`）。

---

### `instance.total` （getter）

成就总数，固定为 `18`。

---

### `instance.reset()`

清除所有解锁记录、持久化计数器（轨道次数、累计里程、已用机位），同步刷新 UI。

---

### `instance.openPanel()`

显示全屏成就面板（懒初始化，安全在 DOM 就绪前调用）。

---

### `instance.closePanel()`

关闭成就面板。按 Escape 或点击背景也会关闭。

---

### `instance.onUnlock(fn)`

注册一个在成就解锁时调用的回调函数。

```js
ach.onUnlock(({ id, name, desc, date }) => {
  // 例如：发送埋点事件
  analytics.track('achievement_unlocked', { id, name });
});
```

可多次调用注册多个回调；回调内部抛出的错误会被静默吞掉，不影响主逻辑。

---

## UI 行为说明

### 吐司（解锁通知）

- 从页面顶部中央**向下滑入**，位于 `top: 96px`，不遮挡主 HUD（top-bar 高约 86px）。
- 显示金色勋章（含扫光动画）+ 序号、成就名称、描述。
- **自动隐藏**：3.6 秒后退场。
- **不重叠**：多个解锁事件进入队列，依次逐一显示。
- 尊重 `prefers-reduced-motion`：减少动画模式下跳过滑动效果。

### 成就面板

- 居中磨砂玻璃面板，顶部进度条 `n / 18`。
- 三列网格（≤720px 两列，≤420px 单列）。
- 已解锁：金色高亮，显示日期；未解锁：暗淡 + 锁图标，描述显示"？？？"。
- 关闭方式：点击右上角 ✕、按 Escape、点击半透明背景。
- 点击页面中的 `#bag` 元素（若存在）会自动打开面板。

### #bag 计数器

若页面存在 `#bag .ach b` 元素，解锁时自动更新为 `n / 18`。

---

## 与现有 HUD 集成（hud.js 示例）

```js
// 在 createHUD() 同级引入成就系统
import { createAchievements } from './achievements/achievements.js';

export function createHUD() {
  const ach = createAchievements();

  // 监听解锁，若需要也可在 HUD 吐司中展示
  ach.onUnlock(({ name }) => {
    // hud toast 与 ach toast 各自独立，互不干扰
  });

  function update(s) {
    // … 原有 HUD 逻辑 …

    // 每帧推送状态
    ach.update({
      speedKmh:   s.v * KMH,
      distanceKm: s.dist / 1000,
      offroad:    s.offroad ?? 0,
      hops:       s.hops ?? 0,
      altitudeM:  s.y,
      mode:       currentCameraMode,
    });
  }

  return { update, ach };
}
```

---

## 兼容性

| 特性 | 备注 |
|------|------|
| 纯 ES 模块 | 需要浏览器支持 `type="module"`（Chrome 61+、Firefox 60+、Safari 11+） |
| localStorage | try/catch 包裹，私人模式或存储配额超限时**静默降级**，成就仍可在本次会话内解锁 |
| DOM 提前调用 | 所有 DOM 操作均延迟到实际需要时（首次吐司/面板），可在 `DOMContentLoaded` 之前安全调用任意 API |
| 减少动画 | 完全尊重 `prefers-reduced-motion: reduce` |
