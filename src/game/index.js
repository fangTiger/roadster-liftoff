// 第一段：沙漠公路驾驶。组装引擎、世界、车辆、镜头、界面，并驱动主循环
// ?capture 时不自动跑循环，由录制脚本调用 window.__frame(dt, input) 逐帧推进
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createDesert } from './desert.js';
import { createCar } from './car.js';
import { createVehicle, KMH } from './vehicle.js';
import { createCameraRig } from './cameraRig.js';
import { createHUD } from './hud.js';
import { createInput } from './input.js';
import { createSpace } from './space.js';
import { createClouds } from './clouds.js';
import { createFlight } from './flight.js';
import { createSkyDome } from './skydome.js';
import { createCloudSea } from './cloudsea.js';
import { createAudio } from '../audio/audio.js';
import { createAchievements } from '../achievements/achievements.js';
import { createUI } from '../ui/ui.js';
import { createTouch } from '../mobile/touch.js';
import { createPerf, QUALITY_PRESETS, getDefaultPreset } from '../mobile/perf.js';

const CAPTURE = /capture/.test(location.search);
const DBG = new URLSearchParams(location.search).get('dbg') || '';   // 排查用：noflame / nodust / nobloom / noblur
const engine = createEngine(CAPTURE ? { pixelRatio: 1 } : {});
// 音频与界面外壳先创建：加载期间显示进度，点击开始时在同一个手势里解锁音频
const audio = CAPTURE ? null : createAudio({ urls: { road: '/assets/music/road-80s-synthwave.mp3', space: '/assets/music/space-cosmos.mp3', oldfriend: '/assets/music/oldfriend-reflected-light.mp3' } });
// 画质档位：手动档由界面直接应用；"自动"档以用户上一次的手动档为上限，由 perf 模块自适应降档
let mobilePreset = getDefaultPreset(), mobileCeiling = '高', perf = null;
function setMobilePreset(preset) {
  if (!QUALITY_PRESETS.includes(preset)) return;
  mobilePreset = preset;
  if (preset !== '自动') mobileCeiling = preset;
  const base = preset === '自动' ? mobileCeiling : preset;
  const ratio = base === '极致' ? Math.min(devicePixelRatio || 1, 2) : base === '高' ? Math.min(devicePixelRatio || 1, 1.5) : 1;
  engine.renderer.setPixelRatio(ratio); engine.composer.setPixelRatio(ratio); engine.composer.setSize(innerWidth, innerHeight);
  engine.renderer.shadowMap.enabled = base !== '低'; engine.bloom.enabled = base !== '低';
  perf?.refresh();
}
let started = CAPTURE, touch = null;
const ui = CAPTURE ? null : createUI({ engine, audio, onQualityChange: setMobilePreset, onStart() {
  started = true;
  if (touch?.active) hud.toast('按住加速起步', '左侧拖动转向 · 按住推进器升空', 4500);
  else hud.toast('按 W 起步', '0–100 km/h 只要 0.8 秒，A / D 转向，S 刹车', 4500);
} });
if (ui) setMobilePreset(ui.quality);
ui?.showLoading(.05, '加载沙漠全景…');
if (DBG.includes('nobloom')) engine.bloom.enabled = false;
if (DBG.includes('noblur')) engine.blur.enabled = false;
const { scene, camera, renderer } = engine;

const desert = await createDesert(scene, renderer);
ui?.showLoading(.35, '加载推进器超跑…');
const car = await createCar(); scene.add(car.root);
ui?.showLoading(.5, '加载地球与星空…');
const vehicle = createVehicle({ roadX: desert.ROAD_X, roadHalf: desert.ROAD_HALF });
const rig = createCameraRig(camera, renderer.domElement);
rig.onChange(m => ach?.report('camera', { mode: m }));
const hud = createHUD();
const input = createInput();
touch = CAPTURE ? null : createTouch({ input, onCamera: () => rig.cycle(), onRoll: () => tryRoll(input.state()) });
perf = CAPTURE ? null : createPerf({ engine, getPreset: () => mobilePreset, setPreset: setMobilePreset });
const space = await createSpace(scene, renderer);
const clouds = createClouds(scene);
const sky = await createSkyDome(scene, renderer);
ui?.showLoading(.85, '准备起飞…');
const cloudSea = createCloudSea(space.group);
const ach = createAchievements();
const flight = createFlight({ scene, camera, desert, space, clouds, cloudSea, sky, car, vehicle, hud, flash: document.getElementById('flash'), music: null, engine, onEvent: (e, d) => ach.report(e, d) });

