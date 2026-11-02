# NFT 宝石边框与赛道重新取景实施计划

**目标：** 将已批准的金银铜外观升级为原创装饰边框，三张底图具有不同构图，生成可复现的九图预览。

**架构：** 保留现有等级判定和链上读取。由 SVG 源文件离线生成透明 PNG，三个接口通过 `nftPresentation` 共享等级外观；截图只使用已运行的本地 Vite 和 capture 调试接口。

**技术：** 手写 SVG、sharp、Satori/ImageResponse、Playwright Chrome、Three.js 现有场景。

1. 更新现有 OpenSpec 设计和 delta；在 `api/nft.test.mjs` 先验证三档正确 PNG、框在内容上方、资源透明和尺寸体积；运行 `node --test api/nft.test.mjs` 确认目标失败。
2. 在 `scripts/nft/frames/` 手写三档对称但装饰密度不同的金属/宝石图案；新增 `scripts/nft/render-frames.mjs`，运行渲染并用 sharp 采样透明中心及不透明金属。
3. 修改 `api/_lib/nft.js`、`api/nft/image/[id].js` 和 `api/nft/view/[id].js`，共用等级色调/面板与边框路径，调整标题及面板安全边距，测试绿色。
4. 修改 `scripts/nft/render-tracks.mjs`，自动驾驶到三个取景点，在浏览器中设定斜侧镜头并仅隐藏截图里的金币，保留车辆和标志性地形。湖面现状已向用户说明；使用仅截图进程的水面布景，克隆渲染地形并以测试验证物理高度场不变及道路净空。运行脚本，逐张查看 JPEG，按需调整。
5. 修改 `scripts/nft/preview.mjs` 以内联本地边框生成九图与行赛道、列金银铜的拼图；检查原尺寸/256px 和展示页横竖屏。
6. 运行 `npm test`、`npm run build`、`openspec validate add-nft-variants --strict` 与 `git diff --check`。同步 tasks 实际状态，部署项保持未完成。检查差异后用中文信息提交一次，不部署、不访问私钥或修改服务。
