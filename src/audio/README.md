# Mars Roadster 音频模块

零依赖原生 ES 模块，音乐通过 `<audio>` → `MediaElementAudioSourceNode` 流式播放，不下载解码整首 MP3。音效、噪声和混响均在本地合成，无需安装包或构建。

## 演示与验证

通过现有 Vite 开发服务器打开 `/src/audio/demo.html`。也可以使用任何静态 HTTP 服务器，将本目录与音乐目录一并提供服务；不要直接通过 `file://` 打开模块。

点击“解锁音频”，再调整速度、海拔、油门、制动、推进器、碎石、冲击与等离子体。模式和音乐分别控制：例如选择 ascent、提高高度和 lift，再切换 space；选择 orbit 可听到风与电机消失、混响及缓慢声像；选择 reentry、提高 plasma，再触发 land 可听到落地与回干。五类事件均有按钮。

```sh
node --check src/audio/audio.js
node --test src/audio/audio.test.mjs
```

行为测试使用最小 Web Audio 接口替身，验证调度与状态，并不替代真实浏览器解码、听感和设备性能验证。

## 接入

```js
import { createAudio } from './audio/audio.js';

const audio = createAudio({ urls: {
  road: '/assets/music/road-80s-synthwave.mp3',
  space: '/assets/music/space-cosmos.mp3',
  oldfriend: '/assets/music/oldfriend-reflected-light.mp3',
} });

// 必须直接在手势处理器内调用；不要先等待其他异步工作。
startButton.addEventListener('click', async () => {
  try {
    await audio.unlock();
  } catch (error) {
    console.warn('音频解锁失败，可再次点击重试', error);
  }
});

// 放入已有的游戏循环，dt 的单位为秒。
function updateAudio(dt, vehicle, flight) {
  audio.update(dt, {
    mode: flight.mode,
    speedKmh: vehicle.speedKmh,
    throttle: vehicle.throttle,
    brake: vehicle.brake,
    jet: vehicle.jet,
    lift: vehicle.lift,
    altitude: flight.altitude,
    offroad: vehicle.offroad,
    landing: vehicle.landing,
    plasma: flight.plasma,
  });
}

// 在已有状态转换或游戏事件处理器中调用。
void audio.cue('space');
void audio.cue('oldfriend');
// 触地帧先 update 最新冲击值，再触发一次 land。
// audio.event('land');
```

本次交付不修改游戏入口；将调用接入现有游戏循环即可。

## API

`createAudio({ urls })`：三个非空字符串地址必填。仅保存配置；解锁前不创建上下文、媒体、音源，不发起音乐加载。

| 方法/属性 | 行为 |
| --- | --- |
| `unlock(): Promise<void>` | 首次手势创建上下文、启动流式播放并淡入 road；同时激活三个媒体元素的权限。重复调用恢复上下文，保留当前音乐；首次失败可重试。 |
| `cue(name): Promise<boolean>` | road、space、oldfriend。使用音频时钟调度约 2.5 秒的等功率交叉淡化。成功切换返回 true；未解锁、当前曲或播放失败返回 false。未知名称同步抛出 RangeError。 |
| `update(dt, s)` | 每帧读取状态，不修改传入对象；缺失/非法数字按安全默认值处理。dt 单位为秒；平滑使用音频时钟，不依赖游戏帧率。 |
| `event(name)` | launch、land、whiteout、achievement、horn（单次短鸣）、roll（翻滚风声）；未解锁时忽略，未知名称抛出 RangeError。 |
| `horn(on)` | 按住鸣笛：`true` 开始持续鸣响，`false` 松开衰减。 |
| `update` 额外字段 | `boost`（尾部推进器 0–1，叠加推进器轰鸣）、`accel`（归一化加速度 0–1，控制起步涌动声）。电机啸叫随车速 300 Hz→2.6 kHz。 |
| `setMuted(bool)` | 平滑静音或恢复原音量，立即尝试保存状态。 |
| `toggleMuted(): boolean` | 切换并返回新的静音状态。 |
| `setVolume(value)` | 主音量截断至 0…1；非法数字视为 0；不改变静音标志。 |
| `get muted(): boolean` | 读取静音状态。 |

解锁前的 cue/event 不排队，首次解锁始终启动 road。重复当前 cue 不重播；oldfriend 静音后重新进入从头开始（淡出过程中快速重入保留播放头，避免可听 seek），原生 ended 事件触发返回 space。快速切歌取消旧增益调度，从当时的音量连续接续。road/space 保持静音流式运行，避免反复重新加载；oldfriend 首次权限激活后暂停，选中再播放。

| 状态字段 | 范围/单位 |
| --- | --- |
| `mode` | drive / ascent / orbit / reentry；默认 drive |
| `speedKmh` | km/h，音色在 0…400 范围变化，输入上限保护 600 |
| `throttle`, `brake` | 0…1 |
| `jet` | 布尔值 |
| `lift` | 0…1，实际推进器功率 |
| `altitude` | 米；0…80,000 m 逐渐展开混响与高通 |
| `offroad` | 0…1，碎石强度 |
| `landing` | 0…1，落地冲击脉冲；触地帧传入，后续回到 0 |
| `plasma` | 0…1，等离子体强度 |