// 扬尘：起步烧胎或开上路肩时从后轮扬起
const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(150,125,95,.55)'); r.addColorStop(1, 'rgba(150,125,95,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const dust = Array.from({ length: 70 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); return { s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 }; });
let dustIdx = 0, dustAcc = 0, jetAcc = 0;
function emitDust(x, z, power) {
  const d = dust[dustIdx++ % dust.length];
  d.s.position.set(x + (Math.random() - .5) * .4, .25, z + .2); d.life = 0; d.max = 1.2 + Math.random() * 1.2;
  d.vx = (Math.random() - .5) * 1.5; d.vy = .5 + Math.random() * .8; d.vz = 2 + Math.random() * 3; d.power = power; d.s.visible = true;
}
function emitRing(x, power) {
  const d = dust[dustIdx++ % dust.length], a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 6;
  d.s.position.set(x + Math.cos(a) * 1.2, .2, Math.sin(a) * 1.8); d.life = 0; d.max = .9 + Math.random() * .8;
  d.vx = Math.cos(a) * sp; d.vy = .3 + Math.random() * .6; d.vz = Math.sin(a) * sp; d.power = power; d.s.visible = true;
}
function updateDust(dt, dz) {
  for (const d of dust) {
    if (!d.s.visible) continue;
    d.life += dt; const k = d.life / d.max; if (k >= 1) { d.s.visible = false; continue; }
    d.s.position.x += d.vx * dt; d.s.position.y += d.vy * dt; d.s.position.z += d.vz * dt + dz;
    d.s.scale.setScalar(.5 + k * 3.2); d.s.material.opacity = (1 - k) * (1 - k) * .32 * d.power;
  }
}

// 车底接触阴影：贴地的柔和暗斑，离地越高越淡、越大
const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); g.setTransform(1, 0, 0, 2, 0, 0); const r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.75)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })() }));
blob.rotation.x = -Math.PI / 2; blob.position.y = .02; blob.renderOrder = 3; scene.add(blob);

// 音频：录制模式下不创建；首次按键或点击时解锁（浏览器自动播放规则）
flight.setMusic(audio);
if (audio) {
  addEventListener('keydown', e => { if (e.code === 'KeyM') audio.toggleMuted(); if (e.code === 'KeyH' && !e.repeat && started && !ui.paused) { audio.horn(true); ach.report('horn'); } });
  addEventListener('keyup', e => { if (e.code === 'KeyH') audio.horn(false); });
  addEventListener('blur', () => audio.horn(false));
  const note = document.querySelector('#tools span:nth-child(2)'); note.style.cursor = 'pointer'; note.style.pointerEvents = 'auto';
  note.parentElement.style.pointerEvents = 'auto';
  const paint = () => { note.style.opacity = audio.muted ? .35 : 1; };
  note.addEventListener('click', () => { audio.toggleMuted(); paint(); }); paint();
  ach.onUnlock(() => audio.event('achievement'));        // 成就解锁时播放提示音
}
const aud = { landing: 0, flash: 0, timing: false };
const A_REF = 34;                 // 起步最大加速度，用于把加速度归一化给音频
function updateAudio(dt, inp) {
  if (!audio) return;
  const s = vehicle.state, f = flight.state, drive = f.mode === 'drive';
  audio.update(dt, { mode: drive ? 'drive' : f.mode, speedKmh: s.v * KMH, throttle: !!inp.throttle, brake: !!inp.brake, jet: !!inp.jet,
    lift: drive ? Math.max(s.lift, s.assist * .6) : (f.mode === 'ascent' && inp.jet ? 1 : 0), altitude: drive ? s.y : f.alt, offroad: s.offroad, landing: s.landing, plasma: f.plasma,
    boost: drive ? fx.boost : 0, accel: drive ? THREE.MathUtils.clamp(s.a / A_REF, 0, 1) : 0 });
  if (s.landing > .3 && aud.landing <= .3) audio.event('land');
  if (s.launch.timing && !aud.timing) audio.event('launch');
  if (f.flash > .6 && aud.flash <= .6) audio.event('whiteout');
  aud.landing = s.landing; aud.timing = s.launch.timing; aud.flash = f.flash;
}

