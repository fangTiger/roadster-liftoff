# 第三方钱包连接实现计划

**目标：** 参考 arc-lepton 使用 RainbowKit + wagmi + WalletConnect，提供浏览器钱包选择和扫码连接。

**架构：** 游戏保留原生 ES 模块；通过动态导入创建独立 React 根，仅承载 RainbowKit provider 和弹窗。纯连接控制器负责等待连接、取消和并发请求；现有钱包服务使用选中 provider，保留 viem 的模拟、签名、回执和会话校验。

**技术栈：** Vite、RainbowKit 2.2.11、wagmi 2.19.5、React 18、TanStack Query 5、viem。

### 任务 1：连接控制器
- 新建 `src/chain/wallet-connection.test.mjs`：无全局钱包时选择 provider、取消重试、初始化失败重试、并发只打开一次、会话同步。
- 运行 `node --test src/chain/wallet-connection.test.mjs`，确认因缺少实现失败。
- 实现 `src/chain/wallet-connection.js`，再运行测试。

### 任务 2：provider 接入
- 修改 `src/chain/wallet.test.mjs`：异步选择 provider、替换监听和断开后禁止签名。
- 运行测试确认失败，再修改 `src/chain/wallet.js`。
- 新建 `src/chain/wallet-modal.js`：第三方 React 桥接、紧凑深色主题、Arc 链、语言切换与取消事件。

### 任务 3：配置与验证
- 从参考项目 `.env.local` 仅提取 WalletConnect 项目 ID，写入当前项目未跟踪的 `.env.local`，保留已有值。
- 更新 `src/chain/records.js`、双语词典和 README 的配置说明。
- 运行所有 Node 测试、`npm run build`、浏览器连接/取消/重试检查和 `openspec validate add-wallet-picker --strict`。
- 按实际验证结果更新 tasks.md。

### 设计取舍
沿用用户指定的 RainbowKit 最接近参考项目，代价是增加小型 React 根；改用原生 SDK 可省去 React，但交互和依赖偏离参考；自写弹窗维护成本更高，因此采用前者并延迟下载钱包依赖。

### 实施补充
- 竞速模式的顶层元素白名单需要允许 RainbowKit portal 和 WalletConnect 官方 `w3m-modal`。弹窗内按键与游戏隔离，保留第三方在 window 上处理 Esc / Tab 的能力。
- `cuer@0.0.3` 对 `qr` 的宽松版本范围会引入拒绝 `border: 0` 的版本。仅对该子依赖覆盖为 `qr@0.5.4`，通过真实组件渲染测试和生产二维码界面验证。
- 连接恢复使用版本保护，确保等待旧 provider 时收到的新会话不会被过期读取清空。
- 完成状态与验证命令见 `openspec/changes/add-wallet-picker/tasks.md`。
