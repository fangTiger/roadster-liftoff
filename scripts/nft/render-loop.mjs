// NFT 循环动画：飞到轨道，主推进器点火巡航，中途做一次 360° 翻滚（姿态喷口喷气），逐帧截图后合成无缝循环视频
// 用法：先 npm run dev -- --port 8932，再 node scripts/nft/render-loop.mjs <输出目录> [probe]
//   probe：只截几张关键帧看构图；完整录制需要 ffmpeg（环境变量 FFMPEG 指定路径，默认用 PATH 里的 ffmpeg）
// 产物：<输出目录>/loop.mp4（8 秒循环）、<输出目录>/poster.jpg（静态图底图）
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';
const out = process.argv[2] || 'recordings/nft-loop'; fs.mkdirSync(`${out}/raw`, { recursive: true });
const PROBE = process.argv[3] === 'probe';
const FPS = 30, LOOP = 8, FADE = 1;                 // 循环 8 秒，末尾多录 1 秒用来和开头交叉淡化
const ROLL_AT = 2.5;                                 // 第 2.5 秒开始翻滚（约 1.15 秒，避开首尾淡化区）
const POSTER_AT = 1.2;                               // 静态图取这一帧
const SIZE = Number(process.env.SIZE || 1080);
// 机位：车的左后上方，太阳从左前方照亮车身，四道喷焰朝向镜头右侧，地球在画面下方
const CAM = { pos: [-4.5, 2.2, 7], look: [0.4, -1.3, -1.5], sway: .12, bob: .25 };
const EARTH_TURN = .02;                              // 整段录制期间地球转过的角度（弧度），淡化区的错位小到看不出

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.log('[页面错误]', e.message));
await p.goto((process.env.BASE || 'http://localhost:8932') + '/?capture'); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 300000 });
await p.addStyleTag({ content: 'body > *:not(canvas){display:none!important} canvas{display:block!important}' });
const step = (inp, n = 1) => p.evaluate(([inp, n]) => { for (let i = 0; i < n; i++) window.__frame(1 / 30, inp); }, [inp, n]);
for (let i = 0; i < 30 * 60 && (await p.evaluate(() => window.__st().mode)) !== 'orbit'; i++) await step({ throttle: true, jet: i > 9 });
// 老前辈不出场
await p.evaluate(() => { window.__flight.state.meetCooldown = 1e9; window.__flight.state.meet = null; window.__space.oldFriend.visible = false; });
console.log('已入轨');
await step({ throttle: true }, 30 * 4);             // 推进器和车身姿态稳定下来
await p.evaluate(() => { window.__earthQ0 = window.__space.earth.quaternion.clone(); });
const total = (LOOP + FADE) * FPS;
const keys = PROBE ? new Set([0, ROLL_AT * FPS + 10, ROLL_AT * FPS + 18, ROLL_AT * FPS + 26, total - 1]) : null;
for (let f = 0; f < total; f++) {
  await step({ throttle: true, roll: f === ROLL_AT * FPS });
  if (keys && !keys.has(f)) continue;
  // 覆盖游戏自己的镜头和地球转动后重新渲染：镜头按 8 秒周期摆动，首尾自然衔接
  await p.evaluate(([f, CAM, EARTH_TURN, FPS, LOOP, total]) => {
    const T = window.__THREE, e = window.__space.earth, c = window.__camera, w = 2 * Math.PI * f / (FPS * LOOP);
    e.quaternion.copy(window.__earthQ0); e.rotateOnWorldAxis(new T.Vector3(1, 0, 0), EARTH_TURN * f / total);
    const [x, y, z] = CAM.pos, r = Math.hypot(x, z), a = Math.atan2(x, z) + CAM.sway * Math.sin(w);
    c.position.set(Math.sin(a) * r, y + CAM.bob * Math.sin(2 * w), Math.cos(a) * r); c.lookAt(...CAM.look);
    window.__render();
  }, [f, CAM, EARTH_TURN, FPS, LOOP, total]);
  await p.screenshot({ path: `${out}/raw/f${String(f).padStart(4, '0')}.png` });
  if (f % 30 === 0) console.log('帧', f, '/', total);
}
await b.close();
if (PROBE) process.exit(0);

// 交叉淡化：输出第 i 帧（i < 淡化帧数）= 录制第 LOOP*FPS+i 帧与第 i 帧按 i/淡化帧数 混合，最后一帧自然接回第一帧
const N = LOOP * FPS, F = FADE * FPS, raw = i => `${out}/raw/f${String(i).padStart(4, '0')}.png`;
fs.mkdirSync(`${out}/loop`, { recursive: true });
for (let i = 0; i < N; i++) {
  const dst = `${out}/loop/f${String(i).padStart(4, '0')}.png`;
  if (i >= F) { fs.copyFileSync(raw(i), dst); continue; }
  const [a, bb] = await Promise.all([raw(N + i), raw(i)].map(f => sharp(f).raw().toBuffer({ resolveWithObject: true })));
  const k = i / F, px = Buffer.alloc(a.data.length);
  for (let j = 0; j < px.length; j++) px[j] = Math.round(a.data[j] * (1 - k) + bb.data[j] * k);
  await sharp(px, { raw: a.info }).png().toFile(dst);
}
const ff = process.env.FFMPEG || 'ffmpeg';
execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${out}/loop/f%04d.png`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/loop.mp4`], { stdio: 'inherit' });
await sharp(`${out}/loop/f${String(Math.round(POSTER_AT * FPS)).padStart(4, '0')}.png`).jpeg({ quality: 90, mozjpeg: true }).toFile(`${out}/poster.jpg`);
console.log('完成', `${out}/loop.mp4`, `${out}/poster.jpg`);
