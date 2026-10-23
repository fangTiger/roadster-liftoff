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
  for (const [a, z, k] of plan) if (t >= a && t < z) inp[k] = true;
  await p.evaluate(([inp]) => window.__frame(1 / 30, inp), [inp]);
  await p.screenshot({ path: `${out}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  if (i % 60 === 0) console.log(`帧 ${i}/${secs * FPS}，已用 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
}
await b.close();
