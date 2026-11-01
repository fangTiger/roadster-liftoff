# 个人主页——当前技术设计

## 模块
- 路由：`src/main.js` 遇到 `?profile` 时加载 `src/profile/index.js`；`&address=0x…` 查看他人（`profileAddress` 严格校验 40 位十六进制，不合法时回退到当前钱包并提示），`&tab=leaderboard` 直达排行榜。
- `src/profile/page.js`：页面装配与渲染，全部用 DOM API 和 textContent 构建，不拼接 HTML。
- `src/profile/avatar.js`：由地址确定性生成 SVG 头像（渐变 + 几何图形），纯函数，不请求外部服务。
- `src/profile/title.js`：称号派生（未铸造 → 已铸造 → 三图全部进资格线 → 任一赛道第 1 名，取最高档）与排行榜缓存 `createBoardCache`（整页只读一次排行榜并共享，用于计算名次与差距）。
- `src/profile/timeline.js`：读取合约 `FirstLap` / `LapRecorded` 事件，按 player 索引过滤；Arc RPC 的 getLogs 区块范围有限，因此从最新区块向前分段查询，最多扫描最近 24 万个区块；区块时间戳按需批量读取并缓存，失败的分段与时间戳分别提供重试。

## 关键决策
- NFT 区复用 `src/chain/nft-card.js` 的数据读取与图片逻辑；3D 倾斜与光泽在 prefers-reduced-motion 下关闭。
- 「挑战我的影子 / 挑战 TA 的影子」跳转 `?race` 并预先选中该赛道与该地址的录像，复用影子下拉的默认选择逻辑。
- 原右上角面板的「我的」标签由本页取代。
