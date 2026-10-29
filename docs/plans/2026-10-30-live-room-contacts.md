# 实时房间第 2 批实施计划

目标：落实 add-live-rooms 的 2.1–2.3；单人确定性模拟、SIM_VERSION 与现有参数保持一致。

架构：会话在物理步后接入可选的胶囊体接触解析；房间按模拟时间采样远端车，仅接触解析修改自己的车。重置保护与完赛状态由 session.ghost 提供给协议和表现。

技术：现有 JavaScript、node:test、Three.js、Web Audio、WebSocket；不安装依赖、不提交。

1. 在 contact.test.mjs、session-contact.test.mjs 先覆盖胶囊重叠、单步推出总量、速度上限、追尾、确定性和保护期，运行确认失败；实现 contact.js、导出 closest、追加 tuning 参数和 session 可选回调，再运行所有 sim 测试（含原 golden）。
2. 在 interp.test.mjs、room-race.test.mjs、rooms.test.mjs 先覆盖模拟时间插值/外推、接收时间 stale、当前步接触采样与 air/ghost 校验转发，确认失败；实现 interp.js、room-race.js、rooms.js 与 index.js 接线，再运行对应测试。
3. 先覆盖本地及远端透明度恢复、contact 音量与镜头反馈；实现车身材质保护、合成闷响和轻微镜头 kick，再运行表现测试。
4. 自查规范与差异，运行全部 *.test.mjs、npx vite build、node --check scripts/rooms-e2e.mjs；尝试启动本地服务并执行现有双页脚本，记录沙箱限制。完成后更新 tasks.md 和 design.md。
