# 离地 LIFTOFF 界面外壳

独立原生 ES 模块，无依赖。模块动态追加界面，不改变现有 HUD 元素或游戏状态。`index.html` 仅追加样式链接；游戏入口仍由主工程师接入。

## 方案、规范与验收清单

项目尚未初始化 OpenSpec；本次按限定文件范围在此保留提案与需求增量。目标：统一加载、开始、暂停、设置、帮助、全屏和截图，保持现有玻璃 HUD 视觉。模块仅依赖传入的引擎、可空音频对象和回调，不接管渲染循环。

- [x] 加载进度限制在 0–1；加载完成前不开始，完成后首次按键或点击同步解锁音频，再调用开始回调一次，0.6 秒淡出。
- [x] 暂停与后台自动暂停；清空驾驶按键，暂停静音并在恢复时还原用户选择。
- [x] 四档画质、音量、静音、镜头抖动偏好、操作提示；存储读取与写入均容错。
- [x] 帮助、全屏、同任务渲染读回截图；工具栏不重复绑定音符静音处理器。
- [x] 弹层焦点循环与 Escape 返回；游戏运行时驾驶键正常透传。
- [x] 桌面双列、手机单列，弹层可滚动，支持减少动画偏好。

场景：加载到 42% 时显示进度与标签；调用 `hideLoading()` 后显示开始提示；空格开始时先解锁再回调，首次按键不传入车辆；P 打开暂停，设置中 Escape 返回暂停，再次 Escape 继续；游戏内 `/` 打开帮助，Escape 返回游戏；隐藏页面后保持暂停，返回页面仍需手动继续；切换低画质关闭真实阴影和泛光；K 下载带本地时间的 PNG。

## API

```js
import { createUI } from '../ui/ui.js';
const ui = createUI({ engine, audio, onStart, onPauseChange, onQualityChange });
```

每个页面创建一次。`engine` 为 `createEngine()` 返回对象；`audio` 为 `createAudio()` 返回对象或 `null`。回调均可省略。

| 成员 | 说明 |
| --- | --- |
| `showLoading(progress0to1, label)` | 更新加载进度与文字；非法进度按 0，超界值截断。开始后不再重新打开加载页。 |
| `hideLoading()` | 进入等待手势状态，并不立即关闭开始界面。 |
| `paused` | 只读布尔值，由游戏循环据此跳过模拟。开始前另用游戏自身的 `started` 标记。 |
| `setPaused(bool)` | 设置暂停，状态未变时不重复回调。 |
| `toggleHelp()` | 切换帮助；返回先前面板；游戏中打开帮助不暂停模拟，但阻止驾驶输入并清空按键。 |
| `screenshot()` | 返回 `Promise<boolean>`；渲染后立即调用 `toBlob`，成功下载并闪白、提示。失败时返回 false 并提示。截图只含渲染画布，不含 HTML HUD。 |
| `quality` | 只读中文档位：`低`、`中`、`高`、`极致`。默认高。 |
| `shakeEnabled` | 只读镜头抖动偏好。默认 true；需游戏镜头消费，模块不会修改相机位置。 |
| `onStart()` | 首次开始手势中，在 `audio.unlock()` 同步调用之后执行，不等待音频 Promise。 |
| `onPauseChange(bool)` | 暂停变化时执行，包括页面隐藏。 |
| `onQualityChange(preset)` | 初始应用与每次修改画质时执行，参数为中文档位。初次回调在 `createUI()` 返回前执行，避免在此时引用尚未赋值的 `ui`。 |

质量：低与中像素比为 1；高为 `min(devicePixelRatio, 1.5)`；极致为 `min(devicePixelRatio, 2)`。只有低关闭阴影与泛光，其余开启。同步设置 renderer/composer 像素比和 composer 尺寸，原引擎继续负责 resize。低画质不移除游戏单独绘制的接地暗斑。

设置保存在 `liftoff.ui.v1`。音量默认 80%；无 UI 存档时静音初值读取 `audio.muted`。暂停时 `audio.setMuted(true)` 也会触发音频模块自己的存储，所以 UI 独立保存暂停前的真实偏好。音符、M、H 继续由现有入口处理；暂停菜单打开期间它们不透传，使用设置开关修改静音。

