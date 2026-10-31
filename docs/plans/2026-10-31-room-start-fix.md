# 房间开赛修复实施计划

**目标：** 只实现 upgrade-room-lobby 的 1.1–1.3，保持后续房间列表、加锁、旋转与音乐任务未完成。

**设计：** 沿用现有房间状态机、details 选图器和展台。服务器默认地图为 1，只有房主的 start 请求能开始比赛；界面根据服务器状态计算按钮和原因。再来一局先回大厅，客人准备，房主开赛。

**技术：** 原生 JavaScript、Node test runner、Vite、Playwright。

1. 修改 `server/rooms/rooms.test.mjs`，覆盖默认图、手动开赛、权限、人数、准备、断线、机器人、重复请求与再来一局。先运行确认失败。
2. 修改 `server/rooms/rooms.js`：默认 trackId=1，新增 start 分支，移除自动开赛，准备判断排除房主。
3. 修改 `src/race/room-ui.test.mjs` 与展台测试，覆盖服务器地图、弹框四种关闭、访客关闭、中英文按钮和原因、房主名牌、再来一局。先运行确认失败。
4. 修改 `src/race/room-ui.js`、`src/race/lobby/garage.js`、样式与中英文词典，实现上述行为并清理事件监听。
5. 调整 `scripts/rooms-e2e.mjs`、`scripts/race/capture-garage.mjs`，按访客准备、房主开赛操作。
6. 执行 `npm test` 与 `npx vite build`；在 8932/8933 服务上验证双页与房主加两个机器人，截图保存到用户指定 rooms-fix 目录。
7. 对照规范更新相关场景，只勾选 1.1–1.3，审查差异后中文提交并附指定共同作者；不推送、不部署、不读取私钥或 .env。

## 执行与验证结果

- 已完成默认地图、选图关闭、房主手动开赛与再来一局流程；补充中英文文案、断线宽限期原因与回归测试。
- 已更新两份既有端到端脚本，并新增 `scripts/rooms-lobby-e2e.mjs`，用于只验收本次大厅修复。
- `npm test`：491 项通过，0 项失败（HTTP 测试在允许本地端口监听的环境运行）。
- `npx vite build`：成功，保留既有分块体积警告。
- `openspec validate upgrade-room-lobby --strict`：通过；遥测上报网络不可用不影响校验。
- 真实双页及房主加两个机器人均收到 countdown 与统一 startAt；断线重连、桌面/手机关闭方式通过，无页面错误。
- 仅勾选 1.1–1.3，第 2、3、4 节维持未完成；未推送、未部署。
