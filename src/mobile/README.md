# 移动端触控与自适应画质

## 提案与规范增量

项目未初始化 OpenSpec；已执行 `openspec list --specs`（无规范）和 `openspec list`（无 changes 目录）。按本任务文件边界，在此维护提案、需求场景与任务清单。

方案：保留原玻璃 HUD，以暖橙表示油门、冰蓝表示推进器。左下独立转向区，右下三踏板，中央留给车辆；触控和键盘状态合并。自动画质只改渲染分辨率与底档泛光，不接管游戏循环。入口由主工程师接入。

验收场景：两指同时转向与加速；移出按钮后松手、系统取消、失焦或暂停均释放；15% 中心死区不转向；竖屏提示可关闭；自动档持续慢帧 3 秒下降、快帧 6 秒恢复，不超过进入自动档时的用户设置；手动档无自适应写入。

任务清单：
- [x] 触控、多指与清理 API
- [x] HUD 横竖屏与安全区适配
- [x] 自动画质、阈值与用户上限
- [x] 构建、浏览器交互、截图目视验证

## API

### `createTouch({ input, onCamera })`

从 `touch.js` 导入。只在 `(pointer: coarse)` 或 URL 含 `?touch`（包括 `?touch=0`）时显示；监听指针类型变化。每页创建一次。

- `input`：`createInput()` 返回对象，新增 `setTouch(action, pressed)`、`clearTouch()`；`state()` 与 `keys` 保持原 API。触控只修改独立状态，`keys.clear()` 不释放触控，请使用下方 `release()`。
- `onCamera()`：点击镜头调用，接现有 `rig.cycle()`。
- `active`：只读，是否满足触控设备条件。
- `setEnabled(bool)`：在开始前、暂停、帮助、设置时关闭触控，同时释放所有动作；开启后不恢复此前按住状态。
- `release()`：释放本模块全部触点。
- `dispose()`：释放输入、事件、观察器和动态 DOM，可重复调用。

左侧相对于区域中心归一化到 -1…1，绝对值不超过 .15 时不转向。右侧可多指共同按住，同一动作最后一指释放才关闭。使用 Pointer Capture；支持移出释放、pointercancel、lostpointercapture、失焦、页面隐藏、resize 和 UI 给触控根元素加 `inert` 时释放。推进器外圈在两秒内填满，只表示按住时长，**不表示游戏推进剂余额**。支持轻震动和减少动画设置。

模块动态追加所有控制标记、补充缺失的 viewport，并为已有 viewport 追加缺失的 `viewport-fit=cover`。`index.html` 仅新增 CSS 链接。安全区由 CSS `env()` 读取；横屏建议只在竖屏手机显示，关闭对本次实例生效。

### `createPerf({ engine, getPreset, setPreset })`

从 `perf.js` 导入，默认不创建循环、不持久化设置。

- `QUALITY_PRESETS`：冻结的中文字符串数组 `['自动', '低', '中', '高', '极致']`，供 UI 按钮、选择器和存储校验共用。
- `getDefaultPreset()`：粗指针或 `?touch` 返回 `自动`（上限极致，慢帧时自动降档），桌面返回 `极致`。
- `getPreset()`：返回当前中文档位；只有 `自动` 会自适应。
- `setPreset(preset)`：当初始 getter 返回空值时，用设备默认值初始化；自适应不会反复调用它或把 UI 的“自动”改成“低”。必须与 getter 共享状态。
- `update(dt)`：每个正在游戏的帧调用一次，dt 单位为秒，传**未被物理步长裁剪的实际帧间隔**。EMA 时间常数 .5 秒；连续大于 24 ms 满 3 秒，当前像素比乘 .8，最低 .6；连续小于 14 ms 满 6 秒，恢复一档。区间中间值清空对应计时。
- 进入自动时快照实际像素比和 bloom 状态，作为用户上限；依次恢复此前下降的实际档位，不超过快照。`.6` 档关闭泛光；回升时恢复快照中的泛光状态，用户低档本就关闭时不会重新打开。
- renderer 与 composer 一同设置像素比，composer 同步视口尺寸；原 engine 的 resize 继续工作。首次降档显示一次小提示。
- `reset()`：清空帧时间与连续计时，保留质量档位；暂停/恢复调用即可。
- `refresh()`：宿主应用用户画质之后调用，清除旧恢复历史，下一帧重新捕获上限。即使暂停中经历“自动→低→自动”、两次 update 观察到同名档位，也能正确生效。
- `dispose()`：停止响应 update 并删除提示、清理定时器。

## src/game/index.js 精确接线

本任务没有编辑入口。下列代码适用于当前已接入 `createUI`、`started`、`ui.paused` 的入口；CAPTURE 保持原行为。

1. import 区追加：

```js
import { createTouch } from '../mobile/touch.js';
import { createPerf, QUALITY_PRESETS, getDefaultPreset } from '../mobile/perf.js';
```

2. **紧接 `const engine = createEngine(...)`，在创建 UI 前**追加。此 setter 同时是 UI 的画质变更回调；重复进入自动时重新应用用户上限，防止把已降档的像素比误当上限。

