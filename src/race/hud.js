import { t } from '../i18n/i18n.js';
import { DT } from './sim/physics.js';
const formatDelta = value => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`;
// 竞速 HUD：左上圈数与计时、右上小地图（整条赛道、车的位置与朝向、下一道检查点）、本圈进度条、右下速度与推进剂、中部事件提示
const format = t => t === null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
const LAPS = 3;
const ITEM_ICONS={missile:'🚀',mine:'💧',nitro:'⚡',shield:'🛡️'};
const EVENT_TEXT = { lap: e => e.lap >= LAPS ? '' : e.lap === LAPS - 1 ? t('race.lastLap') : t('race.nextLap', { n: e.lap + 1 }), driftBoost: e => t('race.driftBoost', { tier: 'Ⅰ Ⅱ Ⅲ'.split(' ')[e.tier - 1] }), counterBoost: () => t('race.counterBoost'), draft: () => t('race.draft'), driftSwitch: () => t('race.driftSwitch'), boost: () => t('race.boost'), coin: () => '', wall: () => '', land: () => '' };
export function createHud(track, title = '', { roomMode = false, itemsMode = false } = {}) {
  // 房间模式补充表情键，道具赛再补充道具键
  const controls = () => t('race.controls') + (roomMode ? (itemsMode ? t('race.controlsItems') : '') + t('race.controlsRoom') : '');
  const style = document.createElement('style');
  style.textContent = `body{margin:0;overflow:hidden;background:#0b0f14}body> :not(canvas):not(#race-hud):not(#race-pick):not(#race-loading):not(#race-tools):not(.rm-root):not(#ach-toast):not(#ach-panel-wrap):not(#roadster-wallet):not(w3m-modal):not(:has([data-rk])):not(script):not(style){display:none!important}
#race-hud{position:fixed;inset:0;color:#f4eee1;font:16px 'Helvetica Neue','PingFang SC',sans-serif;pointer-events:none;z-index:10;font-variant-numeric:tabular-nums}
#race-hud .rh-panel{background:#101a20c4;border:1px solid #ffffff1f;border-radius:10px;backdrop-filter:blur(6px)}
#race-hud header{position:absolute;top:22px;left:24px;padding:14px 18px;min-width:210px}
#race-hud header small{letter-spacing:3px;color:#f8d28d;font-size:11px}
#race-hud .rh-lap{font-size:15px;color:#b9c4c9;margin-top:6px}#race-hud .rh-lap b{font-size:40px;color:#fff;font-weight:600;margin-right:4px}
#race-hud .rh-progress{height:6px;background:#ffffff22;border-radius:3px;margin:8px 0 10px;overflow:hidden}#race-hud .rh-progress i{display:block;height:100%;background:linear-gradient(90deg,#4bc8e5,#8ef0c8);width:0}
#race-hud .rh-timing{line-height:1.75;font-size:15px}#race-hud .rh-timing span{color:#9fb0b8;display:inline-block;min-width:42px;margin-right:8px}
#race-hud .rh-map{position:absolute;top:22px;right:24px;padding:10px}#race-hud canvas{display:block}
#race-hud .rh-speed{position:absolute;right:24px;bottom:60px;padding:16px 22px}#race-hud .rh-speed strong{font-size:50px;font-weight:500}
#race-hud meter{display:block;width:180px;height:10px;accent-color:#4bc8e5;margin-top:10px}#race-hud .rh-drift{margin-top:8px;font-size:13px;color:#ffd38a;min-height:18px}
#race-hud .rh-draft{margin-top:8px;font-size:13px;color:#8ef0ff}#race-hud .rh-draft meter{accent-color:#8ef0ff;margin-top:4px}#race-hud .rh-draft[data-flash=true]{filter:brightness(1.8);text-shadow:0 0 10px #8ef0ff}
#race-hud .rh-notice{position:absolute;top:22%;width:100%;text-align:center;font-size:36px;font-weight:600;text-shadow:0 2px 10px #000}
#race-hud .rh-flash{position:absolute;top:32%;width:100%;text-align:center;font-size:26px;color:#8ef0ff;text-shadow:0 2px 10px #000;transition:opacity .25s}
#race-hud .rh-delta{position:absolute;top:39%;width:100%;text-align:center;font-size:30px;font-weight:600;text-shadow:0 2px 10px #000}
#race-hud [data-tone=ahead]{color:#8ef0c8}#race-hud [data-tone=behind]{color:#ff7d83}
#race-hud footer{position:absolute;bottom:18px;left:24px;right:24px;font-size:13px;color:#eee5d0;text-shadow:0 1px 4px #000}
#race-hud .rh-result{position:absolute;top:5%;left:50%;transform:translateX(-50%);padding:26px 44px;line-height:1.9;font-size:20px;text-align:center;min-width:300px}#race-hud .rh-result h2{margin:0 0 6px;font-size:46px;letter-spacing:.2em;color:#ffd34d;text-shadow:0 0 24px #ffb30088}#race-hud .rh-result .best{font-size:30px;color:#fff;margin:6px 0}#race-hud .rh-result .laps{color:#c9d3d8;font-size:17px}
#race-hud .rh-item{position:absolute;top:22px;left:50%;transform:translateX(-50%);padding:10px 18px;text-align:center;min-width:112px;border-color:#4bc8e566;box-shadow:0 0 22px #4bc8e522}#race-hud .rh-item-icon{display:block;font-size:38px;height:48px}#race-hud .rh-item-label{font-size:13px;color:#b9c4c9}#race-hud .rh-item kbd{font:11px inherit;display:block;color:#8ef0ff;margin-top:5px}#race-hud .rh-item[data-rolling=true]{border-color:#f8d28d;box-shadow:0 0 24px #f8d28d44}#race-hud .rh-shield-time{display:block;min-height:14px;font-size:12px;color:#8ef0ff;margin-top:4px}
@media(max-width:700px){#race-hud header{left:10px;top:10px;min-width:150px}#race-hud .rh-map{right:10px;top:10px}#race-hud .rh-speed{right:10px;bottom:70px}#race-hud footer{font-size:11px}}`;
  style.textContent+=`#race-hud .rh-missile-warning{position:absolute;inset:0;border:6px solid #ff4055;box-shadow:inset 0 0 70px #ff204055;color:#ff5265;text-align:center;padding-top:135px;font-size:28px;font-weight:700;text-shadow:0 2px 10px #000;box-sizing:border-box}`;
  document.head.append(style);
  const root = document.createElement('div'); root.id = 'race-hud';
  root.innerHTML = `<header class="rh-panel"><small>MARS ROADSTER · ${typeof title === 'function' ? title() : title}</small><div class="rh-lap"><b>1</b>/ 3 ${t('race.laps')}</div><div class="rh-progress"><i></i></div><div class="rh-timing"></div></header>
<div class="rh-map rh-panel"><canvas></canvas></div><div class="rh-speed rh-panel"><strong>0</strong> km/h<meter min="0" max="1" value="1"></meter><div class="rh-drift"></div><div class="rh-draft" hidden><span></span><meter min="0" max="1" value="0"></meter></div></div>
${itemsMode?'<div class="rh-missile-warning" role="status" hidden></div><div class="rh-item rh-panel"><span class="rh-item-icon"></span><span class="rh-item-label"></span><kbd></kbd><span class="rh-shield-time"></span></div>':''}<div class="rh-delta" hidden></div><div class="rh-notice"></div><div class="rh-flash"></div><div class="rh-result rh-panel" hidden></div>
<footer>${controls()}</footer>`;
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
  let flashEvent = null, flashUntil = 0, draftUntil = 0, seen = 0;
  function update(s, { delta = null, deltaStep = 0, totalDelta = null, itemSlot = null, missileLocked = false } = {}) {
    const comparison = $('.rh-delta');
    comparison.hidden = delta === null || s.step >= deltaStep + Math.ceil(2 / DT);
    comparison.textContent = delta === null ? '' : formatDelta(delta);
    comparison.dataset.tone = delta < 0 ? 'ahead' : 'behind';
    const r = s.race, c = s.car;
    if(itemsMode){
      $('.rh-missile-warning').hidden=!missileLocked;$('.rh-missile-warning').textContent=t('race.item.warning');
      const rolling=!!itemSlot?.kind&&s.step*DT<itemSlot.readyAt,kind=rolling?Object.keys(ITEM_ICONS)[Math.floor(s.step*DT*12)%4]:itemSlot?.kind;
      $('.rh-item').dataset.rolling=String(rolling);$('.rh-item-icon').textContent=ITEM_ICONS[kind]||'?';
      $('.rh-item-label').textContent=t(rolling?'race.item.rolling':kind?'race.item.'+kind:'race.item.empty');
      $('.rh-item kbd').textContent=kind&&!rolling?t('race.item.use'):'';
      $('.rh-shield-time').textContent=c.shieldTime>0?`${t('race.item.shield')} ${c.shieldTime.toFixed(1)}s`:'';
    }
    $('header small').textContent = `MARS ROADSTER · ${typeof title === 'function' ? title() : title}`;
    $('footer').textContent = controls();
    $('.rh-lap').innerHTML = `<b>${r.lap}</b>/ 3 ${t('race.laps')}`;
    $('.rh-progress i').style.width = (r.frozen ? 0 : lapProgress(c) * 100).toFixed(1) + '%';
    $('.rh-timing').innerHTML = `<span>${t('race.current')}</span>${format(r.lapTime)}<br><span>${t('race.best')}</span>${format(r.bestLap)}<br><span>${t('race.checkpoint')}</span>${r.nextCheckpoint} / ${track.checkpointGates.length}${r.penalty ? `　${t('race.penalty', { n: r.penalty.toFixed(0) })}` : ''}`;
    $('strong').textContent = (Math.hypot(c.vx, c.vz) * 3.6).toFixed(0); $('meter').value = c.fuel;
    $('.rh-drift').textContent = c.drifting ? t('race.charge', { bars: '▮'.repeat(c.driftTier) + '▯'.repeat(3 - c.driftTier) }) : c.counterWindow > 0 ? t('race.counterHint') : t('race.fuel', { n: (c.fuel * 100).toFixed(0) });
    // 小地图
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(base, 0, 0);
    const gate = track.checkpointGates[r.nextCheckpoint]; if (gate && !r.finished) { const [gx, gz] = P(gate.x, gate.z); ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(gx, gz, 4.5 * dpr, 0, Math.PI * 2); ctx.fill(); }
    const [cx, cz] = P(c.x, c.z), a = -c.yaw;   // 地图 x 取反、z 朝上，车头 (sin yaw, cos yaw) 在画布上对应旋转 -yaw
    ctx.save(); ctx.translate(cx, cz); ctx.rotate(a); ctx.fillStyle = '#4bd2ff'; ctx.strokeStyle = '#002'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -8 * dpr); ctx.lineTo(5 * dpr, 6 * dpr); ctx.lineTo(-5 * dpr, 6 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // 事件提示
    for (; seen < s.events.length; seen++) { const e = s.events[seen], t = EVENT_TEXT[e.type]?.(e); if (e.type === 'draft') draftUntil = e.step + Math.ceil(.3 / DT); if (t) { flashEvent = e; flashUntil = s.step + 100; } }
    const draft = $('.rh-draft'), draftFlash = s.step < draftUntil;
    draft.hidden = !roomMode; draft.dataset.flash = String(draftFlash);
    if (roomMode) { $('.rh-draft span').textContent = t('race.draft'); $('.rh-draft meter').value = draftFlash ? 1 : Math.max(0, Math.min(1, c.draft ?? 0)); }
    $('.rh-flash').textContent = flashEvent ? EVENT_TEXT[flashEvent.type]?.(flashEvent) : ''; $('.rh-flash').style.opacity = s.step < flashUntil ? 1 : 0;
    const recent = s.events.slice(-8).findLast(e => e.type === 'reset' && s.step - e.step < 240);
    $('.rh-notice').textContent = r.frozen ? Math.ceil(r.countdown) : r.wrongWay ? t('race.wrongWay') : r.missed !== null ? t('race.missed', { n: r.missed }) : recent ? t('race.reset') : '';
    const result = $('.rh-result'); result.hidden = !r.finished || roomMode;
    if (roomMode && r.finished) $('.rh-notice').textContent = t('room.finished');
    if (r.finished && !roomMode) result.innerHTML = `<h2>${t('race.finish')}</h2><div class="best">${t('race.bestLap')} ${format(r.bestLap)}</div><div class="laps">${r.lapTimes.map((time, i) => `${t('race.nextLap', { n: i + 1 })}　${format(time)}${time === r.bestLap ? '　★' : ''}`).join('<br>')}</div>${totalDelta === null ? '' : `<div data-tone="${totalDelta < 0 ? 'ahead' : 'behind'}">${t('race.ghost.totalDelta')} ${formatDelta(totalDelta)}</div>`}<small style="font-size:14px;color:#aab7bd">${t('race.retry')}</small>`;
  }
  return { update, destroy() { root.remove(); style.remove(); } };
}