// 成就：离散事件在状态跳变时上报，阈值类每帧交给 update
const achPrev = { timing: false, last: null, air: false, hover: false, landing: 0 };
function updateAchievements() {
  const s = vehicle.state, f = flight.state, p = achPrev;
  if (s.launch.timing && !p.timing) ach.report('drive_start');
  if (s.launch.last != null && s.launch.last !== p.last) ach.report('launch_time', { seconds: s.launch.last });
  if (s.airborne && !p.air) ach.report('airborne');
  if (s.y > 9.5 && !p.hover) ach.report('hover10');
  if (s.landing > .3 && p.landing <= .3) ach.report('land');
  Object.assign(p, { timing: s.launch.timing, last: s.launch.last, air: s.airborne, hover: s.y > 9.5, landing: s.landing });
  ach.update({ speedKmh: s.v * KMH, distanceKm: s.dist / 1000, offroad: s.offroad, hops: s.hops, altitudeM: f.mode === 'drive' ? s.y : f.alt, mode: f.mode });
}

const clock = { t: 0 };
const rear = car.wheels.filter(w => !w.front);
const fx = { boost: 0, steer: 0 };
// 悬架：comp 为车身相对车轮的下压量（米）。弹簧阻尼，落地时以触地速度冲击；空中车轮自然下垂 5 厘米
const susp = { comp: 0, v: 0 };
function updateSuspension(dt, s) {
  if (s.touchdown) { susp.v += s.impact * .85; car.chassis.rotation.x -= Math.min(.05, s.impact * .008); }   // 触地：车身继续下沉、车头轻点
  const rest = s.airborne ? -.05 : 0, K = 260, C = 13;
  susp.v += (-K * (susp.comp - rest) - C * susp.v) * dt;
  susp.comp += susp.v * dt;
  if (susp.comp > .12) { susp.comp = .12; susp.v = Math.min(0, susp.v); }       // 压到限位块
  if (susp.comp < -.07) { susp.comp = -.07; susp.v = Math.max(0, susp.v); }
  car.setSuspension(susp.comp);
  return susp.comp;
}
// 翻滚：R 键绕车身纵轴转一整圈，方向跟随当前转向（默认向左）；公路上需离地 1.2 米以上，爬升和太空中随时可用
const roll = { t: -1, dir: 1, dur: 1.15 };
function tryRoll(inp) {
  const m = flight.state.mode, s = vehicle.state;
  if (roll.t >= 0 || !(m === 'drive' ? s.y > 1.2 : m === 'ascent' || m === 'insert' || m === 'orbit')) return;
  roll.t = 0; roll.dir = inp.right && !inp.left ? -1 : 1;
  if (m === 'drive') { s.rolling = true; s.vy = Math.max(s.vy, 2.5); }
  audio?.event('roll');
}
function updateRoll(dt) {
  if (roll.t < 0) return 0;
  roll.t += dt; const u = Math.min(1, roll.t / roll.dur), e = u * u * u * (u * (u * 6 - 15) + 10);
  car.setRoll(roll.dir * e * Math.PI * 2);
  if (u >= 1) { roll.t = -1; car.setRoll(0); vehicle.state.rolling = false; ach.report('roll'); if (!rollShown) { rollShown = true; hud.toast('桶滚！', '空中 360° 翻滚', 2600); } }
  return Math.sin(Math.PI * u);             // 0→1→0：翻滚中段最强
}
let rollShown = false;
// 方向盘与刹车灯：公路上跟随转向/刹车，飞行中跟随左右与 S 键
function updateCockpitBits(dt, inp, steer) {
  fx.steer += (steer - fx.steer) * Math.min(1, dt * 10);
  car.setSteer(fx.steer);
  car.setBrake(inp.brake ? 1 : 0);
}
// 公路驾驶：车辆物理、车身姿态、推进器、扬尘、世界滚动与追随镜头
function driveFrame(dt, inp) {
  const s = vehicle.state;
  const dz = vehicle.step(dt, inp);
  const rollK = updateRoll(dt);
  if (rollK > 0) s.x -= roll.dir * rollK * 3.2 * dt;          // 翻滚时向翻滚一侧横移一点，像飞机的副翼滚转
  // 车身：位置、朝向、加速抬头/刹车点头、转弯侧倾
  car.root.position.set(s.x, s.y, 0); car.root.rotation.y = s.yaw;
  const pitchT = THREE.MathUtils.clamp(s.a * .0016, -.03, .045) + (s.airborne ? THREE.MathUtils.clamp(s.vy * .006, -.08, .06) : 0), rollT = -s.steer * Math.min(1, s.v / 30) * (s.airborne ? .06 : .022);
  car.chassis.rotation.x += (pitchT - car.chassis.rotation.x) * Math.min(1, dt * 8);
  car.chassis.rotation.z += (rollT - car.chassis.rotation.z) * Math.min(1, dt * 6);
  const comp = updateSuspension(dt, s);
  car.chassis.position.y = s.offroad * Math.sin(clock.t * 40) * .012 * Math.min(1, s.v / 15) - comp;
  for (const w of car.wheels) { w.spin.rotation.x -= s.v / w.radius * dt; if (w.front) w.steer.rotation.y = s.steer * .3; }
  updateCockpitBits(dt, inp, s.steer);
  // 推进器：起步与高加速度时点火；车底推进器包括自动缓降时的小火
  const thrust = inp.throttle ? THREE.MathUtils.clamp((s.a - 6) / 22, 0, 1) : 0;
  fx.boost = thrust;
  const liftVis = Math.max(s.lift, Math.min(1, s.assist * 1.4));
  car.setThrust(DBG.includes('noflame') ? 0 : thrust, clock.t);
  car.setLift(DBG.includes('noflame') ? 0 : liftVis, clock.t);
  // 扬尘
  const launchDust = inp.throttle && s.v < 25 ? THREE.MathUtils.clamp((s.a - 10) / 20, 0, 1) : 0;
  const dustRate = launchDust * 40 + s.offroad * Math.min(1, s.v / 10) * 50;
  // 推进器贴近地面时吹起一圈尘土；落地瞬间再扬一次
  const jetDust = liftVis * Math.max(0, 1 - s.y / 7);
  jetAcc += jetDust * 70 * dt + (s.touchdown ? 28 * Math.min(1, s.impact / 3) : 0);
  while (jetAcc > 1) { jetAcc--; emitRing(s.x, Math.max(jetDust, s.landing)); }
  dustAcc += dustRate * dt;
  if (DBG.includes('nodust')) dustAcc = 0;
  while (dustAcc > 1) { dustAcc--; const w = rear[Math.random() < .5 ? 0 : 1]; const p = w.steer.getWorldPosition(new THREE.Vector3()); emitDust(p.x, p.z, Math.max(launchDust, s.offroad)); }
  updateDust(dt, dz);
  // 世界滚动、阴影跟随、镜头、后期
  blob.position.x = s.x; blob.rotation.z = s.yaw; blob.scale.setScalar(1 + s.y * .06); blob.material.opacity = Math.max(0, 1 - s.y / 12);
  desert.advance(dz); desert.follow(car.root.position); desert.setAltitude(s.y);
  rig.updateDrive(dt, car, s);
  flight.checkAscent(dt, inp);
}

