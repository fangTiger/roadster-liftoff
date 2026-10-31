# 房间浏览器模块 (room-browser)

多人大厅房间列表 UI 模块，供 Mars Roadster / 离地 LIFTOFF 使用。

---

## 文件结构

```
src/race/lobby/
  room-browser.js          # UI 模块（主文件）
  room-browser.css         # 样式（rb- 前缀）
  room-browser-demo.html   # 独立演示页
  room-browser.test.mjs    # 纯函数单元测试

server/rooms/
  directory.js             # 服务端纯逻辑（无 WS、无计时器）
  directory.test.mjs       # 服务端单元测试
```

---

## Part A — 服务端 directory.js

### 创建实例

```js
import { createDirectory } from '../../server/rooms/directory.js';

const dir = createDirectory({
  now: Date.now,          // 可注入假时钟（测试用）
  hash: myHashFn,         // 可替换哈希函数（默认 scrypt）
  verify: myVerifyFn,     // 可替换验证函数
});
```

默认哈希：`node:crypto` scrypt，随机 16 字节盐，存储格式 `"scrypt$<saltHex>$<hashHex>"`。

### API

#### `validateCreate({ name, locked, password })`

验证建房参数，返回 `Promise<Result>`。

| 参数 | 类型 | 说明 |
|------|------|------|
| name | string | 房间名，自动清理控制字符，截取最多 20 代码点；可为空字符串（由调用方填默认名） |
| locked | boolean | 是否加锁，必须为布尔值 |
| password | string | 仅当 locked=true 时读取；必须匹配 `/^\d{4}$/` |

成功：`{ ok: true, value: { name, locked, passwordHash } }`
失败：`{ ok: false, code: 'BAD_PASSWORD' | 'BAD_LOCKED' }`

#### `summary(room)`

生成房间公开摘要（**绝不包含 passwordHash**）。

输入 room 对象格式（由服务端维护）：
```js
{
  code, name, locked, passwordHash, hostId, trackId, mode,
  phase: 'lobby' | 'countdown' | 'racing',
  players: [{ id, name, bot, connected }]
}
```

输出字段：`code, name, hostName, trackId, mode, players, max, phase, locked, joinable, reason`

- `joinable = phase === 'lobby' && players < 6`
- `reason: 'FULL' | 'RACING' | null`

#### `list(rooms)`

过滤并排序 summary 数组：
1. 跳过没有已连接真人（非 bot）的房间
2. 可加入的排前面
3. 同组内按人数降序
4. 同人数再按 code 字典序

#### `checkJoin(room, { password, clientKey })`

验证玩家加入请求，返回 `Promise<Result>`。

- 非加锁房间直接通过
- 加锁房间：验证密码，同一 `(room.code, clientKey)` 连续错误 5 次后锁定 60 秒；调用方必须以客户端 IP 作为 clientKey，同房同 IP 的异步验证在模块内串行执行，锁定到期后重新计数
- 锁定期内不调用 verify

错误码：`'FULL' | 'RACING' | 'PASSWORD_REQUIRED' | 'BAD_PASSWORD' | 'LOCKED_OUT'`

#### `forget(code)`

清除某个房间的所有限流记录（房间被删除时调用）。

#### `inviteUrl(base, room, password)`

生成邀请链接。加锁房间且提供密码时附加 `&pw=1234`。

---

## Part B — 前端 room-browser.js

### 创建实例

```js
import { createRoomBrowser } from './room-browser.js';
// 同时引入样式
// <link rel="stylesheet" href="room-browser.css">

const browser = createRoomBrowser({
  container,   // HTMLElement，模块在其内部创建 DOM
  t,           // (key, params?) => string，i18n 函数
  onJoin,      // ({ code, password? }) => Promise<{ ok, code? }>
  onCreate,    // ({ name, locked, password? }) => Promise<{ ok, code? }>
  onRefresh,   // () => void，用户点刷新时调用
});
```

### 返回值

