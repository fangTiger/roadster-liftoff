// NFT 底图候选：自动飞到轨道，隐藏界面，用不同机位截 2048×2048 方图
// 用法：先 npm run dev -- --port 8932，再 node scripts/nft/render-base.mjs <输出目录>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'recordings/nft'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('[页面错误]', e.message));
await p.goto('http://127.0.0.1:8932/?capture'); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 300000 });
// 隐藏所有界面层，只留 3D 画面
await p.addStyleTag({ content: 'body > *:not(canvas){display:none!important} canvas{display:block!important}' });
const step = (inp, n = 1) => p.evaluate(([inp, n]) => { for (let i = 0; i < n; i++) window.__frame(1 / 30, inp); }, [inp, n]);
const mode = () => p.evaluate(() => window.__st().mode);
// 最快打法冲到轨道
for (let i = 0; i < 30 * 60 && (await mode()) !== 'orbit'; i++) await step({ throttle: true, jet: i > 9 });
console.log('已入轨');
const shots = [['cine', 2], ['cine', 6], ['chase', 3], ['free', 3], ['low', 3], ['cine', 10]];
let k = 0;
for (const [cam, secs] of shots) {
  await p.evaluate(m => window.__cam(m), cam);
  await step({}, Math.round(secs * 30));
  const f = `${out}/orbit-${++k}-${cam}.jpg`;
  await p.screenshot({ path: f, type: 'jpeg', quality: 92 }); console.log(f);
}
await b.close();