## 接入现有 src/game/index.js

1. 在现有 import 区添加：

```js
import { createUI } from '../ui/ui.js';
```

2. 将现有 `const audio = ...` 移到 `createEngine()` 后、任何资源 `await` 之前，再接上下面代码。音频对象只创建一次；保留后面的 `flight.setMusic(audio)`、M/H、音符和成就音效绑定。

```js
const audio = CAPTURE ? null : createAudio({
  urls: {
    road: '/assets/music/road-80s-synthwave.mp3',
    space: '/assets/music/space-cosmos.mp3',
    oldfriend: '/assets/music/oldfriend-reflected-light.mp3',
  },
});
let started = CAPTURE;
const ui = CAPTURE ? null : createUI({
  engine,
  audio,
  onStart() { started = true; },
  onPauseChange(paused) {
    // 暂停状态由下方循环读取；此处可通知其他游戏子系统。
  },
  onQualityChange(preset) {
    // 像素比、阴影和泛光已由 UI 应用；此处可按档位调整粒子数量。
  },
});
ui?.showLoading(0, '加载沙漠全景…');
```

3. 在现有资源加载语句之间追加进度；不要重复创建资源：

```js
// 紧接 await createDesert(...) 之后。
ui?.showLoading(.25, '加载推进器超跑…');
// 紧接 await createCar() 之后。
ui?.showLoading(.45, '加载太空环境…');
// 紧接 await createSpace(...) 之后。
ui?.showLoading(.7, '加载天空与云海…');
// 所有资源、HUD、输入与音频事件均已准备好后。
ui?.showLoading(1, '准备起飞…');
engine.render();
ui?.hideLoading();
```

删除入口现有 `const unlock = ...` 及其 `keydown`、`pointerdown` 两条监听注册，避免点击开始前旧 pointerdown 已调用音频解锁。保留 M/H 与 ♪ 处理器；UI 不绑定第二个音符点击处理器。若需要音频失败重试，请由新的直接用户手势再次调用 `audio.unlock()`。

4. 替换非 CAPTURE 分支中的 `setAnimationLoop`，保留现有 `last` 定义；每帧先更新时间，避免恢复时累积暂停期间的 dt：

```js
renderer.setAnimationLoop(now => {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (!started || ui.paused) {
    engine.render();
    return;
  }
  frame(dt, input.state());
});
```

将原来启动时的“按 W 起步”toast 移到 `onStart()` 中，可避免在加载期间消失。`hud` 在手势开始时已初始化，可直接在回调使用。

5. 镜头抖动：现有 `createChaseCamera` / `createFlight` 没有关闭抖动的接口，所以此提交仅暴露偏好。主工程师在镜头抖动应用位置读取 `ui?.shakeEnabled ?? true`，或将这个读取函数注入镜头模块，使关闭时抖动幅度为 0。CAPTURE 分支保持现有行为。

## 演示与验证

```sh
node --check src/ui/ui.js
npx vite build
npx vite --host 127.0.0.1 --port 8941 --strictPort
```

打开 `http://127.0.0.1:8941/src/ui/demo.html`。演示页使用普通 2D 画布和音频替身，不加载游戏资源；初始固定显示 42%，可在控制台调用 `ui.hideLoading()` 进入开始提示，之后正常操作。`window.demoCalls` 记录引擎、音频与回调调用，`window.demoEngine`、`window.demoAudio` 可用于交互检查。演示页不写入生产构建入口。

`shots/` 保存 Chrome 无头验证的六张截图：加载、开始提示、暂停、设置、帮助、390×844 手机。验收包含快捷键透传/拦截、静音恢复、四档画质、音量与设置持久化、焦点循环、截图下载命名、页面隐藏暂停和空音频对象兼容。未执行真实设备音频听感或游戏镜头接入验证；它们需要主工程师完成入口接入后检查。

本次验收结果：`node --check src/ui/ui.js`、`git diff --check`、`npx vite build` 均通过；使用项目 Playwright 的 `chromium.launch({ channel: 'chrome' })` 通过 31 项交互断言，控制台无错误或警告。构建提示 three.js 后期处理分块超过 500 kB，不影响构建成功。截图均已目视检查，测试服务器已关闭。
