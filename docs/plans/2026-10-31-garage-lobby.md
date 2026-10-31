# 车库大厅实施计划

**目标：** 完成 polish-party-visuals 2.1–2.3，保留房间协议和所有 data-rm-* 操作，查清黑色半圆。
**架构：** createGarage 管理独立渲染器和投影名牌；房间 UI 仅在已入房的 lobby 挂载、更新，开赛/离开释放。车辆工厂缓存源模型，每个展示实例独立克隆几何、材质和纹理，异步加载用代际检查避免旧结果覆盖。
**技术：** three.js 0.180、原生 ES 模块、node:test、Vite、Playwright。

## 设计判断
采用深色金属与暖白建筑灯带的豪华展厅。六席沿浅弧等距展开，微俯视镜头完整取景；名牌位于台前。单排比前后两排更便于辨认座位与操作，手机沿用同一展区并允许横向滚动，右侧玻璃列改底部抽屉。纯 CSS 展厅无法展示真实车漆反射；逐车独立场景会增加渲染成本，因此复用一个场景。

## 实施顺序
1. 将车库原有 33 项测试改为直接导入生产代码（原测试为副本），加入实际相机取景、异步替换/释放、模型独立着色和 UI 生命周期失败测试。
2. 重做取景与环境、名牌样式、光池、准备/入离场动画、减少运动和暂停/释放。
3. 接入 room-ui，保留难度下拉框、邀请、模式、选图、准备、机器人增删；补双语文字与赛道缩略图/圈数。
4. 通过实际房间交互截取桌面/手机各四种人数状态，检查重叠、边界、页面错误、动画及性能。
5. 对黑色半圆复现并隔离物体/天空/相机因素；若属真实问题先回归测试再修复。
6. npm test、npx vite build、双页与机器人端到端、OpenSpec 严格校验、golden 无变更检查；按实际结果勾选任务，中文 commit 附指定署名。

## 验证与截图（2026-10-31）

- `npm test`：448 项通过、0 失败，包含原有模拟、道具判定和 golden 回归。
- `npx vite build`：成功，保留现有超过 500kB 的包体积提示。
- `node --check`：展厅、车辆工厂、房间 UI 和截图脚本语法检查通过。
- `git diff --check`、`git diff --exit-code -- src/race/sim/`：通过；golden、模拟和录像格式未修改。
- `OPENSPEC_TELEMETRY=0 openspec validate polish-party-visuals --strict`：通过。
- 独立审查后增加源位图释放、普通车型离场与后台绘制回归；定向 57 项测试通过。源车的 ImageBitmap 由最后的 loader 释放，克隆纹理共享位图期间不会提前关闭。
- `node scripts/race/capture-garage.mjs`：通过；真实建房、加入、名牌加删机器人、准备、语言切换和离开释放；页面错误 0、控制台警告 0。
- 桌面 1440×860、手机 390×844：1 人、3 人含机器人、6 人、他人准备各一张，共 8 张；另外截图手机末席和英文减少运动模式。已逐张查看，名牌无交叠，六席在桌面面板左侧，手机可横向浏览且准备按钮吸底可见。
- 像素比在 deviceScaleFactor=2 下仍为 1.5。最终独立满员测量平均 20.97ms（约 47.7 FPS），p95 33.4ms；截图脚本断言平均帧间隔低于 33.34ms。本机 Chrome/Metal 测得，未在低端实体手机上实测。
- 初次并发两组比赛与截图测量约 16 FPS，此结果受多页面 GPU 压力影响；同时发现原大厅每帧仍绘制被遮住的赛道，已通过生产循环测试后跳过重复绘制。最终测量在没有并发比赛时进行。

### 天空黑色半圆调查

结论：上一批外观摆拍脚本导致，正常游戏无此问题，无需修改天空渲染或物理。

`/private/tmp/roadster-visuals-capture.mjs` 的 `look()` 直接改相机位置并调用 `engine.render()`，未调用游戏每帧使用的 `sky.update()`。金币近景把相机从约 `[0.017, 2.192, 60.305]` 移到 `[508.974, 1.84, 414.213]`，天空球却仍停在原中心。半径 1500 的球面在偏离中心约 620 米后会落出相机 1800 米的远裁剪面，露出黑色背景，形成半圆。

对照实验中全部 8 张天空分块均已加载（含预览共 9 个子网格）。保持金币近景相机不变，仅将天空球中心移到当前相机位置，黑色半圆完全消失；正常驾驶视角也没有半圆。检查了三张对照截图：

- `sky-normal-driving.png`
- `sky-staged-stale-center.png`
- `sky-staged-recentered.png`

### 临时产物

全部位于 `/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/visuals-2/`，不提交截图或 JSON。

主截图：`desktop-1-driver.png`、`mobile-1-driver.png`、`desktop-3-with-bot.png`、`mobile-3-with-bot.png`、`desktop-6-full.png`、`mobile-6-full.png`、`desktop-ready.png`、`mobile-ready.png`。

附加：`mobile-6-full-right.png`、`desktop-ready-en-reduced-motion.png`、三张天空对照图、`browser-result.json`。

### 源码冻结后的端到端结果

- `SCENARIO=bots node scripts/rooms-e2e.mjs`：退出码 0，真人与普通/困难机器人全部完赛，使用 mine、missile、nitro、shield 四类道具，返回大厅成功，无页面错误。
- `node scripts/rooms-e2e.mjs`：退出码 0，两页结算一致，全部完赛，返回大厅成功，无页面错误。
- tasks 2.1–2.3 已按实际完成情况勾选；3.1 留待用户查看效果后确认。未 push、未部署，未改私钥或 `.env`。
