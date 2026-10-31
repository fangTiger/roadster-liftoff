# 大厅第三版审查修复

目标：按本轮四项审查意见修复已有大厅行为；沿用 `polish-party-visuals`，不新增协议或比赛能力。

设计：保留深蓝灰展厅、暖金面板与座位色。主车和侧车固定为相对镜头左前方 40 度；准备先闪灯，再短暂转身展示尾焰并复位。名牌从展台前沿投影点向下避让所有车辆。地图使用同一套高清实拍资源，在弧形屏四边渐隐，底部雾化；面板收起选择时仍显示当前图的小卡片。

执行与检查：
1. `src/race/lobby/composition.test.mjs`、`visuals.test.mjs` 先覆盖朝向、准备时序、车身投影、跨车避让、曲率和纹理过滤；运行确认失败。
2. `garage-motion.js`、`garage-layout.js`、`garage-screen.js` 实现上述规则，`garage.js` 接入真实渲染与只读诊断；运行定向测试。
3. `room-ui.test.mjs` 先验证非房主收起时仍显示当前图及双语元数据；`room-ui.js`、`garage.css` 实现常驻小卡片。
4. `capture-track-previews.mjs` 从真实游戏拍摄 1920×1080 图并压缩，替换三张 WebP；不使用插画替代实景。
5. `capture-garage.mjs` 真建房与加入、满员截图；对六张名牌和六辆车做全部 36 组 DOM/投影矩形检查，覆盖桌面、准备转身、手机和非房主，记录真实渲染帧率。
6. 执行 `npm test`、`npx vite build`，逐张读取 `scratchpad/lobby-3/` 截图。更新 tasks 的实际状态，保留用户最终验收项；提交中文信息并附指定 Co-Authored-By，不推送、不部署，不读取或修改 `.env` 和私钥。
