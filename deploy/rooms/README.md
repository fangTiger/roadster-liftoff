# 多人房间独立服务

前端静态页面通过 WebSocket 连接此服务。Caddy 负责 HTTPS，Node 单进程在内存保存房间。重启会清空所有房间；服务先通知维护，再断开在线玩家。日常部署应避开有人比赛的时段。

本文命令供审查者执行，每个上线步骤先征得用户同意。执行前确认实例使用弹性公网 IP，安全组允许 TCP 80/443；8933 仅监听本机，不开放公网。

## 一次性安装（Ubuntu 24.04）

以下步骤在目标主机上由有 sudo 权限的运维用户执行。本地准备好仓库中的本目录文件，通过调用者自己的 SSH 配置传到目标主机。

1. 安装 NodeSource Node 22、rsync 和基础工具：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg rsync
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource-setup.sh
sudo bash /tmp/nodesource-setup.sh
rm /tmp/nodesource-setup.sh
sudo apt-get install -y nodejs
node --version
npm --version
```

2. 使用 Caddy 官方 apt 源安装：

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

3. 创建无登录 shell 的专用用户与目录：

```bash
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin roadster
sudo install -d -o roadster -g roadster -m 0755 /opt/mars-roadster-rooms
```

4. 在上传的本目录中安装服务与配置：

```bash
sudo install -m 0644 mars-roadster-rooms.service /etc/systemd/system/mars-roadster-rooms.service
sudo install -m 0644 Caddyfile /etc/caddy/Caddyfile
sudo install -m 0600 rooms.env.example /etc/mars-roadster-rooms.env
sudoedit /etc/mars-roadster-rooms.env
sudo systemctl daemon-reload
sudo systemctl enable mars-roadster-rooms
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddyfile 定义此实例专用站点；若已有其他 Caddy 站点，先合并配置再安装。确认 `/usr/bin/node` 是 Node 22。房间服务先启用，首次上传代码后由部署脚本启动。

| 变量 | 用途 |
|---|---|
| `ROOMS_HOST` | 监听地址；生产绑定本机回环地址 |
| `ROOMS_PORT` | 房间监听端口，优先于 `PORT`，默认 8933 |
| `PORT` | 未设置 `ROOMS_PORT` 时使用的端口 |
| `ROOMS_ALLOWED_ORIGINS` | 逗号分隔的完整来源白名单；空值不校验；`*` 只匹配单个域名标签内的一段字符，协议与端口必须一致；启用白名单时拒绝缺失 Origin 的握手 |
| `ROOMS_MAX_PER_IP` | 单 IP 连接上限，默认 10 |
| `ROOMS_MAX_CONNECTIONS` | 全服连接上限，默认 500，包含房间列表浏览者 |
| `ROOMS_TRUST_PROXY` | 仅值为 `true` 时信任代理提供的首个转发 IP；应配合仅监听回环地址使用 |

非法数字回落默认值。此服务不读取项目根目录环境文件。

## 日常部署

本机需要 Node/npm、rsync 与 SSH；远端运维用户需要 sudo 权限，并能以 roadster 身份执行 npm、同步应用目录、重启该服务。先完成一次性安装，再在仓库根目录执行：

```bash
deploy/rooms/deploy.sh <ssh目标>
```

目标可以是 SSH 别名；身份由调用者的 SSH 配置或目标之后的附加 SSH 参数提供。脚本不保存身份凭据。本机在临时目录只打包服务端 JavaScript 和精简依赖；没有锁文件时先本地生成并一起上传。远端运行 `npm ci --omit=dev`（缓存显式写入应用目录，专用用户无需 home 目录）、重启服务，再通过本机 HTTP 健康检查确认就绪。脚本不会安装系统组件或改动 Caddy、systemd、环境配置。

```bash
curl -fsS http://127.0.0.1:8933/healthz
sudo systemctl status mars-roadster-rooms
sudo journalctl -u mars-roadster-rooms -f
sudo journalctl -u mars-roadster-rooms --since '1 hour ago'
sudo journalctl -u caddy -f
```

`GET /healthz` 返回 `{ok:true,rooms,connections}`，只包含数量。停机信号为 SIGTERM/SIGINT：通知维护，500 毫秒后以 1012 关闭连接，最迟 3 秒退出；前端停止自动重连，需用户稍后重新进入。普通网络断线仍尝试恢复座位。

前端构建使用 `VITE_ROOMS_ENABLED` 开启多人入口，`VITE_ROOMS_URL` 指定独立的 ws/wss 地址；未指定地址时继续连接同域名 `/rooms`，本地 `npm run rooms` 与 `npm run dev` 无需新增变量。

## 更换自有域名

将域名 DNS A 记录指向实例弹性公网 IP，把 Caddyfile 的站点名换为新域名，验证配置后 reload Caddy。前端的 `VITE_ROOMS_URL` 改为新域名下的 `wss://<域名>/rooms` 并重新构建。来源白名单填写访问游戏的前端 origin；前端域名也变更时同步更新 `ROOMS_ALLOWED_ORIGINS` 并重启房间服务。Caddy 会自动管理新域名证书。
