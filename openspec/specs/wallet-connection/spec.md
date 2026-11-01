# wallet-connection Specification

## Purpose
钱包连接：多钱包选择（浏览器钱包、WalletConnect 扫码）、右上角钱包入口、跨页自动恢复连接、切换网络与断开连接。
## Requirements
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

### Requirement: 右上角常驻钱包入口
系统 SHALL 在首页和赛车页的右上角常驻显示钱包按钮；多人房间与暂停菜单等覆盖层打开时不得遮挡其关键操作。

#### Scenario: 未连接
- **WHEN** 用户尚未连接钱包
- **THEN** 右上角显示「连接钱包」，点击打开现有钱包选择弹窗

#### Scenario: 已连接
- **WHEN** 用户已连接钱包
- **THEN** 按钮显示缩写地址与网络标识，点击进入独立个人主页 /?profile（由 add-profile-page 取代原面板「我的」标签）；账户菜单保留排行榜页签入口、在区块浏览器查看地址、断开连接与网络不匹配时的切换网络操作

#### Scenario: 网络不匹配
- **WHEN** 钱包所在网络与站点配置的 Arc 网络不同
- **THEN** 按钮显示警示状态，菜单提供「切换到 Arc 网络」

#### Scenario: 跨页面保持连接
- **WHEN** 用户已连接钱包后在首页与赛车页之间跳转或刷新
- **THEN** 页面加载时静默恢复上次的连接，不弹窗、不需要再次点击；用户主动断开后不再自动恢复

#### Scenario: 状态同步
- **WHEN** 用户在成绩面板或排行榜里连接或断开钱包
- **THEN** 右上角按钮同步更新，不需要刷新页面