`update` 设置连续声音；`event` 触发瞬时声音，避免把事件放在每帧无条件调用。land 强度读取最近一次 update 的 landing；0 表示无冲击。landing 脉冲也会触发混响回干，但不会自动触发落地声音。

## 混音结构与调音

音乐：各曲低通/高架增强 → 曲目淡化 → 高通 → 干声与卷积混响并联 → 音乐总线 → 推进器压低 → 立体声声像 → 主增益 → 压缩器 → 输出。

音效：电机、道路、碎石、风、推进器、等离子体及一次性事件 → 独立音效总线 → 主增益 → 同一压缩器。

- 模块顶部 `MUSIC_LEVEL = 0.65` 和 `SFX_LEVEL = 0.72` 分别控制两条总线的基础平衡；API 保持规定的精简接口。
- 公路低通由 2.5 kHz 开至 20 kHz（250 km/h），200…250 km/h 逐渐增加高架存在感，最大 +2 dB。
- lift > 0.1 或 jet 时音乐压低 -6 dB；80 ms 攻击/600 ms 释放指约 95% 收敛时间，时间常数为该值的三分之一。
- 爬升高通最高 180 Hz，混响采用 4 秒指数衰减立体声噪声脉冲。轨道混响保持较高，音乐额外 -3 dB，声像 LFO 为 0.05 Hz。
- 再入时等离子体驱动带限低频与稀疏爆裂，音乐最多额外 -8 dB；与推进器压低可叠加。触地后约 3 秒将混响发送降低 95%，已有混响自然衰减。
- 电机两路轻微失谐锯齿/正弦及独立高频逆变器音，基频由 80 Hz 升至 900 Hz（400 km/h）。轨道中电机、路面、碎石、风静音，推进器仍可使用。
- 推进器强度取 `max(lift, jet ? max(throttle, 0.35) : 0)`，包含高通嘶声、低通低吼与连续随机颤动。无 jet 时油门只作用于电机。
- 噪声缓存循环复用；常驻振荡器只建一次；逐帧不创建音频节点。瞬时事件带柔和包络并在结束时断开局部节点。
- 动态参数统一用 `setTargetAtTime`；切歌用短目标段逼近等功率圆弧，快速打断时保持连续。压缩器提供软限幅保护，但不是采样级砖墙限幅器。

## 持久化与错误

`localStorage` 键为 `liftoff.audio.v1`，内容 `{ muted, volume }`。默认非静音、主音量 0.8；读写和 JSON 解析都捕获异常。静音不暂停时间线，再次开启会继续当前位置。

解锁失败会拒绝其 Promise；界面应显示可重试状态。cue 的播放失败返回 false 并输出中文控制台提示，继续保留原曲。媒体加载错误也输出提示。跨域地址必须允许 CORS；同源 `public/` 路径可直接使用。

## 浏览器边界

面向支持 Web Audio 与 MP3 的现代 Chrome、Safari 和 Firefox；保留 `webkitAudioContext` 与缺失 `cancelAndHoldAtTime` 时的连续增益回退。手机锁屏、切后台或系统音频中断可能暂停上下文，再次手势调用 unlock 恢复。

流式媒体从收到足够数据后即可开始，不等待整首 3…7 MB 文件下载；实际首声时间由网络和浏览器缓冲决定。road/space 使用原生 `loop`，模块自身不额外插入停顿，但任意 MP3 编码留白、素材首尾不连续和浏览器解码行为无法通过媒体元素 API 保证跨浏览器的采样级无缝。若素材存在接缝，需要先处理素材或改用完整解码方案；后者与本任务的流式约束不同。

参考：[媒体元素音源](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode)、[参数平滑](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)、[HTML 媒体循环规范](https://html.spec.whatwg.org/multipage/media.html)。

## 本次验证记录

已通过语法检查、9 项 Node 行为测试、现有 Vite 项目构建（产物输出临时目录），以及 Chromium 与本机缓存 Firefox 的真实 MP3 播放、非零音频输出、全部控制/事件、自动返回和存储测试。Chromium 另验证了桌面与手机布局。浏览器测试无控制台错误。构建保留现有 three.js 大包提示。

Safari/WebKit 未完成实测：当前 Playwright 所需版本未安装，旧缓存协议不兼容。未下载或安装任何依赖。自动化检查不能代替耳机听感、真实 iOS 自动播放策略和长时间循环接缝的人工验收。

## 竞速模式

`createAudio({ music: false })` 只创建合成音效，不要求音乐 URL、不创建媒体元素；默认模式保持原有三曲接口。竞速与太空模式共用 `liftoff.audio.v1`、主音量、静音和限幅器。

- `update(dt, { tireSlip })`：轮胎侧滑强度 0–1，与速度共同控制常驻摩擦层；原有 `speedKmh`、`throttle`、`boost` 控制电机及加速轰鸣。
- `event` 新增 `raceWall`（碰墙）、`raceBoost`（加速呼啸）、`raceBeep`（短哔）、`raceGo`（长哔）、`raceLap`（过线）、`raceFinish`（合成大调号角与欢呼）。
- `createRaceAudio`（`race.js`）读取会话事件和车辆状态，维护事件游标与倒数沿，连续贴墙每 0.2 秒最多播放一次冲击声。
- 页面选择地图或再次按键/点击时解锁音频；浏览器禁止自动播放时，等待玩家手势，不阻塞比赛。
