// 第一段：沙漠公路驾驶。组装引擎、世界、车辆、镜头、界面，并驱动主循环
// ?capture 时不自动跑循环，由录制脚本调用 window.__frame(dt, input) 逐帧推进
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createDesert } from './desert.js';
import { createCar } from './car.js';
import { createVehicle, KMH } from './vehicle.js';
import { createChaseCamera } from './chaseCamera.js';
import { createHUD } from './hud.js';
import { createInput } from './input.js';
import { createSpace } from './space.js';
import { createClouds } from './clouds.js';
import { createFlight } from './flight.js';

const CAPTURE = /capture/.test(location.search);
const DBG = new URLSearchParams(location.search).get('dbg') || '';   // 排查用：noflame / nodust / nobloom / noblur
const engine = createEngine(CAPTURE ? { pixelRatio: 1 } : {});
if (DBG.includes('nobloom')) engine.bloom.enabled = false;
if (DBG.includes('noblur')) engine.blur.enabled = false;
const { scene, camera, renderer } = engine;

const desert = await createDesert(scene, renderer);
const car = await createCar(); scene.add(car.root);
const vehicle = createVehicle({ roadX: desert.ROAD_X, roadHalf: desert.ROAD_HALF });
const cam = createChaseCamera(camera);
const hud = createHUD();
const input = createInput();
const space = await createSpace(scene, renderer);
const clouds = createClouds(scene);
const flight = createFlight({ scene, camera, desert, space, clouds, car, vehicle, hud, flash: document.getElementById('flash'), music: null });

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

const clock = { t: 0 };
const rear = car.wheels.filter(w => !w.front);
// 公路驾驶：车辆物理、车身姿态、推进器、扬尘、世界滚动与追随镜头
function driveFrame(dt, inp) {
  const s = vehicle.state;
  const dz = vehicle.step(dt, inp);
  // 车身：位置、朝向、加速抬头/刹车点头、转弯侧倾
  car.root.position.set(s.x, s.y, 0); car.root.rotation.y = s.yaw;
  const pitchT = THREE.MathUtils.clamp(s.a * .0016, -.03, .045) + (s.airborne ? THREE.MathUtils.clamp(s.vy * .006, -.08, .06) : 0), rollT = -s.steer * Math.min(1, s.v / 30) * (s.airborne ? .06 : .022);
  car.chassis.rotation.x += (pitchT - car.chassis.rotation.x) * Math.min(1, dt * 8);
  car.chassis.rotation.z += (rollT - car.chassis.rotation.z) * Math.min(1, dt * 6);
  car.chassis.position.y = s.offroad * Math.sin(clock.t * 40) * .012 * Math.min(1, s.v / 15) - s.landing * .09 * Math.max(0, Math.cos((1 - s.landing) * 9));   // 落地压缩回弹
  for (const w of car.wheels) { w.spin.rotation.x -= s.v / w.radius * dt; if (w.front) w.steer.rotation.y = s.steer * .3; }
  // 推进器：起步与高加速度时点火
  const thrust = inp.throttle ? THREE.MathUtils.clamp((s.a - 6) / 22, 0, 1) : 0;
  car.setThrust(DBG.includes('noflame') ? 0 : thrust, clock.t);
  car.setLift(DBG.includes('noflame') ? 0 : s.lift, clock.t);
  // 扬尘
  const launchDust = inp.throttle && s.v < 25 ? THREE.MathUtils.clamp((s.a - 10) / 20, 0, 1) : 0;
  const dustRate = launchDust * 40 + s.offroad * Math.min(1, s.v / 10) * 50;
  // 推进器贴近地面时吹起一圈尘土；落地瞬间再扬一次
  const jetDust = s.lift * Math.max(0, 1 - s.y / 7);
  jetAcc += (jetDust * 70 + (s.landing > .6 ? 120 : 0)) * dt;
  while (jetAcc > 1) { jetAcc--; emitRing(s.x, Math.max(jetDust, s.landing)); }
  dustAcc += dustRate * dt;
  if (DBG.includes('nodust')) dustAcc = 0;
  while (dustAcc > 1) { dustAcc--; const w = rear[Math.random() < .5 ? 0 : 1]; const p = w.steer.getWorldPosition(new THREE.Vector3()); emitDust(p.x, p.z, Math.max(launchDust, s.offroad)); }
  updateDust(dt, dz);
  // 世界滚动、阴影跟随、镜头、后期
  blob.position.x = s.x; blob.rotation.z = s.yaw; blob.scale.setScalar(1 + s.y * .06); blob.material.opacity = Math.max(0, 1 - s.y / 12);
  desert.advance(dz); desert.follow(car.root.position); desert.setAltitude(s.y);
  cam.update(dt, car.root, s);
  flight.checkAscent(dt, inp);
}

function frame(dt, inp) {
  clock.t += dt;
  const s = vehicle.state;
  if (flight.state.mode === 'drive') { blob.visible = true; driveFrame(dt, inp); }
  else {
    blob.visible = false;
    flight.update(dt, inp, clock.t);
    for (const w of car.wheels) w.spin.rotation.x -= s.v / w.radius * dt;
    updateDust(dt, 0);
  }
  const orbit = flight.state.mode === 'orbit';
  engine.blur.uniforms.strength.value = orbit ? 0 : THREE.MathUtils.clamp((s.v * KMH - 120) / 280, 0, 1) * .055;
  hud.update(s);
  engine.render();
}

if (CAPTURE) {
  window.__frame = (dt, inp) => frame(dt, { throttle: false, brake: false, left: false, right: false, ...inp });
  frame(1 / 30, {});
  document.title = 'ready';
} else {
  hud.toast('按 W 起步', '0–100 km/h 只要 0.8 秒，A / D 转向，S 刹车', 4500);
  let last = performance.now();
  renderer.setAnimationLoop(now => { const dt = Math.min(.05, (now - last) / 1000); last = now; frame(dt, input.state()); });
}
