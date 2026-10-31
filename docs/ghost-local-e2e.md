# 录像赛本地测试网联调

测试网合约：`0xbcc98b9635113a0669F97ce4122f3e2C5490dc59`（MarsRoadsterRacing，ABI 不变）。核实者：`0x35B6397E71713743FcC75701F0C66e30Efb0f9Ee`。

| 赛道 | qualifyMs | minLapMs |
| --- | ---: | ---: |
| 1 草甸 | 58000 | 15000 |
| 2 湖畔 | 62000 | 20000 |
| 3 阿尔卑斯 | 108000 | 30000 |

前端优先读取链上资格线，离线回退同步上述配置；核实请求体上限为 128 KB，仍按原规则重放录像。

## 启动

需要 Node.js、已安装的 npm 依赖及 Playwright 可调用的 Chrome。以下私钥均为占位符，仅审查者在自己的终端注入；不要把真实值写入文件或提交。Vite 已禁用 .env 自动加载，公开前端配置也通过进程环境变量提供。

终端一：

```bash
GHOST_STORE=file VERIFIER_PRIVATE_KEY='<核实者私钥占位符>' npm run dev:api
```

接口默认只监听 `127.0.0.1:8934`，包括 POST `/api/verify`、GET `/api/ghost`、GET `/api/nft/:id`、`/api/nft/image/:id` 和 `/api/nft/view/:id`。可用 API_PORT 改端口；更改后需同步 Vite 代理目标。本地 NFT 资源默认指向 `http://localhost:8932`，可用 SITE_URL 覆盖。

终端二（WalletConnect 项目 ID 是公开配置，从项目控制台取得）：

```bash
VITE_WALLETCONNECT_PROJECT_ID='<公开项目ID>' npm run dev -- --port 8932 --strictPort
```

只有开发服务器代理 `/api` 到 8934；生产继续使用 Vercel API。`GHOST_STORE=file` 保存录像到忽略提交的 `.local-data/ghosts/<chainId>/<trackId>/<小写地址>.json`，无需 Blob token，服务重启后仍可下载。文件模式仅供单进程本地联调；不设置 GHOST_STORE 时仍使用 Blob，需要 BLOB_READ_WRITE_TOKEN。

## 端到端脚本

终端三（这条命令会发送一笔测试网交易）：

```bash
PLAYER_KEY='<玩家私钥占位符>' node scripts/chain/e2e-ghost.mjs
```

脚本默认访问 `http://localhost:8932/`，可通过 E2E_URL 覆盖。默认使用上述测试网合约；如设置 RACING_ADDRESS，前端 VITE_RACING_ADDRESS、核实 API 与脚本必须同步。建议使用未上报过草甸成绩、持有足够测试网 USDC 的玩家钱包。已有更快记录且无新成就时，界面会禁止重复提交；脚本会失败，需换用可产生新纪录的钱包。玩家需进入已核实榜单前 20，第二页面才能从榜单选中该影子。

脚本通过 EIP-6963 公告注入钱包，私钥和签名客户端留在 Node 侧。依次连接钱包、选择草甸、自动跑完三圈、上传核实、提交签名成绩、核对 `bestOf(玩家,1).verified=true`，再打开独立无钱包上下文，选中对应排行榜影子、下载并检查影子已挂载且随比赛移动。输出每一步状态和交易哈希。核实失败不发送成绩交易。

无私钥检查（无需启动核实 API，也无需 WalletConnect 项目 ID）：

```bash
node scripts/chain/e2e-ghost.mjs --before-wallet
```

此模式选草甸、自动跑完三圈并停在「连接钱包」按钮前，不读取 PLAYER_KEY、不注入钱包、不核实签名、不发送交易。DEV 自动驾驶开关为 `?race&e2eAutopilot=1`，生产构建已剔除该开关与开发诊断。

截图目录：

```text
/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/e2e-ghost/
```

失败保存当前已打开页面截图；浏览器本身未能启动或页面已关闭时可能无法截图。成功的无私钥检查保存 before-wallet.png，正式流程保存 ghost-together.png。

## 验收与上线

```bash
npm test
npx vite build
```

测试使用模拟签名或内存测试账户，不需要真实私钥。生产构建剔除检查直接使用 Vite 编译全部模块；核实重放单元测试确认 hard 驾驶器可以在 58 秒内完成最快单圈。

审查者跑通真实测试网签名、交易与无钱包影子流程后，才勾选 add-ghost-race 的任务 3.2。Vercel 环境变量、Blob 和主网部署仍待上线，本次不部署、不推送。

2026-10-31 本次无私钥验证：`--before-wallet` 完成正式三圈，最快 41442 ms，停在连接按钮前；真实 RainbowKit 使用模拟 RPC 完成 MetaMask 连接、会话确认及弹窗关闭。HTTP 测试覆盖有长度与分块两种超限请求均返回 JSON 413。上述结果不代表真实测试网签名、交易及链上影子已验收。
