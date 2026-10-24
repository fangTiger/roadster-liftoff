// 生成 LOGO：用游戏真车模型俯视渲染，合成深色背景、光轨与白色喷焰
// 用法：先 npm run dev（端口 8932），再 node scripts/logo/make-logo.mjs public/logo-1024.png 'tilt=.3&zoom=.76&shift=1.1'
import { chromium } from 'playwright'; import fs from 'node:fs';
const [out, query = ''] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 600, height: 600 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8932/scripts/logo/render.html?' + query); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
const url = await p.evaluate(async () => {
  const { png, rear, nose } = window.__render, S = 1024;
  const img = new Image(); img.src = png; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const R = 230; g.beginPath(); g.roundRect(0, 0, S, S, R); g.clip();
  // 背景：近黑的石墨底，左上略亮
  let bg = g.createRadialGradient(S * .4, S * .38, 0, S * .45, S * .45, S * .85);
  bg.addColorStop(0, '#1e2530'); bg.addColorStop(.55, '#0b0e13'); bg.addColorStop(1, '#030405');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  // 行进方向（车头→车尾的反方向即喷焰方向）
  const mx = (rear[0][0] + rear[1][0]) / 2, my = (rear[0][1] + rear[1][1]) / 2;
  let dx = mx - nose[0], dy = my - nose[1]; const L = Math.hypot(dx, dy); dx /= L; dy /= L; const nx = -dy, ny = dx;
  g.globalCompositeOperation = 'lighter';
  // 光轨：车身两侧拖出的细长白线
  const streaks = [[-1.15, .55, 2.2, .35], [-.8, .9, 1.4, .22], [.8, .85, 1.4, .22], [1.15, .5, 2.2, .35], [-1.5, .35, 1, .14], [1.5, .3, 1, .14], [0, 1.15, 1.2, .18]];
  for (const [off, len, w, a] of streaks) {
    const sx = (nose[0] + mx) / 2 + nx * off * 120 + dx * 40, sy = (nose[1] + my) / 2 + ny * off * 120 + dy * 40;
    const ex = sx + dx * len * 700, ey = sy + dy * len * 700;
    const gr = g.createLinearGradient(sx, sy, ex, ey); gr.addColorStop(0, `rgba(235,242,255,${a})`); gr.addColorStop(1, 'rgba(235,242,255,0)');
    g.strokeStyle = gr; g.lineWidth = w * 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  }
  // 白色喷焰：外层冷白光晕 + 内层纯白焰芯，从喷口沿行进反方向拉长、收尖
  const flame = (x, y, len, w, col, blur) => {
    g.save(); g.shadowColor = 'rgba(205,225,255,.95)'; g.shadowBlur = blur;
    const ex = x + dx * len, ey = y + dy * len;
    const gr = g.createLinearGradient(x, y, ex, ey); gr.addColorStop(0, col); gr.addColorStop(.35, col.replace(/[\d.]+\)$/, '.75)')); gr.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x + nx * w, y + ny * w);
    g.quadraticCurveTo(x + dx * len * .35 + nx * w * 1.1, y + dy * len * .35 + ny * w * 1.1, ex, ey);
    g.quadraticCurveTo(x + dx * len * .35 - nx * w * 1.1, y + dy * len * .35 - ny * w * 1.1, x - nx * w, y - ny * w);
    g.closePath(); g.fill(); g.restore();
  };
  for (const [x, y] of rear) { flame(x, y, 520, 30, 'rgba(190,215,255,.55)', 60); flame(x, y, 400, 15, 'rgba(255,255,255,1)', 30); flame(x, y, 220, 7, 'rgba(255,255,255,1)', 10); }
  g.globalCompositeOperation = 'source-over';
  // 车：先压一层柔和投影，再画真车渲染
  g.save(); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 50; g.shadowOffsetX = dx * 18; g.shadowOffsetY = dy * 18; g.drawImage(img, 0, 0); g.restore();
  // 暗角
  const vg = g.createRadialGradient(S / 2, S / 2, S * .45, S / 2, S / 2, S * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = vg; g.fillRect(0, 0, S, S);
  return c.toDataURL('image/png');
});
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await b.close();
