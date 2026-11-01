# 钱包连接——当前技术设计

## 模块
- `src/chain/wallet.js`：对外的钱包状态与操作（connect / disconnect / switchNetwork / 读写合约），加载时调用 `restore()` 恢复连接。
- `src/chain/wallet-connection.js`：连接器管理。浏览器注入钱包（EIP-6963 / window.ethereum）与 WalletConnect（项目 ID 取 `VITE_WALLETCONNECT_PROJECT_ID`）。
- `src/chain/wallet-modal.js`：钱包选择弹窗与二维码。
- `src/chain/wallet-hub.js`：右上角入口。未连接时打开选择弹窗；已连接时点击地址进入个人主页 `/?profile`，下拉保留切换网络与断开连接。
- `src/chain/wallet-toast.js`：交易成功等提示。

## 关键决策
- 跨页恢复：成功连接后写入 localStorage 键 `roadster.wallet.connected`，下次加载静默恢复；用户主动断开时清除。所有存储读写包在 try/catch 中，存储不可用时只是不恢复。
- 网络：由 `VITE_ARC_NETWORK` 决定测试网或主网（`src/chain/shared.js` 的 `getArcChain`），网络不匹配时提示切换而不是自动发交易。
- 私钥永不进入前端；签名只在用户钱包内完成。
