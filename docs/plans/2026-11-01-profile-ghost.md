# 个人资料与影子选择实施计划

目标：实现已批准的 add-wallet-hub 1.7 与 add-ghost-race 3.4。

架构：个人资料对话框复用 NFT 卡片与独立榜单组件。每张地图使用单一影子选择器，共享带超时的接口读取缓存；沿用服务器榜单核实过滤与录像校验，不改模拟和服务端。

技术：原生 DOM、Vite、node:test、Playwright。

1. 修改 src/chain/wallet-hub.test.mjs、race-panels.test.mjs，先验证直接开资料、访客榜单与前 50 名边界失败；实现 wallet-hub.js 与 race-board.js。
2. 修改 src/race/ghost-menu.test.mjs，先验证预加载、自动优先级、记忆回退、钱包恢复、键盘操作及异步隔离失败；实现 menu.js 的单一下拉与共享来源。
3. 更新 index.js、样式、中英词条与受影响的浏览器脚本；删除旧榜单入口及菜单死代码。发车不等待录像网络请求，并提示降级。
4. 运行 node --test 相关测试，再执行 npm test、npx vite build、两项 openspec validate --strict、node --check 与无私钥 --before-wallet。
5. 使用现有 8932/8934 服务进行 Playwright 检查并保存 1400/390 宽截图；按规范复查后勾选任务，仅提交相关文件（中文提交信息）。
