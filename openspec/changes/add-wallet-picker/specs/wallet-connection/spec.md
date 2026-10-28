## ADDED Requirements

### Requirement: 第三方钱包选择
系统 SHALL 使用与 arc-lepton 一致的 RainbowKit、wagmi 和 WalletConnect 提供紧凑深色钱包选择弹窗，并按需加载。

#### Scenario: 无浏览器注入钱包
- **WHEN** 玩家点击连接钱包，浏览器没有 `window.ethereum`
- **THEN** 仍显示钱包选择和 WalletConnect 扫码入口

#### Scenario: 本地项目配置
- **WHEN** 初始化第三方连接
- **THEN** 使用 `VITE_WALLETCONNECT_PROJECT_ID` 和当前 Arc 链；缺少项目 ID 时显示明确配置错误，允许配置后重试

#### Scenario: 取消后重试
- **WHEN** 玩家关闭弹窗且没有连接钱包
- **THEN** 结束本次连接并显示取消提示，恢复按钮，之后可重新打开弹窗

### Requirement: 钱包会话与交易一致
系统 SHALL 使用所选连接器的 provider 读取账户、切换到 Arc 并提交现有合约交易。

#### Scenario: 多钱包选择
- **WHEN** 玩家选择的钱包不是全局默认注入钱包
- **THEN** 读取和签名均使用选中连接器，不回退到 `window.ethereum`

#### Scenario: 会话变化
- **WHEN** 钱包账户、网络或连接器变化或断开
- **THEN** 面板同步新状态并清理旧 provider 监听，提交前继续校验会话

#### Scenario: 无需钱包的读取
- **WHEN** 玩家只查看榜单
- **THEN** 直接使用 HTTP RPC，不加载钱包弹窗，也不请求连接
