# 道具赛试玩反馈 5.2 实施计划

目标：落实已有 live-rooms 与 party-race 规范，其他车始终可定位，水雷向前预判投掷，显示瞄准标记。

设计：复用现有进度选敌与 BRAKE 输入位；落点计算放在 sim/items.js 的纯函数中，网络仅新增可选出手坐标。room-race 汇集显示车辆、小地图颜色与本地瞄准状态；场景层负责飞行和准星，保护与命中时序不变。

技术：现有 JavaScript、Three.js、node:test、Vite、Playwright；使用当前 phase1-ghost 分支，不读取密钥或 .env，不推送和部署。

1. 扩展 src/race/sim/items.test.mjs、bot-driver.test.mjs、room-items.test.mjs、server/rooms/rooms.test.mjs：覆盖预判、横向限制、路面收缩、无目标、确定性、消息兼容和机器人前后投掷。先运行观察失败，再实现落点、用道具和服务端白名单，复跑至通过。
2. 扩展 remote-car.test.mjs、ghost-hud.test.mjs、scene/items.test.mjs、room-race.test.mjs：覆盖不透明与断流显示、名牌遮挡和固定尺寸、其他车小地图、抛物线、准星可见条件与 BRAKE 接线。先运行观察失败，再修改对应实现与 index.js 接线，复跑至通过。
3. 为 package.json 补充 test 命令（由 node --test 自动发现现有测试），运行 npm test、npx vite build、git diff --check；golden 文件保持不变。
4. 本地 8932/8933 正在监听，执行 SCENARIO=bots node scripts/rooms-e2e.mjs，验证三车完赛、四种机器人道具及页面错误；审查差异、核对规范，更新 5.2 勾选，中文提交并附指定 Co-Authored-By。

验证记录：
- 逻辑与协议新增用例先失败，实现后 64 项通过；显示与接线新增 5 项先失败，实现后 24 项通过。
- 独立审查发现雾效和动态视角会影响名牌；补充红绿测试，按实际相机 FOV 换算并刷新当帧矩阵，名牌和准星关闭雾效。
- 最终 `npm test`：401 项通过、0 失败（包含原黄金快照测试）；golden.json 未改。
- `npx vite build` 成功；修改的 JS/MJS 均通过 `node --check`，`git diff --check` 通过；两份变更的 OpenSpec 严格校验通过。
- 最终 `SCENARIO=bots node scripts/rooms-e2e.mjs` 通过：困难机器人 2:47.117、真人自动驾驶 2:48.083、普通机器人 2:48.767；三车全部完赛，四类机器人道具均有使用，页面错误检查通过。首次沙箱启动被拒后在沙箱外运行；中途显示修正触发热重载，因此以最终重新运行结果为准。
- 5.2 已完成并勾选；5.1 用户试玩调参保持未完成。
