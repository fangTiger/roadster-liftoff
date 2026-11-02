## 1. 房间服务（代码）
- [ ] 1.1 新增 `server/rooms/config.js`：解析端口、监听地址、来源白名单、连接上限、是否信任代理，附测试
- [ ] 1.2 新增 `server/rooms/admission.js`：来源匹配（含通配）、全服与单 IP 计数，附测试
- [ ] 1.3 `server.js` 改为 HTTP 服务承载 WebSocket：`/healthz`、握手准入、维护停机
- [ ] 1.4 停机流程测试（维护消息、1012 关闭码、计时器清理）

## 2. 前端（代码）
- [ ] 2.1 `room-client.js` 支持 `VITE_ROOMS_URL`，附测试
- [ ] 2.2 处理维护消息与 1012 关闭码：停止重连，提示后回到房间列表；补中英词条
- [ ] 2.3 README 环境变量表补充 `VITE_ROOMS_URL` 与服务端变量

## 3. 部署文件
- [ ] 3.1 `deploy/rooms/` 下的 systemd 服务、Caddyfile、环境变量示例、`deploy.sh`、中文 README

## 4. 上线（审查者执行，每步先征得用户同意）
- [ ] 4.1 用户确认安全组已放行 80/443，且实例使用弹性 IP
- [ ] 4.2 服务器安装 Node 22 与 Caddy，创建用户、目录和服务
- [ ] 4.3 部署房间服务，验证 `/healthz` 和证书
- [ ] 4.4 Vercel 预览环境配置 `VITE_ROOMS_ENABLED=1`、`VITE_ROOMS_URL`，两个浏览器实测建房、开赛和维护提示
- [ ] 4.5 Vercel 生产环境配置同样的变量并重新部署（是否同时切换新合约另行确认）
- [ ] 4.6 更新上线清单 2.1、2.2
