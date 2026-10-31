# 金币、道具外观与地图推进器实施计划

**目标：** 完成 polish-party-visuals 的 1.1–1.3 和本批 A；大厅不在本批范围。
**架构：** 原金币参数原样抽入 coin-model 工厂；竞速用两组共享矩阵的实例网格。实时键位按地图创建，HUD 接收 trackId，不过滤录像或模拟输入。道具共享几何与着色器，粒子使用固定容量实例池，临时爆炸使用可复用槽位。
**技术：** three.js、原生 ES 模块、node:test、Vite、Playwright。

## 设计
- 沿用金色浮雕金币；道具采用钛灰金属、陶瓷白弹体、冷青能量光、橙色燃烧尾焰。
- 能量舱为六棱水晶与端盖、旋转悬浮核心；水体使用菲涅尔、高光、波纹和内部气泡。
- 护盾使用六边形网格与脉冲；眩晕为倾斜冲击弧与环绕光点；爆炸区分火焰、蓝色涟漪、水花。
- 保留现有 HUD 字体、布局和事件提示，只替换道具图标和条件化推进器。

## 步骤
1. 补 HUD（两种语言、三张图、漂移/反打、轮盘 SVG）与实时键位测试，运行确认失败。
2. 添加共享金币模型及竞速显示、旋转、拾取隐藏与资源释放测试，运行确认失败。
3. 增补道具结构、共享水材质、尾焰烟迹、复用池、资源释放测试，运行确认失败。
4. 实现实时地图键位与 HUD，再抽取金币，重做道具；逐批运行对应测试。
5. 运行 npm test、npx vite build、OpenSpec 校验；确认 sim、golden 和录像文件无变更。
6. 在已运行的 8932/8933 上执行 SCENARIO=bots node scripts/rooms-e2e.mjs。
7. 使用 Playwright 检查真实页面和独立效果视角、控制台与渲染性能；截图存用户指定临时目录。
8. 根据实际结果勾选 1.1–1.3 与 A，记录验证，中文提交并附指定 Co-Authored-By。

## 验证结果（2026-10-31）
- `npm test`：409 项通过，0 失败；包含原有道具判定、录像重跑与逐位 golden 比对。
- `npx vite build`：成功；保留现有大包体积提示。
- `OPENSPEC_TELEMETRY=0 openspec validate polish-party-visuals --strict`：通过。
- `git diff --check`：通过；`src/race/sim/`、`room-items.js`、录像文件均无改动。
- `SCENARIO=bots node scripts/rooms-e2e.mjs`：在源码冻结后通过。真人自动驾驶、普通机器人、困难机器人全部完赛；四类道具均已使用，返回大厅与准备状态正常，无页面错误。成绩分别为 2:38.417、2:33.508、2:33.125。
- Playwright 截图：16 张，页面错误 0、控制台警告 0。主视角检查了能量舱、导弹烟迹、水雷/禁锢波纹与气泡、六边形护盾、双尾焰、眩晕、三类命中效果、浮雕金币与双语地图 HUD。
- 太空金币：将 HEAD 原实现与抽取后实现置于相同灯光、贴图、相机和渲染器比较，256×256 的 262144 个通道差异为 0。
- 资源：共享资源一次释放；实例缓冲接入真实房间换局路径；固定粒子/碎片池、16 个爆炸槽反复覆盖不扩容，过期清理与非有限数回归通过。
- 六车压力场景（6 组护盾/禁锢/氮气/眩晕 + 6 水雷 + 6 导弹）：本机 Chromium Metal，1280×900 预热后平均 16.67ms（约 60fps），道具更新约 0.07ms。1440×900 极限叠加平均约 19.80ms（约 50fps），未稳定 60fps；基础六车场景本身约 21.83ms，此限制保留记录，未扩展修改车辆或地形。

### 临时验收产物
目录：`/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/visuals-1/`，未纳入提交。

截图文件名：
- `01-easy-hud-no-thruster.png`
- `02-energy-capsule.png`
- `03-water-mine.png`
- `04-missile-flight.png`
- `05-energy-shield.png`
- `06-twin-nitro.png`
- `07-water-trap.png`
- `08-daze.png`
- `09-fire-impact.png`
- `10-shield-impact.png`
- `11-water-splash.png`
- `12-race-relief-coins.png`
- `13-svg-item-slot.png`
- `14-six-car-effects.png`
- `15-hard-hud-thruster.png`
- `16-normal-hud-en.png`

附带 `browser-result.json`、`coin-pixels.json`、`performance.json`（1280×900）与 `performance-1440.json`。独立压力测试使用 performance 文件；截图脚本的帧间隔包含截图/并发构建干扰，不能与独立测试直接比较。

大厅任务 2.1–2.3 与用户确认任务 3.1 保持未勾选。
