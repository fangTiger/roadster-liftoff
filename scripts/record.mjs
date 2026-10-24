// 录制演示：无头浏览器逐帧推进游戏（固定 30fps），按时间轴模拟按键，截图后由 scripts/encode.py 合成视频
// 用法：node scripts/record.mjs <输出目录> [url] [时长秒]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'recordings/frames', url = process.argv[3] || 'http://127.0.0.1:8932/?capture', secs = +(process.argv[4] || 18);
fs.mkdirSync(out, { recursive: true });
const FPS = 30, W = 1280, H = 720;
// 时间轴：[开始秒, 结束秒, 按键]
const PLANS = {
  drive: [[1, 12.5, 'throttle'], [6.5, 7.4, 'left'], [7.9, 9.0, 'right'], [10.2, 11.4, 'right'], [11.9, 12.8, 'left'], [13.5, 16.5, 'brake']],
  // 起步后短跳两次，再长按推进器升到二十多米，滑翔落地
  hop: [[1, 17, 'throttle'], [4.5, 4.9, 'jet'], [7.6, 8.3, 'jet'], [10.5, 12.0, 'jet'], [12.4, 13.2, 'left']],
  // 冲上太空：起步后长按空格升到悬停高度再继续按住 → 冲出大气层 → 轨道巡航与老前辈相遇 → 按 S 再入返回
  space: [[1, 9, 'throttle'], [4, 8.5, 'jet'], [41, 41.5, 'brake'], [50, 56, 'throttle']],
  // 玩家操控的爬升：起步 → 悬停后一直按住空格 → 中途 W 加力 → 卡门线入轨 → 轨道上遇见老前辈 → 按 S 再入
  // 五个机位轮流展示
  cams: [[0, 0, 'cam:low'], [1, 20, 'throttle'], [5, 0, 'cam:cine'], [17, 0, 'cam:cockpit'], [22, 0, 'cam:free'], [22, 23, 'jet'], [26, 34, 'jet'], [30, 0, 'cam:cockpit']],
  climb: [[1, 7, 'throttle'], [4, 33, 'jet'], [17, 23, 'throttle'], [52, 52.5, 'brake'], [61, 66, 'throttle']],
  // 第二版演示：起跳 → 空中翻滚 → 自动缓降、悬架落地 → 刹车灯 → 驾驶舱看方向盘 → 冲上太空（途中翻滚）→ 轨道翻滚 → 再入返航
  // 弯道 + 金币 + 驾驶舱看方向盘自动打 + 跳起翻滚 → 冲上太空 → 与老前辈同框 → 再入缓降落回公路
  v3: [[1, 30, 'throttle'], [10, 0, 'cam:cockpit'], [14, 0, 'cam:low'], [17.5, 0, 'cam:chase'], [21, 22, 'jet'], [22.2, 22.3, 'roll'], [31, 58, 'jet'], [76, 76.3, 'brake'], [101, 108, 'throttle']],
  v2: [[1, 9, 'throttle'], [5.5, 7.2, 'jet'], [7.6, 7.7, 'roll'], [9.6, 10.6, 'brake'], [11, 0, 'cam:cockpit'], [11, 16.5, 'throttle'], [12.4, 13.4, 'left'], [14, 15, 'right'],
    [16.5, 0, 'cam:chase'], [17, 47, 'jet'], [24, 30, 'throttle'], [21.5, 21.6, 'roll'], [57, 57.1, 'roll'], [66, 66.5, 'brake'], [76, 82, 'throttle']],
};
const plan = PLANS[process.env.PLAN || 'drive'];
// 默认用本机 Chrome 的新版无头模式走 GPU（Metal）；SOFT=1 时退回 SwiftShader 软件渲染（很慢）
const b = process.env.SOFT === '1'
  ? await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', e => console.log('[页面错误]', e.message));
await p.goto(url); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 300000 });
const t0 = Date.now();
for (let i = 0; i < secs * FPS; i++) {
  const t = i / FPS, inp = {};
  for (const [a, z, k] of plan) if (t >= a && t < z && !k.startsWith('cam:')) inp[k] = true;
  // 时间轴里的 'cam:xxx' 条目在开始那一刻切换机位
  for (const [a0, , k] of plan) if (k.startsWith('cam:') && Math.abs(t - a0) < .5 / FPS) await p.evaluate(m => window.__cam(m), k.slice(4));
  await p.evaluate(([inp]) => window.__frame(1 / 30, inp), [inp]);
  await p.screenshot({ path: `${out}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  if (i % 60 === 0) console.log(`帧 ${i}/${secs * FPS}，已用 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
}
await b.close();