```js
{
  update({ rows, online }),   // 推送新数据（rows = directory.list() 的结果）
  setStatus(status),          // 'connecting' | 'online' | 'offline'
  open(),                     // 显示（配合 close 控制可见性）
  close(),                    // 隐藏 + 关闭所有模态
  destroy(),                  // 移除 DOM，清理事件
  promptPassword(code),        // 手动输入房间码或邀请密码错误后打开密码弹框
  refreshLabels(),             // 切换语言后刷新固定标签并关闭旧语言弹框
}
```

### 导出的纯函数（供测试）

```js
import { buildRowModels, nextPinFocus, isValidPin } from './room-browser.js';
```

---

## i18n 键值表

| 键 | 中文 | English |
|----|------|---------|
| `room.browser.title` | 多人房间 | Multiplayer Rooms |
| `room.browser.count` | {n} 个房间 · {m} 人在线 | {n} rooms · {m} online |
| `room.browser.refresh` | 刷新 | Refresh |
| `room.browser.create` | 建房 | Create Room |
| `room.browser.createTitle` | 创建房间 | New Room |
| `room.browser.createConfirm` | 确认创建 | Create |
| `room.browser.join` | 加入 | Join |
| `room.browser.cancel` | 取消 | Cancel |
| `room.browser.confirm` | 确认 | Confirm |
| `room.browser.enterPassword` | 请输入房间密码 | Enter Room Password |
| `room.browser.setPassword` | 设置 4 位数字密码 | Set 4-digit Password |
| `room.browser.roomNameLabel` | 房间名称（可选） | Room Name (optional) |
| `room.browser.public` | 公开 | Public |
| `room.browser.locked` | 加锁 | Private |
| `room.browser.connecting` | 正在连接服务器… | Connecting… |
| `room.browser.offline` | 服务器暂时无法连接 | Server unreachable |
| `room.browser.retry` | 重试 | Retry |
| `room.browser.empty` | 暂时没有其他玩家 | No rooms yet |
| `room.browser.badPassword` | 密码错误 | Wrong password |
| `room.browser.lockedOut` | 错误次数过多，请 1 分钟后再试 | Too many attempts, try again in 1 min |
| `room.browser.passwordRequired` | 请输入密码 | Password required |
| `room.browser.roomFull` | 房间已满 | Room is full |
| `room.browser.roomRacing` | 比赛进行中 | Race in progress |
| `room.browser.joinFailed` | 加入失败，请稍后再试 | Join failed |
| `room.browser.createFailed` | 创建失败，请稍后再试 | Create failed |
| `room.browser.badParams` | 参数错误 | Invalid params |
| `room.browser.close` | 关闭 | Close |
| `room.browser.pinDigit` | 密码第 {n} 位 | Password digit {n} |
| `room.defaultName` | {host} 的房间 | {host}'s Room |
| `room.waiting` | 等待中 | Waiting |
| `room.full` | 已满 | Full |
| `room.racing` | 比赛中 | Racing |
| `race.track1`..N | （赛道名，由主项目定义） | (track names defined by host app) |
| `room.mode.speed` | 极速 | Speed |
| `room.mode.items` | 道具 | Items |

---

## 接入 WebSocket（建议协议）

### 服务端推送

服务端在房间列表变更时（节流 1 秒）推送：

```json
{ "type": "rooms", "rooms": [...summary], "online": 42 }
```

客户端接收后调用：
```js
socket.on('message', msg => {
  const data = JSON.parse(msg);
  if (data.type === 'rooms') {
    browser.update({ rows: data.rooms, online: data.online });
    browser.setStatus('online');
  }
});
```

### 订阅房间列表

连接建立后发送：
```json
{ "type": "listRooms" }
```

### 创建房间

```json
{ "type": "hello", "name": "Player1", "create": { "name": "我的房间", "locked": true, "password": "1234" } }
```

### 加入房间

