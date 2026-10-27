// 竞速 HUD：左上圈数与计时、右上小地图（整条赛道、车的位置与朝向、下一道检查点）、本圈进度条、右下速度与推进剂、中部事件提示
const format = t => t === null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
const EVENT_TEXT = { driftBoost: e => `漂移加速 ${'Ⅰ Ⅱ Ⅲ'.split(' ')[e.tier - 1]}`, counterBoost: () => '二次加速！', driftSwitch: () => '连续漂移', boost: () => '加速带', coin: () => '', wall: () => '', land: () => '' };
export function createHud(track) {
  const style = document.createElement('style');
  style.textContent = `body{margin:0;overflow:hidden;background:#0b0f14}body> :not(canvas):not(#race-hud):not(#race-pick):not(#race-loading):not(script):not(style){display:none!important}
#race-hud{position:fixed;inset:0;color:#f4eee1;font:16px 'Helvetica Neue','PingFang SC',sans-serif;pointer-events:none;z-index:10;font-variant-numeric:tabular-nums}
#race-hud .rh-panel{background:#101a20c4;border:1px solid #ffffff1f;border-radius:10px;backdrop-filter:blur(6px)}
#race-hud header{position:absolute;top:22px;left:24px;padding:14px 18px;min-width:210px}
#race-hud header small{letter-spacing:3px;color:#f8d28d;font-size:11px}
#race-hud .rh-lap{font-size:15px;color:#b9c4c9;margin-top:6px}#race-hud .rh-lap b{font-size:40px;color:#fff;font-weight:600;margin-right:4px}
#race-hud .rh-progress{height:6px;background:#ffffff22;border-radius:3px;margin:8px 0 10px;overflow:hidden}#race-hud .rh-progress i{display:block;height:100%;background:linear-gradient(90deg,#4bc8e5,#8ef0c8);width:0}
#race-hud .rh-timing{line-height:1.75;font-size:15px}#race-hud .rh-timing span{color:#9fb0b8;display:inline-block;width:42px}
#race-hud .rh-map{position:absolute;top:22px;right:24px;padding:10px}#race-hud canvas{display:block}
#race-hud .rh-speed{position:absolute;right:24px;bottom:60px;padding:16px 22px}#race-hud .rh-speed strong{font-size:50px;font-weight:500}
#race-hud meter{display:block;width:180px;height:10px;accent-color:#4bc8e5;margin-top:10px}#race-hud .rh-drift{margin-top:8px;font-size:13px;color:#ffd38a;min-height:18px}
#race-hud .rh-notice{position:absolute;top:22%;width:100%;text-align:center;font-size:36px;font-weight:600;text-shadow:0 2px 10px #000}
#race-hud .rh-flash{position:absolute;top:32%;width:100%;text-align:center;font-size:26px;color:#8ef0ff;text-shadow:0 2px 10px #000;transition:opacity .25s}
#race-hud footer{position:absolute;bottom:18px;left:24px;right:24px;font-size:13px;color:#eee5d0;text-shadow:0 1px 4px #000}
#race-hud .rh-result{position:absolute;top:24%;left:50%;transform:translateX(-50%);padding:28px 42px;line-height:2;font-size:22px}
@media(max-width:700px){#race-hud header{left:10px;top:10px;min-width:150px}#race-hud .rh-map{right:10px;top:10px}#race-hud .rh-speed{right:10px;bottom:70px}#race-hud footer{font-size:11px}}`;
  document.head.append(style);
  const root = document.createElement('div'); root.id = 'race-hud';
  root.innerHTML = `<header class="rh-panel"><small>MARS ROADSTER · ${track.name?.zh ?? '阿尔卑斯环线'}</small><div class="rh-lap"><b>1</b>/ 3 圈</div><div class="rh-progress"><i></i></div><div class="rh-timing"></div></header>
<div class="rh-map rh-panel"><canvas></canvas></div><div class="rh-speed rh-panel"><strong>0</strong> km/h<meter min="0" max="1" value="1"></meter><div class="rh-drift"></div></div>
<div class="rh-notice"></div><div class="rh-flash"></div><div class="rh-result rh-panel" hidden></div>
<footer>W / ↑ 油门　S / ↓ 刹车 · 倒车　A D 转向　空格 推进器　Shift 漂移（按住反打可连续漂移，结束时松开再按油门二次加速）　T 重置　C 镜头</footer>`;
  document.body.append(root);
  const $ = q => root.querySelector(q);
  // 小地图：北在上；x 取反，使「从车后看的右侧」在地图右侧
  const SIZE = innerWidth < 700 ? 130 : 200, canvas = $('canvas'), ctx = canvas.getContext('2d'), dpr = Math.min(2, devicePixelRatio);
  canvas.width = canvas.height = SIZE * dpr; canvas.style.width = canvas.style.height = SIZE + 'px';
  const paths = [{ samples: track.samples, main: true }, ...track.branches.map(b => ({ samples: b.samples }))];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of paths) for (let i = 0; i < p.samples.length; i += 7) { minX = Math.min(minX, -p.samples[i]); maxX = Math.max(maxX, -p.samples[i]); minZ = Math.min(minZ, p.samples[i + 1]); maxZ = Math.max(maxZ, p.samples[i + 1]); }
  const pad = 10, k = (SIZE - pad * 2) / Math.max(maxX - minX, maxZ - minZ), ox = pad + ((SIZE - pad * 2) - (maxX - minX) * k) / 2, oz = pad + ((SIZE - pad * 2) - (maxZ - minZ) * k) / 2;
  const P = (x, z) => [(ox + (-x - minX) * k) * dpr, (oz + (maxZ - z) * k) * dpr];
  const base = document.createElement('canvas'); base.width = base.height = SIZE * dpr; {
    const g = base.getContext('2d'); g.lineCap = g.lineJoin = 'round';
    for (const [w, color] of [[6, '#0008'], [3.2, '#e8e2d4']]) for (const p of paths) {
      g.beginPath(); for (let i = 0; i < p.samples.length; i += 7 * 6) g.lineTo(...P(p.samples[i], p.samples[i + 1]));
      if (p.main) g.closePath(); g.lineWidth = (p.main ? w : w * .6) * dpr; g.strokeStyle = p.main ? color : '#c9b98f'; g.stroke();
    }
    const s = track.checkpointGates.at(-1); g.fillStyle = '#fff'; const [fx, fz] = P(s.x, s.z); g.fillRect(fx - 4 * dpr, fz - 1.5 * dpr, 8 * dpr, 3 * dpr);
  }
  const lapProgress = c => { const n = c.near; if (!n) return 0; if (n.path === 'main') return n.s / track.length; const b = track.branches.find(b => b.id === n.path); return (b.from + (b.to - b.from) * n.s / b.length) / track.length; };
  let flashText = '', flashUntil = 0, seen = 0;
  function update(s) {
    const r = s.race, c = s.car;
    $('.rh-lap').innerHTML = `<b>${r.lap}</b>/ 3 圈`;
    $('.rh-progress i').style.width = (r.frozen ? 0 : lapProgress(c) * 100).toFixed(1) + '%';
    $('.rh-timing').innerHTML = `<span>本圈</span>${format(r.lapTime)}<br><span>最快</span>${format(r.bestLap)}<br><span>检查</span>${r.nextCheckpoint} / ${track.checkpointGates.length}${r.penalty ? `　罚时 +${r.penalty.toFixed(0)} s` : ''}`;
    $('strong').textContent = (Math.hypot(c.vx, c.vz) * 3.6).toFixed(0); $('meter').value = c.fuel;
    $('.rh-drift').textContent = c.drifting ? `漂移中 · 蓄力 ${'▮'.repeat(c.driftTier)}${'▯'.repeat(3 - c.driftTier)}` : c.counterWindow > 0 ? '松开再按油门 → 二次加速' : `推进剂 ${(c.fuel * 100).toFixed(0)}%`;
    // 小地图
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(base, 0, 0);
    const gate = track.checkpointGates[r.nextCheckpoint]; if (gate && !r.finished) { const [gx, gz] = P(gate.x, gate.z); ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(gx, gz, 4.5 * dpr, 0, Math.PI * 2); ctx.fill(); }
    const [cx, cz] = P(c.x, c.z), a = -c.yaw;   // 地图 x 取反、z 朝上，车头 (sin yaw, cos yaw) 在画布上对应旋转 -yaw
    ctx.save(); ctx.translate(cx, cz); ctx.rotate(a); ctx.fillStyle = '#4bd2ff'; ctx.strokeStyle = '#002'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -8 * dpr); ctx.lineTo(5 * dpr, 6 * dpr); ctx.lineTo(-5 * dpr, 6 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // 事件提示
    for (; seen < s.events.length; seen++) { const e = s.events[seen], t = EVENT_TEXT[e.type]?.(e); if (t) { flashText = t; flashUntil = s.step + 100; } }
    $('.rh-flash').textContent = flashText; $('.rh-flash').style.opacity = s.step < flashUntil ? 1 : 0;
    const recent = s.events.slice(-8).findLast(e => e.type === 'reset' && s.step - e.step < 240);
    $('.rh-notice').textContent = r.frozen ? Math.ceil(r.countdown) : r.wrongWay ? '方向错误' : r.missed !== null ? `漏检：检查点 ${r.missed}` : recent ? '重置 · 罚时 +3 秒' : '';
    const result = $('.rh-result'); result.hidden = !r.finished;
    if (r.finished) result.innerHTML = `比赛完成<br>${r.lapTimes.map((t, i) => `第 ${i + 1} 圈　${format(t)}`).join('<br>')}<br>最快单圈　${format(r.bestLap)}`;
  }
  return { update };
}
