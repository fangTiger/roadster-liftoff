# 设计：实时房间

## 总体结构
- **房间服务**：只负责房间的流程和消息转发，不计算物理。
  - 房间状态依次为：大厅 → 倒计时 → 比赛中 → 结算 → 回到大厅。
  - 每个房间 2–6 人，房间码为 6 位，排除容易看混的字符；也可以用链接 `/?race&room=ABC123` 加入。
- **客户端**：每人在自己的电脑上，按固定的 120Hz 步长计算自己的车。其他车用收到的状态来画，每人用不同的车漆颜色；正常不透明，重置保护与完赛时半透明。

## 消息协议（JSON，带 type 字段）
- 客户端发给服务：
  - `hello{name, roomCode?, resumeToken?}`、`ready{on}`、`pickTrack{trackId}`（仅房主）；
  - `state{seq, step, x,y,z,yaw,pitch,vx,vz,steer,drifting,boost,lap,s,ghost,air}`，每秒 15 次；ghost、air 均为必填布尔值；
  - `finish{elapsed, bestLap, lapTimes}`、`ping{t}`、`leave`。
- 服务发给客户端：
  - `welcome{id, resumeToken}`、`room{code, players[{id,name,seat,ready,connected,color}], hostId, trackId, phase}`；
  - `start{trackId, laps, startAt, grid[]}`，其中 startAt 是服务器时间；
  - `peer{id, ...state, serverT}`、`left{id}`、`results{results:[{id,name,rank,elapsed,bestLap,dnf}]}`、`pong{t, serverT}`、`error{code}`；所有消息都有 `type`。
- 服务对 state 消息做限流（超过每秒 30 次就丢弃），每个房间单独转发。

## 时钟与发车
- 客户端用多次 ping 往返，估算本机时钟和服务器时钟的偏差。
- 所有客户端在服务器时间 startAt 那一刻开始倒计时，倒计时结束后同时开始计算物理步，各台电脑的发车误差约等于时钟估算误差（几十毫秒）。

## 其他车辆的显示
- 每辆车的历史状态存在缓冲区里。画面按「当前时间减 100 毫秒」去取历史状态，在相邻两次状态之间插值显示。
- 状态没及时到时，最多按当前速度往前推算 250 毫秒；超过 3 秒没收到，就判定掉线、淡出这辆车。

## 软碰撞（src/race/sim/contact.js，确定性纯函数）
- 每一物理步，用自己的车和其他车「推算到当前时刻」的位置做判定。车身按胶囊体处理（复用 physics.js 里的线段最近点计算）。
- 有重叠时：
  - 只把自己的车沿接触法线方向推出；
  - 去掉朝向对方的法向速度；
  - 再按比例减速：基础掉速 contactLoss，若自己是追尾方（自己的速度在对方车头方向上更大），再额外掉速 rearEndLoss。
- 硬性约束：碰撞后的速度大小不超过碰撞前；推出距离每步有上限。
- 以下情况不碰撞：发车后 3 秒内、任一方重置后 2 秒内、任一方离地时。
- 参数加进 tuning.js，名字用 contactLoss、rearEndLoss、contactPushMax、contactGraceStart、contactGraceReset。
- 两台电脑各自只修改自己的车，延迟带来的位置差会让碰撞出现少量不对称，这是可以接受的。

## 和确定性模拟的关系
- `createSession(track, {laps, spawn, contacts})`：contacts 是一个可选回调，每步返回其他车的位置。不传时，行为和现在完全一样，golden 回归测试必须继续通过。
- 房间赛的录像只用于本地回看。因为它受外部车辆影响，不能单独重放核实，所以第一版不上链、不进排行榜。

## 名次
- 比赛中，客户端用「圈数 × 赛道长度 + 当前位置在赛道上的距离」排出实时名次。
- 最终名次以服务器收到 finish 消息的计时为准。冲线前掉线的玩家记为「未完成」。

## 本地开发
- 用 `npm run rooms` 启动房间服务（默认端口 8933）。
- vite 开发服务器把 `/rooms` 的 WebSocket 代理过去，前端统一连接同源的 `/rooms`。

## 不做（第一版）
- 服务器统一计算物理或做位置修正；
- 观战模式、语音聊天；
- 房间赛成绩上链；
- 尾流加速（看试玩效果，作为下一批的候选）。