```json
{ "type": "hello", "name": "Player1", "roomCode": "ABCD12", "password": "1234" }
```

### 连接状态处理

```js
socket.onopen  = () => browser.setStatus('connecting');
socket.onclose = () => browser.setStatus('offline');
// 收到首条 rooms 消息后调用 setStatus('online')
```

---

## 接入 room-ui.js

在 `mountRoomUI` 返回的对象中，使用 `client.on('connection')` 和 `client.on('room')` 驱动展厅；房间浏览器与展厅并列放置：

```html
<!-- HTML 结构 -->
<div class="grg-layout" id="rm-room">
  <div data-rm-garage></div>        <!-- 展厅 canvas -->
  <div id="room-browser-wrap"></div> <!-- 房间浏览器，同层 -->
  <section data-rm-lobby class="rm-overlay">...</section> <!-- 原房间面板 -->
</div>
```

```js
import { createRoomBrowser } from './room-browser.js';

const browser = createRoomBrowser({
  container: document.getElementById('room-browser-wrap'),
  t,
  onJoin: async ({ code, password }) => {
    // 通过 client 发送加入请求
    client.connect({ name: myName, roomCode: code, password });
    return new Promise(resolve => {
      const off = client.on('room',  () => { off(); resolve({ ok: true }); });
      const ofe = client.on('error', m  => { ofe(); resolve({ ok: false, code: m.code }); });
    });
  },
  onCreate: async ({ name, locked, password }) => {
    client.connect({ name: myName, create: { name, locked, password } });
    return new Promise(resolve => {
      const off = client.on('room',  () => { off(); resolve({ ok: true }); });
      const ofe = client.on('error', m  => { ofe(); resolve({ ok: false, code: m.code }); });
    });
  },
  onRefresh: () => client.send({ type: 'listRooms' }),
});

// 服务端推送房间列表时更新
client.on('rooms', ({ rooms, online }) => {
  browser.update({ rows: rooms, online });
  browser.setStatus('online');
});

client.on('connection', ({ connected }) => {
  browser.setStatus(connected ? 'online' : 'offline');
});
```

---

## 安全注意事项

- 房间名、玩家名等用户提供的字符串**只通过 `textContent` 写入 DOM**，从不使用 `innerHTML`，防止 XSS。
- 密码**不写入 localStorage 或控制台**；房内复制邀请链接时可附加 `pw`，接收端加入成功后立即用 `history.replaceState` 清除地址栏中的 `pw`。只有当前房间的内存保存分享所需明文，服务端仅保存哈希。
- `directory.summary()` 保证 `passwordHash` 等敏感字段**不出现在摘要对象或其 JSON 序列化中**。

---

## 运行测试

```sh
# 服务端逻辑
node --test server/rooms/directory.test.mjs

# 前端纯函数
node --test src/race/lobby/room-browser.test.mjs
```

## 主项目接入说明

- `room-ui.js` 在列表上方保留昵称存储与手动房间码入口，`room-client.js` 的 `browse()` 在首次连接和断线恢复后订阅列表，成功入房后退订。错误密码可以在同一连接重试；恢复入房只发送昵称、房间码（若有）与 resumeToken。
- `server.js` 默认读取套接字 IP；只有进程显式设置 `ROOMS_TRUST_PROXY=true` 时才读取 `X-Forwarded-For` 的第一个有效 IP。该选项只应在入口由可信代理控制时配置；本次未修改本地运行配置。
- Studio 模块调整：目录增加同房同 IP 串行验证与到期计数重置；浏览器增加中英文无障碍标签、语言刷新和主动密码弹框接口，修复列表更新前清空 DOM 导致焦点与行复用失效。主体 CSS 与独立 demo 保持原样，宿主 `room.css` 负责金色主题及 body 弹框继承。
- 验证：`node scripts/rooms-browser-e2e.mjs`；可通过 `URL`、`ROOMS_WS`、`ROOMS_SCREENSHOTS` 覆盖本地地址和截图目录。
