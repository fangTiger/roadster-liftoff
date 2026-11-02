# Change: 多人房间部署到生产环境（AWS 东京）

## Why
多人房间只在本地能玩：前端固定连同域名的 `/rooms`，而生产前端在 Vercel 上只提供静态页面；房间服务也缺少上线所需的来源校验、连接数上限、健康检查和停机通知。现在有一台空闲的 AWS 东京服务器，可以用单进程、常驻的方式托管房间服务。

## What Changes
- 前端新增 `VITE_ROOMS_URL`，可指定房间服务地址（如 `wss://52-195-18-175.sslip.io/rooms`）；不设置时仍连同域名 `/rooms`，本地开发不受影响。
- 房间服务新增：
  - 来源校验 `ROOMS_ALLOWED_ORIGINS`（支持 `*` 通配 Vercel 预览域名）；不设置时不校验，方便本地开发。
  - 连接数上限：单个 IP（`ROOMS_MAX_PER_IP`，默认 10）和全服（`ROOMS_MAX_CONNECTIONS`，默认 500）。
  - HTTP 健康检查 `GET /healthz`；端口优先读 `ROOMS_PORT`，其次读 `PORT`；可指定监听地址 `ROOMS_HOST`。
  - 收到 SIGTERM/SIGINT 时先给在线玩家发维护通知，再断开连接并退出。
- 前端收到维护通知时提示「服务器维护中，请稍后重新进入」，回到房间列表，不再卡在原地。
- 新增部署文件 `deploy/rooms/`：systemd 服务、Caddy 配置（自动申请证书，反向代理到本机 8933）、环境变量示例和部署脚本。
- 生产环境开启 `VITE_ROOMS_ENABLED=1` 并配置 `VITE_ROOMS_URL`，重新部署 Vercel。

## Impact
- Affected specs: live-rooms（新增生产部署相关需求）
- Affected code: `src/net/room-client.js`、`src/net/rooms-flag.js`、房间界面的断线提示、`server/rooms/server.js`（及新拆出的配置与校验模块）、`deploy/rooms/`、README 环境变量表
- 服务器：AWS 东京 `52.195.18.175`（Ubuntu 24.04），新装 Node 22 与 Caddy，新建专用系统用户运行服务；不改动服务器上已有的 python 进程
- 上线依赖：重新部署 Vercel 生产环境时，若同时切换新合约（上线清单 1.2），需另行确认
