// 竞速模式入口：加载天空与车 → 选地图（简单 / 普通 / 困难，默认简单）→ 生成赛道与场景 → 倒数发车
// ?race&capture 时不自动跑循环，由录制脚本逐帧推进；&map=easy|normal|hard 指定地图（默认简单）
import { createEngine } from '../game/engine.js';
import { createCar } from '../game/car.js';
import { createRecorder } from './sim/replay.js';
import { buildTrack, trackHash } from './track/build.js';
import { TRACKS, DEFAULT_DIFFICULTY } from './track/data/index.js';
import { createSession } from './sim/session.js';
import { DT } from './sim/physics.js';
import { autopilot } from './sim/autopilot.js';
import * as B from './sim/input-bits.js';
import { createGreybox } from './scene/greybox.js';
import { createAlpine } from './scene/alpine.js';
import { createRaceCamera } from './camera.js';
import { createHud } from './hud.js';
import { createSky, SKIES, DEFAULT_SKY } from './scene/sky.js';
import { createSkidmarks } from './scene/skidmarks.js';
import { createBoostFx } from './scene/boostfx.js';
import { createStartGate } from './scene/startgate.js';
import { createCelebration } from './scene/celebration.js';
const params = new URLSearchParams(location.search), capture = params.has('capture');
// 加载画面：素材加载、着色器预编译完成之前盖住页面
const loading = document.createElement('div'); loading.id = 'race-loading'; loading.textContent = '加载赛道…';
Object.assign(loading.style, { position: 'fixed', inset: '0', zIndex: '50', display: 'grid', placeItems: 'center', background: '#0b0f14', color: '#cfd8e3', font: '500 15px/1 system-ui,sans-serif', letterSpacing: '.2em', transition: 'opacity .6s' });
document.body.append(loading);
// 竞速模式不用第一版的界面：一开始就藏起来（HUD 要等选完地图才创建）
const hideOld = document.createElement('style'); hideOld.textContent = 'body> :not(canvas):not(#race-hud):not(#race-pick):not(#race-loading):not(script):not(style){display:none!important}'; document.head.append(hideOld);
const engine = createEngine(capture ? { pixelRatio: 1 } : {});
engine.camera.far = 1800; engine.camera.updateProjectionMatrix();
// 背景：URL 参数 sky= 优先，其次上次的选择，默认阿尔卑斯山谷
const storedSky = (() => { try { return localStorage.getItem('race.sky'); } catch { return null; } })();
const skyKey = SKIES[params.get('sky')] ? params.get('sky') : SKIES[storedSky] ? storedSky : DEFAULT_SKY;
const sky = await createSky(engine.scene, engine.renderer, skyKey), skid = createSkidmarks(engine.scene), car = await createCar(); engine.scene.add(car.root);
const boostFx = createBoostFx(engine.scene, car), camera = createRaceCamera(engine.camera, engine.renderer.domElement), celebration = createCelebration(engine.scene);
const hideLoading = () => { loading.style.opacity = '0'; setTimeout(() => loading.remove(), 700); };

