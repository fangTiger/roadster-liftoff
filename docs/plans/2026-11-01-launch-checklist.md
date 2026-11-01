# 上线与试玩待办清单

> 2026-11-01 归档 OpenSpec 变更时，把尚未完成的「上线」「试玩调参」「用户确认」类任务集中到这里。功能代码均已合入 main；以下事项完成后在此勾选即可，不再需要单独的变更提案。当前约定：先在本地做，不部署 Vercel。

## 1. 主网上线（每笔主网交易需单独征得用户同意）
- [ ] 1.1 主网合约 owner 从部署钱包转移给用户钱包（来源：add-ghost-race 3.3）
- [ ] 1.2 Vercel 生产环境变量切换到新合约 `0xE0D2c19988a6fC90806B56De797Fc4D107946526`（ARC_NETWORK、RACING_ADDRESS、VITE_ARC_NETWORK、VITE_RACING_ADDRESS、VERIFIER_PRIVATE_KEY），Blob 存储确认可读写（来源：add-ghost-race 3.1、add-circuit-race 8.4）
- [ ] 1.3 生产环境上线后实测：铸造、刷新最快圈、影子上传与下载、个人主页（来源：add-circuit-race 8.4）

## 2. 多人房间上线
- [ ] 2.1 确定房间服务托管方案并请用户确认（来源：add-live-rooms 3.2）
- [ ] 2.2 生产环境开启 `VITE_ROOMS_ENABLED=1`（目前生产默认隐藏）

## 3. 用户试玩与调参
- [ ] 3.1 多人房间软碰撞参数（来源：add-live-rooms 3.1）
- [ ] 3.2 道具赛道具权重、效果时长、尾流参数（来源：add-party-race 5.1）
- [ ] 3.3 道具与派对视觉效果确认（来源：polish-party-visuals 4.1）
- [ ] 3.4 房间大厅试玩确认（来源：upgrade-room-lobby 4.2）

## 4. 待用户决定
- [ ] 4.1 金币的长期用途（例如车库兑换外观），确定后另写提案
