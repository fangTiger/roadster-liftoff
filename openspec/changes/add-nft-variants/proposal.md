# Change: 首圈 NFT 按赛道与成绩等级区分外观

## Why
所有首圈 NFT 共用一张底图，只有文字不同，收藏和展示缺少辨识度。卡片底部还写着「SELF-REPORTED」，而主网成绩已改为服务器核实，文字过时。

## What Changes
- 三条赛道各有一张专属底图（草甸、湖畔、阿尔卑斯），用游戏内场景渲染原创画面；现有湖畔场景没有水面，由 NFT 截图进程加入独立湖面布景（不改游戏与物理），详见 design.md；NFT 按首圈所在赛道（链上 `firstTrack`，永不改变）选图。
- 新增三档等级：金（GOLD）、银（SILVER）、铜（BRONZE），按该赛道的链上最快单圈判定；成绩提升后等级随之升级。等级决定原创宝石装饰边框、配色和等级铭牌。
- 等级线按赛道配置（毫秒），集中放在 `src/chain/tracks.js`，可随调参修改，不涉及合约。
- 静态图、动态展示页、元数据同步：新增 `Tier` 属性；展示页改用赛道底图与等级样式，替换原来的太空循环视频。
- 底部文字按链上 `verified` 显示「VERIFIED」或「SELF-REPORTED」；元数据描述同步修正。
- 已铸造的 NFT 无需任何链上操作，下次读取时自动显示新外观。

## Impact
- Affected specs: onchain-records（NFT 元数据与图片）
- Affected code: `api/nft/[id].js`、`api/nft/image/[id].js`、`api/nft/view/[id].js`、`src/chain/tracks.js`、新增等级判定模块、`public/assets/nft/`（三张赛道底图）、`scripts/nft/`（底图渲染脚本）
- 不改合约、不发交易；上线需要重新部署 Vercel（部署前征得用户同意）
