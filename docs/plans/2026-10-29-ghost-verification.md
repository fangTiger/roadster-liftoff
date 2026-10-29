# 影子赛第 2 批实施计划

**目标：** 按 add-ghost-race 的第 2 组任务完成服务器核实、影子接口与前端接入。
**架构：** 共享纯成就判定；runReplay 可选返回统计，不改变物理和计时。服务端以工厂注入链读取、签名、存储与时钟；Blob 使用条件写入保证只保存更快成绩。
**技术栈：** ES 模块、Node test、viem、@vercel/blob、Vite。

1. 为录像校验、三圈重放、统计成就与 EIP-712 类型/恢复签名写失败测试；实现 api/_lib/replay.js、sign.js 与共享成就函数，运行相关测试。
2. 为存储覆盖/并发、请求大小/限流/错误和分页榜单写失败测试；实现 ghost-store.js、verify.js、ghost.js 与链读取工厂，运行接口测试。
3. 为前端先核实再提交、失败重试、零核实者回退、榜单过滤和排行榜影子下载写失败测试；接入钱包、成绩面板、选图和标签，运行前端测试。
4. 为 set-verifier 参数、预览和 owner/交易边界写失败测试；实现脚本，运行脚本测试。只使用固定公开测试密钥，不产生或持久化私钥。
5. 运行全量 node --test 与 npx vite build，检查 diff 与规范；按证据勾选 tasks.md。绝不安装依赖、发真实交易、部署或提交 git。

## 复验与配置说明

- 服务端：`VERIFIER_PRIVATE_KEY`（仅签名进程读取）、`BLOB_READ_WRITE_TOKEN`（公开 Blob 存储），沿用 `ARC_NETWORK`、`RACING_ADDRESS`、`SITE_URL`。前端网络与地址继续由 `VITE_ARC_NETWORK`、`VITE_RACING_ADDRESS` 配置，必须与服务端相同。
- 管理脚本：`node scripts/chain/set-verifier.mjs --network testnet --verifier 0x目标地址` 只预览；仅在用户自行配置 `OWNER_KEY` 且显式添加 `--yes` 时发送。主网必须显式配置 `RACING_ADDRESS`。
- `node scripts/race/ghost-smoke.mjs` 在本机 Vite 服务（默认8934端口）上验证三圈录制、本地最佳、排行榜影子下载与发车；链与影子接口用假数据，不发交易。
- Blob 通过源站 `head` 返回的 ETag 隔离公开 CDN 正文缓存，再用下载内容 ETag 条件覆盖；首次写入禁止覆盖。未配置存储或签名时接口返回503。
- 运行阶段需自行配置真实服务环境并完成第3组上线验收。本批不部署、不安装依赖、不生成密钥、不发真实交易、不提交git。

## 本批验证证据

- `node --test $(git ls-files -co --exclude-standard | grep -E '\.test\.mjs$')`：253项通过，0失败。
- `npx vite build`：成功；依赖的指令与大分包警告仍存在。
- `OPENSPEC_TELEMETRY=0 openspec validate add-ghost-race --strict`：通过。
- `node scripts/race/ghost-smoke.mjs`：本地Chrome检查通过，假链/假影子接口，包含车顶钱包缩写；无页面错误。
- 重置密集型录像的CPU回归：修复前约7.2秒，修复后约0.74秒；黄金快照一致。
- 未执行真实Blob写入、真实链签名配置、vercel dev 或部署端到端，也未跨浏览器验收；这些仍属于第3组上线任务。
