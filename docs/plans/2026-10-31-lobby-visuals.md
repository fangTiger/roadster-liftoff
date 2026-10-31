# 房间列表氛围与大厅标题验证

## 设计与范围

选择三张现有地图实景轮播，复用 `/assets/race/previews/{easy,normal,hard}.webp`，保持大厅的深色玻璃、暖金灯带与冷色环境光。没有为列表创建第二个 WebGL 展厅，避免额外模型加载、渲染器初始化和退出清理成本。

背景用独立装饰容器承载，每 36 秒完整轮播一次，单图约 12 秒，相邻地图约 3 秒交叉淡入。暗角固定；光带和六颗光点只动画位移、透明度；装饰不接受指针事件并标记 `aria-hidden`。面板保留毛玻璃；行悬停或键盘焦点高光；只有可加入的等待中房间的人数点呼吸。空态增加内联车辆剪影和大号建房按钮，剪影不进入读屏顺序。

大厅标题以局部深色渐变衬底和文字阴影隔开地图树木、亮天空，右侧和底部渐隐。保留现有文字、布局与地图切换协议。减少运动模式固定草甸背景，关闭轮播、光带、光点和人数点呼吸。

## 验证方法

先添加两个真实 UI 工厂的 DOM 测试：空态车辆剪影的装饰语义及建房按钮、等待中与满员房间的动效标记隔离。确认两项因缺失行为失败后实现，再运行通过。

- `node --test src/race/lobby/room-browser.test.mjs src/race/room-ui.test.mjs`
- `node --check src/race/lobby/room-browser.js`
- `node --check scripts/race/capture-lobby-visuals.mjs`
- `openspec validate upgrade-room-lobby --strict`
- `node scripts/race/capture-lobby-visuals.mjs`

针对性测试 39 / 39 通过；两个 JavaScript 语法检查通过；OpenSpec strict 校验通过（CLI 的遥测域名在受限网络下解析失败，不影响规范校验及退出码）。

浏览器脚本连接现有的 Vite 8932 和房间服务 8933，用真实 WebSocket 建房、加机器人制造满员状态，并通过真实建房和选图交互拍摄大厅标题。脚本会主动离开自己的测试房间。若服务中已有其他房间，空态图临时挂载相同 UI 工厂，随后刷新恢复真实目录，不删除其他房间。

脚本通过浏览器动画时间采样覆盖完整 36 秒轮播：草甸、湖畔、阿尔卑斯依次出现，交叉淡入阶段地图透明度之和不少于 0.99，无全黑间隙。减少运动时实际计算样式为草甸透明度 1、另两图 0，所有新动效 animation-name 为 none。

## 性能证据

Chrome 无头模式、Metal GPU、本机 1440×900 桌面和 390×844 响应式视口，轮播、光带、光点和人数呼吸均开启。每个场景采集约 5 秒、301 个 requestAnimationFrame 间隔：

| 场景 | 平均帧率 | 帧间隔 P95 |
| --- | ---: | ---: |
| 桌面列表 1440×900 | 60.00 FPS | 16.8 毫秒 |
| 手机宽度列表 390×844 | 60.00 FPS | 16.7 毫秒 |

这是本机浏览器的主线程呈现节奏测量，不代表实体手机硬件的 GPU 性能保证。页面未发现 JavaScript 异常，390 宽无横向溢出，加入按钮高度不小于 44 像素。完整数值和样式采样写入截图目录的 `visuals-result.json`。

## 截图逐张自查

目录：`/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/lobby-5/`。

| 文件 | 人工可视检查 |
| --- | --- |
| `01-list-empty.png` | 草甸实景覆盖全屏；玻璃面板内车辆剪影、空态文字和大号金色建房按钮层次明确。 |
| `02-list-desktop.png` | 房间名/地图/人数可读；悬停行金色高光明确；满员房间置灰，按钮禁用。 |
| `03-list-mobile-390.png` | 390 宽无裁切；昵称与房间码两列、加入房间按钮整行；房间行的加入按钮和人数点不重叠。 |
| `04-list-mobile-reduced-motion.png` | 静态草甸仍有空间层次；操作位置与正常运动模式一致，背景光带和光点消失。 |
| `05-garage-title-easy.png` | 「发车前的聚会」在亮天空、草甸树木前清楚可读；标题衬底没有遮挡主车或右侧操作面板。 |
| `06-garage-title-normal.png` | 湖畔场景标题保持清晰；顶部英文眉题、人数副标题也有足够明暗分离。 |
| `07-garage-title-hard.png` | 阿尔卑斯明亮地平线与树木处标题仍清晰；文字未被背景或灯带吞没。 |

## 限制

50 FPS 已在本机 Chrome 的两种视口满足；尚未用实体低端手机进行硬件验收。全仓测试与生产构建由本次任务统一验证，结果以最终提交报告为准。

## 改动文件清单

- `src/race/lobby/room-browser.css`
- `src/race/lobby/room-browser.js`
- `src/race/lobby/room-browser.test.mjs`
- `src/race/lobby/garage.css`
- `src/race/room-ui.js`（装饰背景容器）
- `scripts/race/capture-lobby-visuals.mjs`
- `docs/plans/2026-10-31-lobby-visuals.md`
- `openspec/changes/upgrade-room-lobby/specs/live-rooms/spec.md`
- `openspec/changes/upgrade-room-lobby/tasks.md`

最终全量 `npm test` 为 597 项通过，`npx vite build` 通过；无推送、部署。
