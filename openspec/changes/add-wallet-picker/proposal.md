# 第三方钱包连接

## 原因
当前连接流程直接依赖 `window.ethereum`，无法选择多个钱包或使用手机扫码。用户要求参考 arc-lepton，复用 RainbowKit、wagmi 和 WalletConnect。

## 变更
- 按需加载紧凑深色 RainbowKit 弹窗，使用 Arc 链配置。
- 从本地环境变量读取 WalletConnect 项目 ID；仅复制参考项目对应字段。
- 将选中连接器的 EIP-1193 provider 接入现有 viem 提交流程。
- 正确处理弹窗取消、重试、账户变化、切网和断开连接。

## 影响
钱包连接层、依赖、双语错误提示及配置文档。公共链读取仍使用 HTTP RPC。
