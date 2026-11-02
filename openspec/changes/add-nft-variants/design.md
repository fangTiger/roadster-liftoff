# Design: NFT 赛道与等级外观

## 数据来源
- 赛道：`record.firstTrack`（铸造时写入，永不改变）。
- 等级：`bests(owner, firstTrack).bestMs`；没有最快圈记录时用 `record.firstLapMs`。
- 等级线：`RACE_TRACKS` 每项新增 `tiers: { goldMs, silverMs }`。`bestMs <= goldMs` 为金，`<= silverMs` 为银，其余为铜（铸造本身已要求进入资格线）。
- 定稿值以困难机器人圈速为基准：金 = ×1.08，银 = ×1.3，即草甸 32 / 38 秒、湖畔 33 / 40 秒、阿尔卑斯 58 / 70 秒（依据见 tier-calibration.md）。
- 等级判定写成纯函数 `nftTier(trackId, bestMs)`，元数据、静态图、展示页、个人主页共用。

## 底图
- `public/assets/nft/track-1.jpg`、`track-2.jpg`、`track-3.jpg`，1080×1080，JPEG，每张不超过 250KB。
- 由 `scripts/nft/render-tracks.mjs` 在本地竞速场景中逐帧推进到预设取景点渲染：每条赛道选一个最有辨识度的位置，车辆入画，不出现 HUD；画面上方留出放标题的暗部。
- `base.jpg` 保留，作为未知赛道的兜底。

## 等级样式
| 等级 | 边框与强调色 | 徽标 |
|---|---|---|
| 金 | 暖金渐变 `#f6d27a → #c8902f` | GOLD |
| 银 | 冷银渐变 `#e6eef5 → #9fb3c4` | SILVER |
| 铜 | 古铜渐变 `#e3a77a → #9a5b34` | BRONZE |

- 静态图：卡片外框用等级渐变描边，标题旁放等级徽标，成就进度条点亮色改用等级强调色；版式其余部分不变。
- 展示页：赛道底图全屏铺满并缓慢推近（尊重 prefers-reduced-motion），信息层与静态图一致。

## 元数据
- `attributes` 新增 `{ trait_type: 'Tier', value: 'Gold' | 'Silver' | 'Bronze' }`。
- 描述按 `best.verified` 写「服务器核实」或「玩家自报」；不可转让与非隶属声明保留。
- 图片缓存参数 `v` 继续使用更新时间，成绩变化后钱包能拿到新图。