## 第 1 批实施约定（不含碰撞）
- 已有 session 的 `spawn` 参数足以支持发车格，不修改 session、race、physics、tuning 的物理与计时。座位 0–5 两列相隔 5 米，沿赛道每排退后 8 米。
- startAt 为服务当前时间 +1500ms，客户端到时开始推进 session 自带的 3 秒倒计时。按服务器时间算目标步数，单帧最多追 240 步；菜单不暂停联网计时。
- 每秒发 15 条状态；服务对每个连接用一秒滑动窗口限制最多 30 条，只转发合法字段，补充接收时刻 serverT。服务不执行物理或成绩复算。
- 每 2 秒 ping，以最近 8 次样本的最小 RTT 校时；远端车显示服务器当前时间减 100ms 的状态，外推上限 250ms，3 秒后淡出。
- 断线保留席位与恢复令牌 30 秒，但立即向最早加入且在线的玩家移交房主；恢复后继续本机同一局，不重置 session。超时或主动离房的未完赛者在本局参赛名单中保留 DNF。
- 第一个 finish 开启 60 秒结算期限。统一结算按自报 elapsed 升序，DNF 排后；以 `{type:"results",results:[...]}` 发送，随后回大厅并清空准备。结果页保留到用户点击回到大厅。
- 房间赛不显示上链面板，不读取或保存最佳影子，不调用 `/api/verify`。链接保留 autopilot 参数，可运行双页机器人验收。
- 开发服务：`npm run rooms` 与 `npm run dev -- --port 8932`；随后运行 `node scripts/rooms-e2e.mjs`，可用 URL 指定地址、ROOMS_E2E_CHANNEL 指定已安装的浏览器通道。

## 第 2 批实施约定（软碰撞）
- `resolveContacts(car, others, opts)` 无时间、随机数和外部状态依赖；沿用 stepCar 的状态写入约定，只修改自己的 car，返回事件，不修改 others。复用原样导出的 closest 和确定性三角函数；胶囊中心线长 length − width，半径 width / 2。
- 按远端 id 固定处理顺序。每对重叠推出半个穿透深度，多车共享每步 contactPushMax（0.25 米）的推出总量；去掉朝对方的法向速度后乘 0.92，处于对方后方且沿对方车头方向更快时额外乘 0.8，最后再约束速度大小不超过解析前。相对靠近的法向速度超过 1 米/秒时记录 contact 事件。
- 中心线重合时依次以车心连线、相对速度确定法线；完全同心同速时用双方身份选择相反的世界 x 方向。房间通过 session 的可选 contactId 向解析器 opts.id 提供自己的身份（直接解析也可读 car.id）；身份不进入车状态或快照，重置后仍保留。
- contacts(step) 在 stepCar 后、race.step 前调用；倒计时、完赛、离地、自动或手动重置保护期间均不调用。保护只看 race.state.steps × DT，忽略罚时；发车已过 3 秒、距重置已过 2 秒才允许接触，边界步仍受保护。接触事件附上包含倒计时的 session step；推出后同步路面投影与高度，避免下一步误判上坡弹射。
- session.ghost 是只读属性，重置保护中或已完赛时为 true。不向 snapshot 增加字段；未传 contacts 时保留旧物理路径、SIM_VERSION=1 及原 golden.json，现有 tuning 参数不变。
- 收到 peer 后用 `simT = startAt + step × DT × 1000` 建立时间轴（含 session 的三秒倒计时）；serverT 只判断接收后是否超过 3 秒。渲染仍采样 serverNow − 100ms；contacts 采样自己当前步的模拟时间，最多外推 250ms。采样状态与最新状态任一个 ghost/air 为 true，或已 stale，都排除接触。
- 上报 ghost 必取 session.ghost，air 为 !car.grounded；服务端严格校验两者为布尔值，仅转发白名单字段，重连补发保留两者，不信任客户端自报 simT。
- 本地和远端车 ghost 时车身透明度乘 0.35；结束后恢复各材质原透明度、透明标志和深度写入，远端名牌保留可读性。stale 淡出继续叠加；单人模式不应用该样式。
- contact 音效复用合成音频总线，用短低频噪声与低音组成闷响，音量随 impact 增大，每 24 步最多一次；每局重置事件游标与节流。镜头用 0.06–0.2 的轻量 kick，保证低帧率至少反馈一帧，默认加速 kick 保持原行为。
- 验证包含原 sim/golden、胶囊与双视角退化接触、保护回调步数、simT 采样与 stale、air/ghost 校验转发、透明度恢复、多局音效和低帧率镜头。全量 node:test、Vite 构建与 rooms-e2e 语法检查必须通过；双页运行若被沙箱监听权限阻止，明确记录，留待本地试玩验收。

## 软碰撞审查修正（Claude）
- 法向只消除「相对」接近速度的一半，不消除绝对法向速度。否则同向跟车只要轻微重叠，后车就会被直接刹停。
- 掉速按「一次接触」结算：同一辆车在 contactCooldown（0.3 秒）内持续贴身，不重复扣速，也不重复发 contact 事件（音效、震屏）。否则网络延迟让被撞方连续多步看到重叠，会被反复扣速。
- 掉速比例 = 接近速度 ÷ 车速（上限 1）×（contactLoss .1 + 追尾时再加 rearEndLoss .15）。侧面轻蹭几乎不掉速，正面硬撞掉得多。
