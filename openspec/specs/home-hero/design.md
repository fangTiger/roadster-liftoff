# 首页开场——当前技术设计

## 模块
- `src/ui/home/home-hero.js` + `home-hero.css`：独立视觉模块（类名前缀 `hh-`），API 为 `createHomeHero({ container, t, modes, onModeHover, onModeSelect, reducedMotion })`，返回 `show / hide / setLive / setLang / focusFirst / destroy`。只负责标题动画、模式卡片、悬停背景层与实况条，不依赖游戏代码；附 demo.html 与 README（含 i18n 键表）。
- `src/ui/ui.js`：资源加载完成（hideLoading）后用该模块替换原模式按钮行；组装模式列表（竞速 / 飞向太空 / 多人房间（受 `VITE_ROOMS_ENABLED` 控制）/ 赛季即将推出），三张赛道卡片分别使用 easy / normal / hard 预览图，太空卡片使用循环视频；`onModeSelect` 走原有 `start(mode)`；驾驶指南与页脚挂在 `.hh-slot-footer`。
- `src/game/homeCamera.js`：首页运镜，关键帧插值做慢速推拉，车辆缓慢前行并显示尾焰；进入任何模式时停止并把相机交还原有 rig；减少动态效果时保持静止机位。首页阶段隐藏金币（`coins.setVisible(false)`）。
- `src/chain/home-live.js`：一次性读取已铸造数量、三条赛道第 1 名与最近一次上链事件（只查最近一段区块），组装为 `setLive` 数据；未配置、无数据或失败时传 null，实况条隐藏。

## 关键决策
- 标题渐变放在每个字母上：父级 background-clip:text 遇到带 filter/opacity 的子元素会整段不绘制。
- 实况条固定在视口底部，显示时给页脚留出 48px。
- 预览视频首次悬停才加载，同时只播放一个；地址和名称一律用 textContent 写入。
