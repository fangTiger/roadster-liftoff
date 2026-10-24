// 调试探针：逐帧推进游戏并打印状态，可在指定时刻截图
// 用法：PLAN='[[开始,结束,"按键"],...]' SHOTS='[秒,...]' node scripts/probe.mjs <输出目录> <时长秒> [打印间隔秒]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2], secs = +process.argv[3], every = +(process.argv[4] || .5);
const url = process.env.URL || 'http://127.0.0.1:8932/?capture';
const plan = JSON.parse(process.env.PLAN || '[]'), shots = JSON.parse(process.env.SHOTS || '[]');
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('[页面错误]', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('[控制台]', m.text()); });
await p.goto(url); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 300000 });
const FPS = 30;
for (let i = 0; i < secs * FPS; i++) {
  const t = i / FPS, inp = {};
  for (const [a, z, k] of plan) if (t >= a && t < z && !k.startsWith('cam:')) inp[k] = true;
  for (const [a0, , k] of plan) if (k.startsWith('cam:') && Math.abs(t - a0) < .5 / FPS) await p.evaluate(m => window.__cam(m), k.slice(4));
  await p.evaluate(([inp]) => window.__frame(1 / 30, inp), [inp]);
  if (i % Math.round(every * FPS) === 0) console.log(t.toFixed(2), JSON.stringify(inp), JSON.stringify(await p.evaluate(() => window.__st())));
  if (shots.some(s => Math.abs(s - t) < .5 / FPS)) await p.screenshot({ path: `${out}/t${t.toFixed(1)}.jpg`, type: 'jpeg', quality: 88 });
}
await b.close();