function frame(dt, inp) {
  clock.t += dt;
  const s = vehicle.state;
  if (flight.state.mode === 'drive') { blob.visible = true; driveFrame(dt, inp); }
  else {
    blob.visible = false;
    flight.update(dt, inp, clock.t);
    updateRoll(dt);
    updateCockpitBits(dt, inp, (inp.left ? 1 : 0) - (inp.right ? 1 : 0));
    rig.updateFlight(dt, car);
    for (const w of car.wheels) w.spin.rotation.x -= s.v / w.radius * dt;
    updateDust(dt, 0);
  }
  if (flight.state.mode === 'drive') engine.blur.uniforms.strength.value = THREE.MathUtils.clamp((s.v * KMH - 120) / 280, 0, 1) * .055;
  hud.update(s);
  updateAudio(dt, inp);
  updateAchievements();
  engine.render();
}

if (CAPTURE) {
  window.__frame = (dt, inp) => { const i = { throttle: false, brake: false, left: false, right: false, ...inp }; if (i.roll) tryRoll(i); frame(dt, i); };
  window.__cam = m => rig.setMode(m); window.__car = car; window.__THREE = THREE;
  window.__st = () => { const v = vehicle.state, f = flight.state; return { mode: f.mode, y: +v.y.toFixed(2), vy: +v.vy.toFixed(2), v: +(v.v * KMH).toFixed(1), fuel: +v.fuel.toFixed(2), alt: Math.round(f.alt) }; };
  frame(1 / 30, {});
  document.title = 'ready';
} else {
  // 截图成就：K 键或 ◎ 图标
  addEventListener('keydown', e => { if (e.code === 'KeyK' && started) ach.report('screenshot'); if (e.code === 'KeyR' && !e.repeat && started && !ui.paused) tryRoll(input.state()); });
  document.querySelector('#tools span:nth-child(1)')?.addEventListener('click', () => ach.report('screenshot'));
  engine.render(); ui.showLoading(1, '准备起飞…'); ui.hideLoading();
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const elapsed = (now - last) / 1000; last = now;
    const playing = started && !ui.paused && !document.hidden;
    touch?.setEnabled(playing);
    if (!playing) { perf?.reset(); engine.render(); return; }    // 开始前与暂停时只渲染画面
    perf?.update(elapsed);
    rig.shake = ui.shakeEnabled;
    frame(Math.min(.05, elapsed), input.state());
  });
}
