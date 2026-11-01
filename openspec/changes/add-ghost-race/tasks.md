## 1. 录像与影子（Codex 第 1 批）
- [x] 1.1 录像加入 trackId；完赛后保存本地最佳录像（localStorage，try/catch）
- [x] 1.2 影子会话：用录像按键同步推进的第二个会话
- [x] 1.3 影子车外观（半透明、不投影、名字标签）
- [x] 1.4 HUD 检查点时间差；选图界面的影子选项（无 / 我的最佳 / 排行榜第 N 名）
- [x] 1.5 测试：影子与原局逐步一致、时间差计算

## 2. 核实与影子接口（Codex 第 2 批）
- [x] 2.1 api/_lib/replay：校验与 Node 重放，计算竞速成就位
- [x] 2.2 api/_lib/sign：EIP-712 Lap 签名（私钥只从环境变量读）
- [x] 2.3 api/_lib/ghost-store：Blob 存取（可注入，测试用内存实现）
- [x] 2.4 POST /api/verify、GET /api/ghost 与单元测试
- [x] 2.5 前端提交流程：先调 /api/verify 取签名再 submit；排行榜默认只显示已核实
- [x] 2.6 scripts/chain/set-verifier.mjs（OWNER_KEY 环境变量，--yes 才发交易）

## 3. 上线（Claude）
- [x] 3.1 本地：核实私钥与文件存储（完成；核实者由审查者运行时通过 VERIFIER_PRIVATE_KEY 注入，本地使用 GHOST_STORE=file，Codex 不接触私钥）
- [ ] 3.1 上线：Vercel 环境变量与 Blob（待上线）
  - 2026-11-01 进展：公开 Blob 存储 mars-roadster-ghosts 已连接预览与生产；预览环境已配主网变量与核实私钥，预览站核实签名、录像写入与读回已实测；生产环境的 RACING_ADDRESS/VITE_RACING_ADDRESS/ARC_NETWORK/VERIFIER_PRIVATE_KEY 待上线时更新
- [x] 3.2 测试网端到端：跑完三圈 → 核实签名 → 上链 verified=true → 另一浏览器下载影子同场（2026-10-31 通过：草甸 41442 ms，交易 0x689600c5…6f5）
- [ ] 3.3 用户确认后主网重新部署合约（下限 15/20/30 秒、资格线 58/62/108 秒）、setVerifier、转移 owner 并上线
  - 2026-11-01 进展：主网合约 0xE0D2c19988a6fC90806B56De797Fc4D107946526 已部署，三条赛道与核实者 0x4c94882F8b91e349a0979A9ed7416E2E5aAe68e1 已写入并读回；待用户在预览站亲自铸造实测，之后转移 owner 给 0x81d48d2c5D0744e8eF7A5c35cDceB0A27A1c707B
- [x] 3.4 影子选择改为自动默认 + 单一下拉（预加载前 10、按地图记住选择、连钱包取回我的已核实录像）
