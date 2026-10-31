# 大厅旋转与音乐实施计划

**目标：** 按 upgrade-room-lobby 规范完成 3.1、3.2，并在 phase1-ghost 原分支提交。

**方案：** 复用车辆投影包围盒建立触控命中层，独立旋转控制器处理跟手、惯性和三秒恢复；准备动画在用户控制期间不覆盖车辆。复用 createAudio 的媒体播放与 Web Audio 总线，惰性创建大厅曲目，由房间 UI 阶段驱动播放、淡出和停止，音乐偏好沿用本地音频存储。

**技术：** Three.js、Pointer Events、Web Audio、node:test、Vite、Playwright。

1. 先添加旋转角度、完整转圈、惯性衰减、三秒恢复、减少运动测试，运行并确认失败；实现纯旋转控制器，再接入车辆命中层、指针捕获和首次提示。
2. 先添加音乐惰性加载、自动播放重试、进入大厅、倒计时淡出、回大厅、离开、静音和独立开关的失败测试；在 src/audio/audio.js 复用现有总线与播放函数，实现状态切换。
3. 在 src/race/index.js 的既有设置加入中英文音乐开关，通过 room-race/room-ui 接入阶段回调；补房间 UI 生命周期测试。
4. 运行 npm test、npx vite build；浏览器验证桌面拖车、手机触控与空白滚动、按钮、提示、音乐状态，截图保存到用户指定目录。
5. 核对规范、仅勾选 tasks.md 3.1/3.2，检查改动边界，以中文提交并添加指定 Co-Authored-By。

**边界：** 不修改 server/rooms/directory.js、src/race/lobby/room-browser*，不修改 .env、密钥或用户未提交内容；不推送、不部署。

## 验证记录

- 新增旋转控制器、音乐接口和生命周期测试，先确认失败，再实现；审查发现的手势解锁和倒计时重复解锁问题均有失败复现与通过记录。
- `npm test`：500 项通过，0 失败。沙箱首次运行中的两项 HTTP 测试因本机端口监听被拒而失败，允许本机网络后完整重跑通过。
- `npx vite build`：通过；保留现有依赖注释与大块体积提示。
- `node scripts/race/capture-lobby-experience.mjs`：10 项浏览器交互检查通过，页面错误为 0；使用 8932/8933 真实服务。
- 桌面侧面与手机截图：用户指定 `scratchpad/lobby-4/` 下的 `01-desktop-car-side.png`、`02-mobile-car-rotate.png`，同目录 `browser-result.json` 保存实际音频增益等观测。
- `node --check` 检查音频、旋转、大厅和截图脚本；`git diff --check` 通过。
- 只读交叉审查完成，无剩余阻断问题。仅完成并勾选 3.1、3.2，未开展第 2、4 节。
