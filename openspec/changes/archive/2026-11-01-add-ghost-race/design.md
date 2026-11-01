# Design: 影子赛与服务器核实

## 录像格式（沿用 src/race/sim/replay.js）
- { v: SIM_VERSION, track: trackHash, laps, steps, data }，data 为按键游程编码的 base64。三圈录像通常几 KB，困难图密集按键约 71 KB。
- 新增字段 trackId（1/2/3）。服务器拒绝 v 或 track 与当前代码不一致的录像。

## 影子回放（客户端）
- 影子 = 另一份 createSession，用录像的按键逐步推进，与玩家会话同步步进（每步约 0.03 ms，开销可忽略）。
- 只显示录像中的最快圈：影子会话从头跑，玩家开始某一圈时，影子从其最快圈的起点对齐（记录最快圈开始的步数，跳步预先算好状态快照）。简化方案可接受：影子与玩家同时发车，完整重放三圈；最快圈对齐作为可选优化。
- 影子车：复用 src/game/car.js 的车模型，材质半透明（不透明度 0.35、发蓝光）、不投影、无碰撞；车顶上方显示名字（「我的最佳」或钱包缩写）。
- HUD：每过一道检查点，显示与影子在同一检查点的时间差。

## 我的最佳（本地）
- 完赛后若某地图的最快单圈好于本地记录，把整局录像存入 localStorage（键 race.ghost.<trackId>），读写全部 try/catch。

## 核实接口 POST /api/verify
- 请求：{ address, trackId, replay, bits0to19 }。
- 校验：录像版本与赛道哈希、步数上限（每圈 300 秒 × 3 圈 + 倒数）、请求体大小（≤ 128 KB）、地址格式。
- 重放：Node 中 runReplay（与浏览器同一份 src/race/sim 代码），得到 lapTimes、bestLap、完赛统计；竞速成就位 20–27 由服务器从统计算出；位 0–19（太空模式成就）无法核实，原样采用客户端提交值。
- 签名：EIP-712 Lap(player, trackId, lapMs, achievements, deadline)，deadline = 现在 + 30 分钟，域 = MarsRoadsterRacing / 1 / chainId / 合约地址；核实者私钥来自 VERIFIER_PRIVATE_KEY。
- 存储：若该地址在该地图的核实最快圈比已存的更快，覆盖存入 Blob（路径 ghosts/<chainId>/<trackId>/<address>.json，公开读取）。
- 本地：GHOST_STORE=file 时复用存储接口，写入 .local-data/ghosts/<chainId>/<trackId>/<address>.json；单进程跨实例按路径串行写入、临时文件原子替换。开发文件存储不用于多进程部署；线上默认仍使用 Blob 条件写入。
- 响应：{ lapMs, achievements, deadline, signature }。错误返回 JSON 400（录像无效 / 未完赛）、413、429（同一 IP 每分钟 10 次）、503。

## 影子列表 GET /api/ghost?trackId=1
- 读链上该地图排行榜（verified 为 true）前 20 名，返回 [{ address, bestMs, url }]，url 指向 Blob 中的录像（不存在的跳过）。

## 合约
- 合约已有核实者机制（setVerifier），不需要重新部署。启用步骤：生成核实者私钥 → 配置 Vercel 环境变量 → 部署接口 → owner 调 setVerifier。启用前后的成绩都保留，链上记录带 verified 标记。

## 测试
- 重放一致：同一录像在 Node 两次 runReplay 结果相同；篡改一位按键圈速改变；版本 / 赛道哈希不符被拒。
- 签名：用测试私钥签出的签名，经 viem recoverTypedDataAddress 还原为核实者地址；字段与合约 LAP_TYPEHASH 一致（与链上 lapTypehash() 比对，测试网只读调用）。
- 影子：录像回放的影子会话与原局逐步状态一致；HUD 时间差计算。
- 接口：注入假存储与假签名者的单元测试，Node 原生 HTTP 本地服务适配 Web Request/Response（默认 8934），开发 Vite 代理 /api；100 KB 请求和真实流 128 KB 上限均有覆盖。
- 开发自动驾驶：仅 import.meta.env.DEV 且 URL 参数 e2eAutopilot=1 时加载确定性 hard 驾驶器，每个物理步产生正常输入；服务端不放宽任何校验。生产构建测试扫描全部 JS，禁止包含开关、开发模块及诊断入口。
- 浏览器端到端：scripts/chain/e2e-ghost.mjs 使用 Node 侧环境变量账户签名，浏览器只得到受限 RPC；检查已核实交易及无钱包上下文中的影子下载、挂载与移动。--before-wallet 无需私钥，停在连接按钮前。真实测试网验收由审查者运行，tasks 3.2 保持未勾选。

## 风险
- 浏览器与 Node 的浮点一致性：已有 Chrome 录像在 Node 重放一致的验证；Safari / Firefox 在实施时补测，不一致的录像核实会失败（玩家可重跑）。
- 核实者私钥泄露：只放在 Vercel 敏感环境变量与本机受限文件中；泄露后 owner 可立即 setVerifier 换钥。
