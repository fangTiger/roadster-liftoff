# 大厅第二版实施计划

目标：落实 polish-party-visuals 第三节，让车辆成为视觉主角，提供真实地图预览和连续开赛转场。

架构：沿用独立 Three.js 大厅和房间协议；只改变展示层。中央座位根据本机身份投影，协议席位、颜色、准备状态和地图仍由服务端同步。静态地图图像由本仓库 Playwright 截取，运行时仅加载 WebP。

技术：Three.js、原生 DOM/CSS、现有 WebAudio 音频总线、Node 测试和 Playwright。

设计：深蓝黑展厅、暖白主聚光、青色地面光池和金色交互；中央车辆约两倍尺寸，侧车压低亮度；背景墙显示地图。桌面右侧设置栏，手机底部抽屉。入场 1.2 秒，换图缓推，开赛 0.8 秒冲镜并闪白，减少运动改淡入。

1. 先补充投影尺寸、主座布局、地图数据、准备反馈、音频和转场生命周期的失败测试，运行确认失败。
2. 实现中央展台、单盏聚光与低成本透明光束；复用 boostfx，音频走现有主总线；确保场景及异步纹理销毁安全。
3. 实现地图捕获脚本，生成三张 1280×720、每张不超过 200KB 的 WebP。地图卡片含真实图、中心线路径、长度、难度和推进器状态，双语。
4. 在赛道完成加载和首帧渲染后交接大厅，转场全程保留有内容的画面；处理减少运动和取消。
5. 扩展真实房间截图脚本，双页、满员、准备、地图、转场、手机截图及性能数据保存到指定临时目录。逐张看图迭代。
6. 运行 npm test、npx vite build、OpenSpec 验证；核对需求与 tasks 3.1–3.5，记录验证结果后中文提交。

约束：不读密钥或 .env，不动模拟、录像、SIM_VERSION、道具判定，不推送不部署，不改用户已有本地文件。

## 实施与验收记录

- 主车比例 2.1，居中展台、独立聚光、地面光池和柔边体积光；其余五席按本机身份分列侧后方。背景墙退到所有展台后方，保证第六台车可见。
- 进场镜头 1.2 秒。倒计时准备真实赛道，期间保留展厅；首帧与远端车型就绪后，同一时钟执行 0.8 秒冲镜及闪白，再淡入追车画面。减少运动模式直接淡入。
- 准备状态沿用服务端同步，仅 false → true 时触发两次车灯闪烁、既有 boostfx 尾焰和现有音频总线上的低频轰鸣。音量与静音沿用设置。
- 地图卡片支持房主选择、其他人只读高亮，包含实景、真实中心线、长度、难度和推进器状态。初始未选图时展示草甸实景；选择结果同步到所有人的背景墙。
- 真正的触屏设备使用 390 像素布局视口；设置为底部抽屉，滑动提示仅在触屏窄屏出现。不可见页面暂停大厅，交接及离开时释放场景与异步资源。

### 验证结果

- `npm test`：463 项通过，0 失败；包含原有模拟、录像和道具回归。
- `npx vite build`：通过；保留既有的大于 500 KB 分包提示。
- `OPENSPEC_TELEMETRY=0 openspec validate polish-party-visuals --strict`：通过。
- `node scripts/race/capture-track-previews.mjs`：三张真实画面均为 1280×720，草甸 118426 字节、湖畔 107332 字节、阿尔卑斯 92732 字节。
- 预览生成使用本仓库 Playwright、Chrome 的 `--use-gl=angle --use-angle=swiftshader`，由同一确定性自动驾驶求机位步数，游戏实际推进后截图；需要本机 Chrome、Python Pillow。运行时只读静态 WebP。
- `node scripts/race/capture-garage.mjs`：真实双页、四机器人满员、权限、地图同步、准备反馈、触屏及开赛交接通过；页面错误与警告均为零。
- 满员最终复测：1440×900，设备 DPR 2、渲染 DPR 1.5，Apple M1 Max / ANGLE Metal；145 个实际渲染帧，平均 45.55 FPS（21.95 ms），P95 33.40 ms。主车可见几何包围盒投影高度 437.36 px，超过 270 px 门槛。
- 手机展区下沿与抽屉上沿均为 538.61 px，互不遮挡。真实触屏设备布局宽度为 390 px。
- 转场中间帧来自浏览器合成器，捕获 14 帧并保留冲镜与闪白尚可辨识的中间画面；普通截图会错过短转场，因此不用延时截图代替。

### 截图清单

目录：`/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/lobby-2/`。

| 文件 | 内容 |
| --- | --- |
| `01-desktop-two.png` | 1440×900 双人房 |
| `02-desktop-six.png` | 六人满员，含四个机器人 |
| `03-track-cards.png` | 三张地图实景卡片展开 |
| `04-alpine-wall.png` | 房主换图后的实景背景墙 |
| `05-peer-alpine-wall.png` | 非房主视角，地图同步且不可修改 |
| `06-ready-burst.png` | 准备瞬间的尾焰与灯带 |
| `07-mobile-six.png` | 390×844 窄屏满员与底部抽屉 |
| `08-mobile-touch.png` | 真实触屏上下文，390×844，显示滑动提示 |
| `09-english-reduced.png` | 英文卡片、高亮及减少运动模式 |
| `10-launch-middle.png` | 合成器截取的冲镜中间帧 |
| `11-start-line.png` | 转场后的起跑线追车视角 |
| `browser-result.json` | 页面错误、交互断言和帧率原始数据 |

三张地图静态图和以上十一张截图均已逐张查看，多轮调整了曝光、构图、名牌、真手机视口与背景墙遮挡。

### 改动文件

- `index.html`：手机布局视口。
- `src/race/lobby/garage.js`、`garage-cars.js`、`garage.css`：主车、侧席、光照、准备、背景、布局与资源管理。
- `src/race/lobby/garage-motion.js`、`track-previews.js`：展示动画包络和真实赛道预览元数据。
- `src/race/lobby/visuals.test.mjs`、`rendering.test.mjs`：投影尺寸、布局、墙体遮挡和既有释放回归。
- `src/race/room-ui.js`、`room-race.js`：地图卡片与首帧交接。
- `src/audio/audio.js`、`audio.test.mjs`：共用音频总线的准备轰鸣及验证。
- `src/i18n/zh.js`、`en.js`：地图卡片双语文案。
- `scripts/race/capture-track-previews.mjs`、`capture-garage.mjs`：真实游戏预览生成和房间端到端验收。
- `public/assets/race/previews/easy.webp`、`normal.webp`、`hard.webp`：提交到仓库的静态实景。
- 本计划及 `openspec/changes/polish-party-visuals/tasks.md`：实施记录和 3.1–3.5 状态。

任务 4.1 保持未勾选，留待用户确认视觉效果。本次未改模拟、录像、SIM_VERSION 或道具判定，未推送或部署。
