// 界面：速度表、0–100 计时、里程、速度线、成就提示
import { KMH } from './vehicle.js';

const $ = id => document.getElementById(id);
const ARC = 198;                           // 速度表弧长（与 SVG 的 dasharray 对应）

export function createHUD() {
  const arc = document.querySelector('#gauge circle:nth-of-type(2)');
  let toastTimer = 0, shownClub = false;
  function toast(title, sub, ms = 3200) {
    $('tt').textContent = title; $('ts').textContent = sub;
    const el = $('toast'); el.style.opacity = 1; el.style.transform = 'translateY(0)';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.opacity = 0; el.style.transform = 'translateY(-8px)'; }, ms);
  }
  $('toast').style.transition = 'opacity .4s, transform .4s';
  $('toast').style.opacity = 0;
  document.querySelectorAll('#cams span').forEach(s => s.classList.toggle('on', s.dataset.v === 'road'));
  $('camname').textContent = '追随';

  function update(s) {
    const kmh = s.v * KMH;
    $('spd').textContent = Math.round(kmh);
    arc.setAttribute('stroke-dasharray', `${(Math.min(kmh, 400) / 400 * ARC).toFixed(1)} 264`);
    $('dist').textContent = (s.dist / 1000).toFixed(1) + ' km';
    const L = s.launch;
    $('lv').innerHTML = (L.timing ? L.t : (L.last ?? 0)).toFixed(2) + '<i>s</i>';
    $('launch').style.opacity = L.timing || L.last != null ? 1 : .55;
    $('speed').style.opacity = Math.max(0, Math.min(1, (kmh - 90) / 220));
    if (L.last != null && L.last < .9 && !shownClub) { shownClub = true; toast('0.8 秒俱乐部', `0–100 km/h 用时 ${L.last.toFixed(2)} 秒`); }
  }
  return { update, toast };
}
