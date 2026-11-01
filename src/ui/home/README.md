# home-hero 模块

Mars Roadster 首屏英雄区：标题动画、模式卡片、链上直播条。  
纯 ES 模块，无依赖，无构建步骤。CSS 前缀 `hh-`，全部限定在 `.hh-root` 下。

---

## 快速接入

```js
import { createHomeHero } from './src/ui/home/home-hero.js';

const hero = createHomeHero({
  container,      // HTMLElement，挂载目标
  t,              // i18n 函数 (key, params?) → string
  modes,          // 模式配置数组，见下方
  onModeHover,    // (id | null) => void
  onModeSelect,   // (id) => void
  reducedMotion,  // 可选 boolean，默认读 matchMedia
});

hero.show();                  // 播放入场动画
hero.setLive(liveData);       // 推送链上数据（null = 隐藏条带）
```

---

## API

### `createHomeHero(opts)` → instance

| 参数 | 类型 | 说明 |
|------|------|------|
| `container` | `HTMLElement` | 模块渲染目标，内部懒建 DOM |
| `t` | `(key, params?) => string` | i18n 查找函数 |
| `modes` | `Mode[]` | 模式配置，见下方 |
| `onModeHover` | `(id\|null) => void` | 悬停/失焦回调，防抖约 80 ms |
| `onModeSelect` | `(id) => void` | 点击 / Enter / Space 回调（禁用卡片不触发） |
| `reducedMotion` | `boolean` | 覆盖 matchMedia；`undefined` = 自动读取并监听变化 |

### `Mode` 对象

```ts
{
  id:       string
  title:    string
  desc:     string
  badge?:   string          // 右下角标签文字，如「即将推出」
  disabled?: boolean        // 禁用时点击摇晃，不触发 onModeSelect
  preview: {
    type:   'image' | 'video'
    src:    string          // 图片 URL 或视频 URL
    poster?: string         // video 封面（用于卡片缩略图）
  }
}
```

### 返回值方法

| 方法 | 说明 |
|------|------|
| `show()` | 播放入场动画（≤2.2 s）；减少动效模式下立即显示 |
| `hide()` | 淡出隐藏（300 ms）；减少动效模式下立即隐藏 |
| `setLive(data \| null)` | 更新链上直播条；null 或空数据 → 隐藏条带 |
| `setLang()` | 重新调用 `t` 刷新全部文字（保留焦点） |
| `focusFirst()` | 聚焦第一个可用卡片 |
| `destroy()` | 停止所有监听，释放视频资源，移除 DOM |

### `setLive(data)` 数据结构

```ts
{
  minted:  number                    // 总铸造数
  tracks:  Array<{
    id:      number
    name:    string                  // 赛道名（通过 textContent 写入，防 XSS）
    bestMs:  number                  // 最佳圈速 ms
    holder:  string                  // 钱包地址，自动缩短为 0x1234…abcd
  }>
  latest: {
    kind:      'mint' | 'best' | 'achievement'
    holder:    string
    trackName?: string
    ms?:       number
    at:        number                // epochMs
    href?:     string
  } | null
} | null
```

---

## 导出纯函数（可单独使用/测试）

```js
import {
  formatLap,    // (ms: number) → "ss.mmm" | "m:ss.mmm"
  shortAddr,    // (addr: string) → "0x1234…abcd"
  relativeTime, // (at, now, t) → 相对时间字符串
} from './src/ui/home/home-hero.js';
```

| 函数 | 签名 | 示例 |
|------|------|------|
| `formatLap` | `(ms: number) → string` | `formatLap(87423)` → `"01:27.423"` |
| `shortAddr` | `(addr: string) → string` | `shortAddr('0xAbCd…5678')` → `"0xAbCd…5678"` |
| `relativeTime` | `(at, now, t) → string` | 用 `home.timeMinAgo` 等 key |

---

## i18n 键值对照表

模块使用所有以 `home.` 开头的键，必须添加到 `src/i18n/zh.js` 和 `src/i18n/en.js`：

| 键 | 中文 | English |
|----|------|---------|
| `home.eyebrow` | 推进器超跑 · 实时 3D | Thruster Supercar · Real-time 3D |
| `home.titleMars` | Mars | Mars |
| `home.titleRoadster` | Roadster | Roadster |
| `home.subtitle` | 离地 · 从沙漠公路直冲轨道，再返回 | Liftoff · Desert highway to orbit and back |
| `home.comingSoon` | 即将推出 | Coming Soon |
| `home.liveMinted` | 已铸造 {n} | {n} minted |
| `home.liveLatest` | 最新： | Latest: |
| `home.liveKindMint` | 铸造 | minted |
| `home.liveKindBest` | 最佳圈速 | new best lap |
| `home.liveKindAch` | 解锁成就 | unlocked achievement |
| `home.timeJustNow` | 刚刚 | just now |
| `home.timeMinAgo` | {n} 分钟前 | {n} min ago |
| `home.timeHrAgo` | {n} 小时前 | {n} hr ago |
| `home.timeDayAgo` | {n} 天前 | {n} d ago |

---

## 接入 ui.js

`ui.js` 现有结构：`.ui-loading > .ui-start-content`，模式按钮在 `.ui-start` 里。  
推荐的接入方式（**不修改 ui.js**，保持兼容）：

### 方式 A：Hero 接管（替换模式按钮区域）

```js
// 在 ui.js 的 hideLoading() 调用之前或之后接入
import { createHomeHero } from './home/home-hero.js';

const hero = createHomeHero({
  container: document.querySelector('.ui-start-content'),
  t,
  modes: [...],
  onModeSelect: (id) => {
    // 映射到 ui.js 现有行为
    if (id === 'race')   location.href = '/?race';
    if (id === 'room')   location.href = '/?race&room';
    if (id === 'space')  start();         // ui.js 内部方法
    if (id === 'season') toast(t('mode.soon'));
  },
  onModeHover: (id) => {
    // 可选：驱动 3D 相机
    engine?.setCameraTarget?.(id);
  },
});

// 加载完成后
hero.show();
// 注入链上数据（监听 WebSocket room 消息等）
onChainUpdate(data => hero.setLive(data));
```

### 方式 B：独立 overlay

在 `index.html` 中新增一个 `position:fixed; inset:0` 的容器，  
将 `container` 指向该容器，Hero 与现有 HUD 完全隔离。  
`hide()` 后将容器的 `z-index` 设为 `-1` 以让 HUD 显示。

---

## 性能注意事项

- 视频只在首次 hover 时设置 `src`，不预加载。  
- 同时只允许一个视频播放；hover 另一张卡片时前一个视频暂停。  
- 动画只使用 `transform` / `opacity` / `filter`，不触发 layout。  
- `prefers-reduced-motion: reduce` 时所有动画 / 过渡 duration 强制为 0.001ms。  
- `destroy()` 会移除 `matchMedia` 变化监听和所有定时器，防止内存泄漏。

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `home-hero.js` | 核心模块 + 纯工具函数 |
| `home-hero.css` | 样式，CSS 前缀 `hh-` |
| `home-hero.test.mjs` | 纯逻辑单元测试，`node --test` |
| `demo.html` | 独立演示页，无需服务器 |
| `README.md` | 本文档 |
