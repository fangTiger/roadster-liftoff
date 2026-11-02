# Design: 多人房间生产部署

## 拓扑
浏览器（https://mars-roadster.vercel.app）→ `wss://52-195-18-175.sslip.io/rooms` → Caddy（80/443，自动 HTTPS）→ `127.0.0.1:8933` Node 房间服务（systemd，单进程）。

- 域名：先用 sslip.io（把 IP 写进域名，无需配置解析即可申请证书）；以后有自有域名时只改 Caddyfile 和 `VITE_ROOMS_URL`。
- 单进程、状态在内存：重启会清空所有房间。部署避开有人在玩的时段；停机前先发维护通知。
- 前提：实例公网 IP 必须是弹性 IP，否则实例停止再启动后 IP 会变，sslip 域名随之失效。

## 服务端改动
- `server.js` 改为 `http.createServer` 承载：`GET /healthz` 返回 200 和 `{ok,rooms,connections}`；`upgrade` 只接受路径 `/rooms`，其余返回 404。
- 握手阶段（`verifyClient` 或在 `upgrade` 中手动处理）依次检查：来源是否在白名单 → 全服连接数 → 该 IP 连接数。不通过直接拒绝握手（403 / 503），不进入房间逻辑。
- 来源白名单为逗号分隔的完整 origin，`*` 只匹配单个域名标签中的一段（如 `https://mars-roadster-*.vercel.app`）；没有 Origin 头的连接在开启白名单时一律拒绝。
- 计数在 `close` 时减少；IP 取自 `clientIP()`，生产环境经 Caddy 转发，开启 `ROOMS_TRUST_PROXY=true`，并且服务只监听 `127.0.0.1`，防止伪造转发头。
- 停机：先关闭监听，向所有连接发送 `{type:'maintenance'}`，等 500 ms 后用 1012 关闭码断开，清理计时器，再退出；最迟 3 秒强制退出。
- 配置解析与校验抽成纯函数模块（`server/rooms/config.js`、`server/rooms/admission.js`），单独测试。

## 前端改动
- `room-client.js`：地址优先使用传入的 `roomsUrl`（来自 `import.meta.env.VITE_ROOMS_URL`），否则沿用同域名 `/rooms`。
- 收到 `maintenance` 消息或 1012 关闭码时，停止自动重连，发出 `maintenance` 事件；房间界面显示提示并回到房间列表。

## 服务器部署
- `deploy/rooms/mars-roadster-rooms.service`：专用用户 `roadster`（无登录 shell），工作目录 `/opt/mars-roadster-rooms`，环境变量文件 `/etc/mars-roadster-rooms.env`，`Restart=always`，`MemoryMax=256M`，开启 `NoNewPrivileges`、`ProtectSystem=strict` 等加固项；日志进 journald。
- `deploy/rooms/Caddyfile`：站点 `52-195-18-175.sslip.io`，`/rooms*` 和 `/healthz` 反向代理到 `127.0.0.1:8933`，其他路径返回 404。
- `deploy/rooms/deploy.sh`：本地执行，参数为 SSH 目标。把 `server/rooms/` 下的非测试文件和只含 `ws` 依赖的精简 `package.json` 同步到服务器，`npm ci --omit=dev`，重启服务，再请求 `/healthz` 确认。脚本不包含任何密钥，SSH 身份由调用者提供。
- 一次性安装（由审查者执行，每步先征得同意）：NodeSource Node 22、Caddy 官方 apt 源、创建用户与目录、安装服务和 Caddyfile。

## 验证
- 单元测试：配置解析、来源匹配（含通配）、连接数上限、健康检查、停机流程、前端地址选择与维护提示。
- 本地：设置 `ROOMS_ALLOWED_ORIGINS` 后，确认非白名单页面连不上、白名单页面能正常建房。
- 线上：`curl https://52-195-18-175.sslip.io/healthz`；从 Vercel 预览站用两个浏览器建房、加入、开赛；重启服务，确认两边都显示维护提示。
