# 机器人补位实施计划

目标：完成 add-party-race 的 2.1–2.5，保持单人模拟和现有双页场景不变。
架构：服务端只维护座位和授权；房主在同一物理循环中推进自己的车和机器人，直接交换本地接触状态。机器人驱动独立管理难度与转向队列。
技术：原生 ES 模块、node:test、现有 Playwright、Vite；不安装依赖，不提交。

1. 为 server/rooms/rooms.test.mjs 增加权限、容量、阶段、机器人状态/完赛、掉线与移交测试；确认失败后修改 rooms.js，复跑。
2. 为 autopilot 和 bot-driver 增加 2000 步原始输入摘要、延迟队列、三档三圈测试；确认失败后增加 opts 与驱动，复跑。
3. 为房间循环补齐机器人同步步数、接触、代发、结束与身份移交测试；确认失败后实现 room-bots.js 并接入 room-race.js。
4. 为大厅和名牌补齐中英文测试；确认失败后接入难度选择、增删按钮和本地化名字。
5. 扩展 scripts/rooms-e2e.mjs 的 SCENARIO=bots；运行机器人与默认场景、全量 node:test 和 vite build；更新 design.md 和 tasks.md。
