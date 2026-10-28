## 实现
- [x] 1. 确认参考项目并复制指定项目 ID，补齐设计和计划。
- [x] 2. 先写失败测试覆盖选择、取消重试、并发连接和会话替换。
- [x] 3. 实现按需加载 RainbowKit 桥接及现有钱包服务对接。
- [x] 4. 更新双语错误提示与本地配置文档。
- [x] 5. 执行回归、构建、浏览器验证和 OpenSpec 校验。

## 验证结果
- `node --test $(rg --files src api scripts -g '*.test.mjs')`：216 项通过，0 失败。
- `npm run build`：通过，保留依赖包体积超过 500 kB 的提示。
- `node --check src/chain/wallet-modal.js`、`node --check scripts/chain/wallet-smoke.mjs`、`node --check scripts/chain/e2e-race.mjs`、`git diff --check`：通过。
- `URL=http://127.0.0.1:8935/ node scripts/chain/wallet-smoke.mjs --qr --mobile`：生产构建中验证无插件弹窗、手机视口、真实配对二维码、官方钱包列表、Esc 取消重试、键盘隔离、选定连接器及 Arc 切网，0 页面未捕获异常。桌面视口回归也已通过。
- `openspec validate add-wallet-picker --strict`：通过。
- 已经独立代码审查，修复恢复读取覆盖新会话的竞态，并更新原有手动端到端脚本的钱包选择步骤。
- 未进行真实钱包扫码配对、签名或链上交易；交易模拟、签名前会话检查与回执流程由自动测试覆盖。
