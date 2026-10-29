# 设计：实时房间

## 总体结构
- **房间服务**：只负责房间的流程和消息转发，不计算物理。
  - 房间状态依次为：大厅 → 倒计时 → 比赛中 → 结算 → 回到大厅。
  - 每个房间 2–6 人，房间码为 6 位，排除容易看混的字符；也可以用链接 `/?race&room=ABC123` 加入。
- **客户端**：每人在自己的电脑上，按固定的 120Hz 步长计算自己的车。其他车用收到的状态来画，复用影子车的外观代码，但每人用不同的车漆颜色、不做半透明。

## 消息协议（JSON，带 type 字段）
- 客户端发给服务：
  - `hello{name, roomCode?, resumeToken?}`、`ready{on}`、`pickTrack{trackId}`（仅房主）；
  - `state{seq, step, x,y,z,yaw,pitch,vx,vz,steer,drifting,boost,lap,s,ghost?}`，每秒 15 次；
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