```js
let mobilePreset = getDefaultPreset();
let mobileCeiling = '高';
let perf = null;
function setMobilePreset(preset) {
  if (!QUALITY_PRESETS.includes(preset)) return;
  mobilePreset = preset;
  if (preset !== '自动') mobileCeiling = preset;
  const base = preset === '自动' ? mobileCeiling : preset;
  const ratio = base === '极致' ? Math.min(devicePixelRatio || 1, 2)
    : base === '高' ? Math.min(devicePixelRatio || 1, 1.5) : 1;
  engine.renderer.setPixelRatio(ratio);
  engine.composer.setPixelRatio(ratio);
  engine.composer.setSize(innerWidth, innerHeight);
  engine.renderer.shadowMap.enabled = base !== '低';
  engine.bloom.enabled = base !== '低';
  perf?.refresh();
}
if (!CAPTURE) setMobilePreset(mobilePreset);
```

3. **紧接现有 `const input = createInput()`**追加：

```js
const touch = CAPTURE ? null : createTouch({ input, onCamera: () => rig.cycle() });
perf = CAPTURE ? null : createPerf({
  engine,
  getPreset: () => mobilePreset,
  setPreset: setMobilePreset,
});
```

4. 保留 `let last = performance.now()`；用下列代码替换非 CAPTURE 分支现有动画循环：

```js
renderer.setAnimationLoop(now => {
  const elapsed = (now - last) / 1000;
  last = now;
  const playing = started && !ui.paused && !document.hidden;
  touch?.setEnabled(playing);
  if (!playing) {
    perf?.reset();
    engine.render();
    return;
  }
  perf?.update(elapsed);
  rig.shake = ui.shakeEnabled;
  frame(Math.min(.05, elapsed), input.state());
});
```

帮助/设置层通常由 UI 的 `inert` 自动阻止触控，并立即释放按住的动作；若宿主使用其他模态机制，打开前调用 `touch?.setEnabled(false)`，并将对应状态加入 `playing` 判断。

5. UI 画质选择器的接入（**由主工程师修改，本任务没有编辑 src/ui/**）：

- 将 UI 内的 `PRESETS` 改为导入 `QUALITY_PRESETS`，初始 `settings.quality` 使用 `getDefaultPreset()`；存储加载仍优先采用用户保存的合法档位。
- `createUI({ ... })` 增加 `onQualityChange: setMobilePreset`，创建后执行 `if (ui) setMobilePreset(ui.quality)`。首次回调时 setter 已定义，避免暂时性死区。
- 保留 UI 的手动档应用，`自动` 档的应用交给上述 setter。建议在 `applyQuality()` 最前面为自动增加分支：`if (settings.quality === '自动') { onQualityChange('自动'); return; }`。这样自动档不会被 UI 的手动档分支覆盖。
- UI 默认与模块默认必须同步；否则原 UI 初始化的“高”会覆盖触屏的“自动”。若保存了用户手动档，不覆盖它。
- 现有 `.ui-quality` 四列可以改成五列或 `repeat(auto-fit,minmax(64px,1fr))`，供五个按钮排布。
- 建议把开始 toast 文案改为：`touch?.active ? '按住加速起步' : '按 W 起步'`，说明文字相应使用“左侧拖动转向，按住推进器升空”。回调只在资源加载完成后点击开始时读取 `touch`。

退出游戏或热卸载时：`touch?.dispose(); perf?.dispose();`。不要在每次暂停重新创建模块。

## 验证与截图

测试脚本使用 `/tmp` 临时文件，不增加依赖或提交测试辅助入口；游戏接线仅在 Playwright 路由响应内注入，不写入 `src/game/index.js`。测试期间主工程师已将现有 UI 接入入口，因此使用真实开始屏点击开始。

已执行：

```sh
node --check src/mobile/touch.js
node --check src/mobile/perf.js
node --check src/game/input.js
node /tmp/liftoff-mobile-unit.mjs
node /tmp/liftoff-mobile-browser.mjs
git diff --check
npx vite build
```

结果：语法检查、输入/性能回归测试、空白检查和 Vite 构建均通过。构建仍有现有 three.js 后期处理分块超过 500 kB 的提示。

浏览器使用项目 Playwright、`chromium.launch({ channel: 'chrome', headless: true })`，测试服务器为 `npx vite --host 127.0.0.1 --port 8942 --strictPort`。iPhone 14 参数：390×844，横屏 844×390，`isMobile: true`、`hasTouch: true`、`deviceScaleFactor: 3`；原生触摸点击开始，用 Chrome CDP 多点触屏事件（产生真实 Pointer Events 和捕获）按住加速 3 秒、推进器 2 秒。24 项断言覆盖多指转向与踏板、移出释放、系统取消、失焦、镜头、横屏建议关闭、桌面/强制触控启用，以及 390×844、844×390、1024×768、320×568、568×320 的 HUD 与触控区矩形不相交。页面错误为 0。

性能回归另外覆盖手动档不写入、慢帧降档、.6 下限与关闭泛光、快帧恢复、用户上限、极慢长帧，以及暂停期间低档→自动重新捕获上限且保持泛光关闭。

六张截图均已目视检查：
- `shots/landscape-start.png`：横屏开始页。
- `shots/landscape-throttle.png`：横屏加速与转向同时按住。
- `shots/landscape-jet.png`：横屏推进器与填满的外圈。
- `shots/portrait-rotate.png`：竖屏横屏建议。
- `shots/portrait-drive.png`：竖屏关闭建议，同时按住加速和推进器。
- `shots/small-landscape.png`：568×320 矮横屏。

尚未执行真机震动、刘海安全区实机检查或真机 GPU 帧率基准；设备条件由 Chrome 模拟。入口接线及 UI 五档选择器由主工程师按上文完成，测试服务器已关闭。
