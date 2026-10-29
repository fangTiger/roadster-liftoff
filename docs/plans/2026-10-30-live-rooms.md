# 实时房间第 1 批实现计划

目标：实现 add-live-rooms 的 1.1–1.7；不实现碰撞，不修改单人物理、计时和链上模块。
架构：独立纯逻辑房间状态机 + ws 适配器；浏览器按服务器时钟推进本机 session，远端车辆仅插值渲染。
技术：原生 ESM、ws、three.js、Vite、node:test、Playwright（全部使用现有依赖）。

1. 先写 server/rooms/rooms.test.mjs，覆盖协议、阶段、席位、限流、恢复与结算；运行失败后实现 rooms.js 和 server.js。
2. 先写 src/net 的插值与客户端测试、src/race/grid.test.mjs；运行失败后实现插值、时钟同步、重连与发车格。
3. 先写远端车与界面行为测试；实现 remote-car.js、room-ui.js、room.css、中英文词条；沿用 HUD 的深色面板、青色高亮、金色标题与现有字体，新增类统一 rm-。
4. 接入 src/race/index.js，复用 setup/simulate/render；房间独立循环跟随服务器步数，每帧追赶最多 240 步；状态上报 15Hz，成绩仅交房间服务。
5. 增加首页入口、暂停菜单离房回调、package.json 启动脚本和 Vite WebSocket 代理。
6. 编写 scripts/rooms-e2e.mjs：双页建房加入、准备选图、机器人完赛、核对结算。服务由用户启动，能访问时运行。
7. 独立代码审查，修复发现的问题；运行全仓 node --test 与 npx vite build，再核对 spec 和 tasks.md，仅勾选已完成项目。不提交 git。
