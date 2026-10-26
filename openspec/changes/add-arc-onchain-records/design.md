# Design: 往返纪念 NFT 与链上记录

## 背景与约束
- 游戏是纯前端的 3D 物理模拟，服务器无法重放验证一局成绩，因此成绩只能是「玩家自报」，防伪造只做合理性限制，不与任何奖励挂钩。
- 玩家自己付手续费（Arc 手续费以 USDC 计，单笔约 0.002–0.005 USDC），我们不持有服务器签名私钥。
- Arc Studio 的部署工具只支持测试网；主网用用户钱包 forge create 部署（同 Bounty Dungeon）。
- 车型为真实品牌外观：NFT 不可转让、免费铸造、画面隐藏车标，元数据写明非商业致敬与非隶属声明，避免被视为商业使用。

## 合约：MarsRoadsterRecords
- ERC-721 + ERC-5192（locked）：所有转让与授权调用一律 revert；每个地址最多持有一枚。
- 存储（每个地址一条）：tokenId、bestRoundTripMs（uint32）、achievements（uint32 位图，仅低 20 位有效）、mintedAt、updatedAt。
- `submit(uint32 roundTripMs, uint32 achievements)`：
  - roundTripMs 必须 ≥ minRoundTripMs，否则 revert
  - 调用者没有 NFT 时铸造一枚（tokenId 从 1 递增）
  - roundTripMs 更快时更新最好成绩
  - achievements 与已有位图按位或（只增不减），高于 20 位的位 revert
  - 发出 `Recorded(player, tokenId, roundTripMs, improved, achievements)`
- `minRoundTripMs`：构造参数；owner 只能调高，不能调低（避免事后放水）。数值由脚本实测最快往返后，留 10% 余量确定。
- `tokenURI(id)` = baseURI + id；owner 可改 baseURI（指向本站 /api/nft/）。
- 只读：`recordOf(address)`、`totalSupply()`、`players(start, count)` 分页返回地址与记录，供往返榜在前端排序（不用扫描事件日志，避开 RPC 单次 ≤9000 块与限流问题）。

## 游戏侧
- 往返计时：进入爬升（按住空格开始冲向太空）开始计时，`reentry_home`（安全落回公路）停止；中途中止、坠落都作废本次计时。本局最快一次进入成绩面板。
- src/chain/：基于 viem 与浏览器注入钱包（EIP-1193）。连接时自动请求切换 / 添加 Arc 网络；读取 recordOf 显示已有记录；提交前先本地判断是否有可更新内容（无 NFT、成绩更快或有新成就），没有就不发交易。
- 成绩面板：完成往返后显示「铸造纪念 NFT」（未持有）或「更新链上记录」（已持有）；交易中、成功（附区块浏览器链接）、失败（余额不足 / 用户取消 / 网络错误）分别提示。
- 链上记录面板：我的 NFT 卡片、链上成就、往返榜前 50（钱包缩写 + 用时 + 日期）。
- 所有新文字加入 src/i18n/zh.js 与 en.js。

## NFT 画面
- 底图：用游戏真车模型与太空场景离线渲染（沿用 scripts/logo/ 的真模型渲染思路），白车在轨道上、下方地球、喷焰光轨，隐藏车标；输出 2048×2048，先出 2–3 个构图给用户挑。
- 信息栏：底部科技感半透明条，显示编号 #0001、往返用时、铸造日期、成就 n/20、钱包缩写。
- /api/nft/[id]：从链上读 ownerOf 与 recordOf，返回元数据 JSON（name、description、image、attributes）。
- /api/nft/[id]/image：底图 + 信息栏实时合成 PNG，带缓存（成绩更新后图片随之变化）。

## 风险
- 成绩可被伪造：只做下限与「玩家自报」标注，不设奖励。
- 合成图接口冷启动慢：加 CDN 缓存，元数据里的图片地址带 updatedAt 作为版本参数。
- 玩家没有 Arc 主网 USDC：面板说明如何获取，测试网阶段提供水龙头链接。
