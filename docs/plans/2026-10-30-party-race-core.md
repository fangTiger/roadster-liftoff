# 道具赛核心实施计划

目标：按 add-party-race 已批准设计完成 3.1–3.6，保留导弹槽与效果接口。
架构：纯函数负责道具箱、抽取和水雷判定；session 懒初始化效果队列；房间模块管理各本地车辆道具，服务端校验身份、阶段、限流和去重。远端使用 shield / trapped 状态渲染。
技术：现有 JavaScript、Three.js、WebSocket、node:test 与 Playwright，不安装依赖、不提交。

1. 为 items.js、effects.js / session、水雷边界和 rooms 协议补失败测试，运行验证 RED。
2. 实现 items.js、effects.js，新增 tuning 参数；接入 session，保留未调用效果的车辆字段和 golden。
3. 实现 rooms 的 pickMode、mode 下发、可选 shield / trapped 校验、item / mineHit；机器人用 botId 严格验证所属身份，独立限流。
4. 为本地槽、拾取刷新、延迟使用、机器人立即使用及水雷消息补失败测试；拆出 room-items.js 与共享资源渲染模块。
5. 结合现有大厅 / HUD 风格增加模式按钮与 rh- 道具槽；接入 room-race 固定步、session.applyEffect、音效与远端壳体；竞速模式不创建道具对象。
6. 修改 bots 端到端场景为道具赛；观察氮气、护盾、水雷使用与完整结算，检查页面异常。
7. 审查实现，补充 design.md 约定；运行全量 node:test、Vite build、OpenSpec 校验，确认 3.1–3.6 后勾选任务。

每个行为先观察失败，再写最小实现并运行定向测试。复杂问题先按 systematic-debugging 排查。用户已明确授权实施，沿用当前分支与已批准设计，不另开工作树或等待设计确认。
