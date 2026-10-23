// 镜头系统：五个机位，C 键循环，也可点击顶部机位按钮
//   chase   追随：弹簧跟车（原有追随镜头）
//   low     低角跟拍：贴地的侧前方跟拍车，像追拍车在旁边并行
//   cine    电影运镜：每隔几秒自动切换路边定点、正面倒拍、高空摇臂三种镜头
//   cockpit 驾驶舱：驾驶员视角，从挡风玻璃看出去（爬升和太空中同样可用）
//   free    自由环绕：鼠标/手指拖动旋转、滚轮缩放（爬升和太空中同样可用）
// 公路驾驶时五个机位都生效；飞行导演接管时，只有驾驶舱和自由环绕会覆盖导演镜头
import * as THREE from 'three';
import { createChaseCamera } from './chaseCamera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const CAM_MODES = ['chase', 'low', 'cine', 'cockpit', 'free'];
const CAM_NAMES = { chase: '追随', low: '低角跟拍', cine: '电影运镜', cockpit: '驾驶舱', free: '自由环绕' };
const EYE = V(-.36, 1.02, .22);            // 驾驶员眼睛（车身局部坐标，车头朝 -Z）

export function createCameraRig(camera, canvas) {
  const chase = createChaseCamera(camera);
  let mode = 'chase', t = 0;
  const pos = V(), look = V(), tmp = V(), tmp2 = V();
  // 电影运镜状态
  const cine = { shot: 0, t: 0, anchor: V() };
  // 自由环绕状态
  const free = { yaw: .6, pitch: .18, dist: 9, drag: null };
  canvas.addEventListener('pointerdown', e => { if (mode === 'free') { free.drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', e => {
    if (!free.drag) return;
    free.yaw -= (e.clientX - free.drag.x) * .006; free.pitch = THREE.MathUtils.clamp(free.pitch + (e.clientY - free.drag.y) * .004, -.35, 1.3);
    free.drag = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', () => { free.drag = null; });
  canvas.addEventListener('wheel', e => { if (mode === 'free') { free.dist = THREE.MathUtils.clamp(free.dist * Math.exp(e.deltaY * .001), 4.5, 40); e.preventDefault(); } }, { passive: false });

  const listeners = [];
  function setMode(m) {
    mode = m; cine.t = 99;
    document.querySelectorAll('#cams span').forEach((s, i) => s.classList.toggle('on', CAM_MODES[i] === m));
    const n = document.getElementById('camname'); if (n) n.textContent = CAM_NAMES[m];
    canvas.style.cursor = m === 'free' ? 'grab' : '';
    listeners.forEach(f => f(m));
  }
  const cycle = () => setMode(CAM_MODES[(CAM_MODES.indexOf(mode) + 1) % CAM_MODES.length]);
  addEventListener('keydown', e => { if (e.code === 'KeyC' && !e.repeat) cycle(); });
  document.querySelectorAll('#cams span').forEach((s, i) => { s.style.cursor = 'pointer'; s.addEventListener('click', () => setMode(CAM_MODES[i])); });
  const bar = document.getElementById('cams'); if (bar) bar.style.pointerEvents = 'auto';

  function spring(dt, p, l, k) { const a = 1 - Math.exp(-dt * k); pos.lerp(p, a); look.lerp(l, a); camera.position.copy(pos); camera.lookAt(look); }
  function fov(f, dt) { camera.fov += (f - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }

  function cockpit(dt, car, speed) {
    car.chassis.updateWorldMatrix(true, false);
    camera.position.copy(EYE).applyMatrix4(car.chassis.matrixWorld);
    tmp.set(EYE.x, EYE.y - .12, -20).applyMatrix4(car.chassis.matrixWorld);
    camera.up.set(0, 1, 0).applyQuaternion(car.chassis.getWorldQuaternion(new THREE.Quaternion()));
    camera.lookAt(tmp); camera.up.set(0, 1, 0);
    pos.copy(camera.position); look.copy(tmp);
    fov(62 + speed * 10, dt);
  }
  function orbit(dt, car) {
    const c = car.root.position;
    tmp.set(Math.sin(free.yaw) * Math.cos(free.pitch), Math.sin(free.pitch), Math.cos(free.yaw) * Math.cos(free.pitch)).multiplyScalar(free.dist).add(c);
    tmp.y = Math.max(tmp.y, c.y < 1 ? .3 : -1e9);
    tmp2.copy(c).add(V(0, .7, 0));
    spring(dt, tmp, tmp2, 10); fov(48, dt);
  }

  // 公路驾驶时每帧调用
  function updateDrive(dt, car, s) {
    t += dt;
    const speed = s.v / 111;
    if (mode === 'chase') { chase.update(dt, car.root, s, rig.shake); pos.copy(camera.position); look.copy(car.root.position); return; }
    if (mode === 'cockpit') return cockpit(dt, car, speed);
    if (mode === 'free') return orbit(dt, car);
    const c = car.root.position;
    if (mode === 'low') {
      // 侧前方贴地并行，镜头略仰，速度越快越靠前
      tmp.set(c.x + 3.4, .42, c.z - 2.2 - speed * 2.5); tmp2.set(c.x, .55, c.z + .4);
      spring(dt, tmp, tmp2, 6); fov(44 + speed * 8, dt);
      camera.position.x += Math.sin(t * 47) * .006 * speed; camera.position.y += Math.sin(t * 53) * .006 * speed;
      return;
    }
    // 电影运镜：三种镜头轮换
    cine.t += dt;
    if (cine.t > (cine.shot === 0 ? 4.5 : 6)) {
      cine.t = 0; cine.shot = (cine.shot + 1) % 3;
      // 路边定点：放在车前方的路肩外侧，车开过去时镜头跟着转
      cine.anchor.set(c.x + (Math.random() < .5 ? -1 : 1) * 6.5, .9 + Math.random() * .8, c.z - 22 - s.v * 1.2);
      pos.copy(cine.anchor); look.copy(c);
    }
    if (cine.shot === 0) {
      cine.anchor.z += s.v * dt * Math.cos(s.yaw);         // 定点随世界一起向 +Z 流动（世界是跑步机）
      camera.position.copy(cine.anchor); camera.lookAt(tmp.copy(c).add(V(0, .6, 0))); pos.copy(camera.position);
      fov(30, dt);
    } else if (cine.shot === 1) {
      tmp.set(c.x - 1.2, .75, c.z - 7.5 - speed * 3); tmp2.set(c.x, .6, c.z);
      spring(dt, tmp, tmp2, 5); fov(40, dt);
    } else {
      const a = t * .15;
      tmp.set(c.x + Math.sin(a) * 9, 7.5, c.z + Math.cos(a) * 9 + 4); tmp2.set(c.x, .4, c.z - 4);
      spring(dt, tmp, tmp2, 2.5); fov(46, dt);
    }
  }
  // 飞行导演接管时调用：只有驾驶舱和自由环绕覆盖导演镜头
  function updateFlight(dt, car) {
    if (mode === 'cockpit') { cockpit(dt, car, .6); return true; }
    if (mode === 'free') { orbit(dt, car); return true; }
    pos.copy(camera.position); return false;
  }
  setMode('chase');
  const rig = { setMode, cycle, updateDrive, updateFlight, get mode() { return mode; }, onChange: f => listeners.push(f), shake: true };
  return rig;
}
