## ADDED Requirements
### Requirement: 生产环境房间服务地址
前端 SHALL 支持通过构建变量 `VITE_ROOMS_URL` 指定房间服务地址；未设置时 SHALL 连接当前页面同域名下的 `/rooms`。

#### Scenario: 指定独立的房间服务
- **WHEN** 构建时设置 `VITE_ROOMS_URL=wss://52-195-18-175.sslip.io/rooms`
- **THEN** 房间列表、建房和比赛都连接该地址

#### Scenario: 本地开发
- **WHEN** 未设置 `VITE_ROOMS_URL`
- **THEN** 前端连接同域名的 `/rooms`，经 Vite 代理到本机房间服务

### Requirement: 房间服务准入
房间服务 SHALL 在握手阶段检查来源网站和连接数量，不通过的连接 SHALL 被拒绝且不进入房间逻辑。

#### Scenario: 非白名单网站
- **WHEN** 已配置 `ROOMS_ALLOWED_ORIGINS`，而连接的 Origin 不在白名单内或缺失
- **THEN** 握手被拒绝

#### Scenario: Vercel 预览域名
- **WHEN** 白名单包含 `https://mars-roadster-*.vercel.app`，连接来自某个预览域名
- **THEN** 握手通过

#### Scenario: 连接过多
- **WHEN** 同一 IP 的连接数达到 `ROOMS_MAX_PER_IP`，或全服连接数达到 `ROOMS_MAX_CONNECTIONS`
- **THEN** 新连接被拒绝，已有连接不受影响

#### Scenario: 本地开发不校验来源
- **WHEN** 未配置 `ROOMS_ALLOWED_ORIGINS`
- **THEN** 任何来源都可以连接

### Requirement: 健康检查
房间服务 SHALL 提供 `GET /healthz`，服务正常时返回 200 和当前房间数、连接数。

#### Scenario: 部署后探测
- **WHEN** 部署脚本或运维请求 `/healthz`
- **THEN** 返回 200 和 JSON，且不包含玩家名、房间码或密码

### Requirement: 维护停机通知
房间服务 SHALL 在收到停止信号时先通知在线玩家再断开；前端 SHALL 提示维护并回到房间列表，不再自动重连。

#### Scenario: 重新部署
- **WHEN** 有玩家在大厅或比赛中时，房间服务被重启
- **THEN** 玩家看到「服务器维护中，请稍后重新进入」并回到房间列表

#### Scenario: 普通断线
- **WHEN** 网络短暂中断，且没有收到维护通知
- **THEN** 前端仍按原有逻辑自动重连并尝试恢复座位