// 选定地图后才生成赛道、场景、HUD 与会话
let track, def, hash, scene, gate, hud, session, recorder, previous, current, seenEvents = 0, lastBits = 0, wheelAngle = 0, celebrated = false;
async function setup(difficulty) {
  const entry = TRACKS.find(t => t.difficulty === difficulty) || TRACKS[0];
  def = entry.def; track = buildTrack(def); hash = trackHash(def);
  scene = params.has('greybox') ? createGreybox(engine.scene, track, { tint: sky.tint }) : await createAlpine(engine.scene, track, { tint: sky.tint, renderer: engine.renderer }); gate = createStartGate(engine.scene, track, def.name.zh); hud = createHud(track, `${def.name.zh} · ${entry.label}`);
  session = createSession(track, { laps: def.laps }); recorder = createRecorder(); previous = current = session.snapshot;
  render(); await engine.renderer.compileAsync(engine.scene, engine.camera); render();
}
const keys = new Set(), map = { KeyW: B.THROTTLE, ArrowUp: B.THROTTLE, KeyS: B.BRAKE, ArrowDown: B.BRAKE, KeyA: B.LEFT, ArrowLeft: B.LEFT, KeyD: B.RIGHT, ArrowRight: B.RIGHT, Space: B.JET, ShiftLeft: B.DRIFT, ShiftRight: B.DRIFT, Backspace: B.RESET, KeyT: B.RESET };
addEventListener('keydown', e => { if (map[e.code]) { e.preventDefault(); keys.add(e.code); } if (e.code === 'KeyC' && !e.repeat) camera.setMode(); if (e.code === 'Enter' && current?.race.finished) location.reload(); });
addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
function simulate(bits) { previous = current; lastBits = bits; if (!current.race.finished) recorder.record(bits); session.step(bits); current = session.snapshot; wheelAngle += Math.hypot(current.car.vx, current.car.vz) * DT / .34; }
function render(alpha = 1, dt = 1 / 60) {
  const a = previous.car, b = current.car, blend = (x, y) => x + (y - x) * alpha;
  const c = { ...b, x: blend(a.x, b.x), y: blend(a.y, b.y), z: blend(a.z, b.z) };
  let delta = b.yaw - a.yaw; delta -= Math.PI * 2 * Math.floor((delta + Math.PI) / (Math.PI * 2)); const yaw = a.yaw + delta * alpha;
  car.root.position.set(c.x, c.y, c.z); car.root.rotation.y = yaw + Math.PI; car.chassis.rotation.x = c.pitch; car.chassis.rotation.z = -c.steer * Math.min(.06, Math.hypot(c.vx, c.vz) * .001);
  car.setRoll(0); car.setThrust((lastBits & B.THROTTLE) || c.boostTime > 0 ? 1 : 0, current.step * DT); car.setLift(lastBits & B.JET && c.fuel > 0 ? 1 : 0, current.step * DT);
  const rcs = c.drifting ? .65 : 0; car.setRCS(c.steer < 0 ? rcs : 0, c.steer > 0 ? rcs : 0, c.steer > 0 ? rcs : 0, c.steer < 0 ? rcs : 0, current.step * DT);   // 左转时前右、后左喷气
  car.setBrake(lastBits & B.BRAKE ? 1 : 0); car.setSteer(c.steer); for (const wheel of car.wheels) { wheel.spin.rotation.x = -wheelAngle; if (wheel.front) wheel.steer.rotation.y = c.steer * .35; }
  // 压上加速带、二次加速：冲击波环 + 视野猛张；处在加速状态时喷金色火焰
  for (; seenEvents < current.events.length; seenEvents++) { const t = current.events[seenEvents].type; if (t === 'counterBoost' || t === 'boost') { boostFx.trigger(c); camera.kick(); } }
  boostFx.update(dt, current.step * DT, c.boostTime > 0);
  // 冲线：彩带、烟花、镜头环拍
  if (current.race.finished && !celebrated) { celebrated = true; celebration.start(car.root.position); camera.setMode('celebrate'); }
  celebration.update(dt); gate.update(current);
  camera.update(c, dt); sky.update(engine.camera, car.root.position); skid.update(c); scene.update(current); hud.update(current); engine.render();
}
// 普通游玩也全程录制；控制台可导出本局，便于复盘和服务器核实
window.__raceReplay = () => recorder.encode({ track: hash, laps: def.laps });

if (capture) {
  await setup(params.get('map') || DEFAULT_DIFFICULTY); hideLoading();
  window.__race = { step(bits, n = 1) { for (let i = 0; i < n; i++) simulate(bits); render(1, Math.max(DT, n * DT)); return current; }, auto(n = 1) { for (let i = 0; i < n; i++) simulate(autopilot(current, track)); render(1, Math.max(DT, n * DT)); return current; }, snap: () => session.snapshot, replay: () => recorder.encode({ track: hash, laps: def.laps }), cam(mode) { const value = camera.setMode(mode); render(); return value; }, render: () => render() };
  window.__engine = engine; window.__sky = sky;   // 调试：检查天空与太阳方向
  document.title = 'ready';
} else {
  engine.render(); hideLoading();
  // 选图：三张卡片带走线缩略图，1/2/3 或点击选择，Enter 选当前高亮（默认简单）
  const thumb = d => { const t = buildTrack(d); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const pts = []; for (let i = 0; i < t.samples.length; i += 7 * 8) { const x = -t.samples[i], z = t.samples[i + 1]; pts.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } const k = 104 / Math.max(x1 - x0, z1 - z0); return { len: t.length, d: 'M' + pts.map(([x, z]) => `${(8 + (x - x0) * k + (104 - (x1 - x0) * k) / 2).toFixed(1)},${(8 + (z1 - z) * k + (104 - (z1 - z0) * k) / 2).toFixed(1)}`).join('L') + 'Z' }; };
  const pick = document.createElement('div'); pick.id = 'race-pick';
  pick.innerHTML = `<style>#race-pick{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:#0b0f14b0;backdrop-filter:blur(4px);font:15px 'Helvetica Neue','PingFang SC',sans-serif;color:#f4eee1}#race-pick h2{text-align:center;font-weight:600;letter-spacing:.2em;margin:0 0 22px}#race-pick .cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 16px}#race-pick button{all:unset;cursor:pointer;width:230px;padding:18px 20px;border-radius:12px;background:#17232ae6;border:1px solid #ffffff26;line-height:1.6}#race-pick button:hover,#race-pick button.on{border-color:#4bc8e5;box-shadow:0 0 0 2px #4bc8e555}#race-pick b{display:block;font-size:22px}#race-pick i{font-style:normal;color:#f8d28d;font-size:13px}#race-pick small{color:#aab7bd;display:block;min-height:48px}#race-pick kbd{float:right;color:#4bc8e5}#race-pick svg{display:block;margin:10px auto}#race-pick .skies{display:flex;gap:8px;justify-content:center;margin-top:22px;flex-wrap:wrap}#race-pick .skies span{color:#aab7bd;align-self:center;margin-right:4px}#race-pick .skies a{all:unset;cursor:pointer;padding:6px 14px;border-radius:999px;background:#17232ae6;border:1px solid #ffffff26;font-size:14px}#race-pick .skies a.on{border-color:#f8d28d;color:#f8d28d}</style>
<div><h2>选择地图</h2><div class="cards">${TRACKS.map((t, i) => { const th = thumb(t.def); return `<button data-k="${t.difficulty}" class="${t.difficulty === DEFAULT_DIFFICULTY ? 'on' : ''}"><kbd>${i + 1}</kbd><b>${t.label}</b><i>${t.def.name.zh} · ${(th.len / 1000).toFixed(1)} 公里</i><svg width="120" height="120" viewBox="0 0 120 120"><path d="${th.d}" fill="none" stroke="#e8e2d4" stroke-width="3" stroke-linejoin="round"/></svg><small>${t.desc}</small></button>`; }).join('')}</div><div class="skies"><span>背景</span>${Object.entries(SKIES).map(([k, s]) => `<a data-sky="${k}" class="${k === skyKey ? 'on' : ''}">${s.label}</a>`).join('')}</div></div>`;
  document.body.append(pick);
  let chosen = false;
  const choose = async k => {
    if (chosen) return; chosen = true; removeEventListener('keydown', onPick);
    pick.querySelector('h2').textContent = '生成赛道…'; await new Promise(r => setTimeout(r, 30));
    await setup(k); pick.remove(); requestAnimationFrame(frame);
  };
  const onPick = e => { const k = TRACKS[Number(e.key) - 1]?.difficulty; if (k) choose(k); else if (e.key === 'Enter') choose(DEFAULT_DIFFICULTY); };
  addEventListener('keydown', onPick); pick.querySelectorAll('button').forEach(b => b.addEventListener('click', () => choose(b.dataset.k)));
  // 换背景：记住选择后带着 sky 参数重新加载
  pick.querySelectorAll('.skies a').forEach(a => a.addEventListener('click', () => { if (a.dataset.sky === skyKey) return; try { localStorage.setItem('race.sky', a.dataset.sky); } catch {} const q = new URLSearchParams(location.search); q.set('sky', a.dataset.sky); location.search = q.toString(); }));
  let accumulator = 0, lastTime;
  function frame(time) { const elapsed = lastTime === undefined ? 0 : Math.min(.1, (time - lastTime) / 1000); lastTime = time; accumulator += elapsed; let bits = 0; for (const code of keys) bits |= map[code] || 0; while (accumulator >= DT) { simulate(bits); accumulator -= DT; } render(accumulator / DT, elapsed); requestAnimationFrame(frame); }
}
