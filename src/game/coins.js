// 金币：沿弯道摆成几种队形（一条线、换道、S 形蛇行、空中拱门），车开过去就吃掉。
// 金币的位置按公路里程 D 记录，和路面、路边物体一样随世界滚动，横向跟着弯道走
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadCenter } from './road.js';

const N = 180;                    // 同时存在的金币上限
const AHEAD = 950;                // 在车前方多远处生成
const LANE = 1.9;                 // 车道中心相对路中心的偏移

let seed = 23; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

// 金币外形：带凸边的圆片（旋转体），竖立在路上，正面朝向行驶方向
function coinGeometry() {
  const pts = [[0, .026], [.355, .026], [.372, .036], [.4, .036], [.42, .018], [.42, -.018], [.4, -.036], [.372, -.036], [.355, -.026], [0, -.026]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 40); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g;
}

export function createCoins(parent) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffc94a', metalness: 1, roughness: .26, emissive: '#6b4300', emissiveIntensity: .45 });
  const inst = new THREE.InstancedMesh(coinGeometry(), mat, N);
  inst.castShadow = true; inst.frustumCulled = false; inst.renderOrder = 3; parent.add(inst);
  // 币面浮雕：正反两面各一张圆片，同一张灰度浮雕图既当明暗又当凹凸，金色仍来自材质
  const faceTex = new THREE.TextureLoader().load('/assets/props/coin-face.webp');
  faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 8;
  const faceMat = new THREE.MeshStandardMaterial({ color: '#ffd36a', metalness: 1, roughness: .3, map: faceTex, bumpMap: faceTex, bumpScale: 4,
    emissive: '#6b4300', emissiveMap: faceTex, emissiveIntensity: .75 });
  const faceGeo = (() => {
    const front = new THREE.CircleGeometry(.36, 64); front.translate(0, 0, .0262);
    const back = new THREE.CircleGeometry(.36, 64); back.rotateY(Math.PI); back.translate(0, 0, -.0262);
    return mergeGeometries([front, back]);
  })();
  const faces = new THREE.InstancedMesh(faceGeo, faceMat, N);
  faces.frustumCulled = false; faces.renderOrder = 3; faces.instanceMatrix = inst.instanceMatrix; parent.add(faces);
  const slots = Array.from({ length: N }, () => ({ live: false, D: 0, off: 0, y: 0 }));
  // 吃到金币时的闪光：金色光斑迅速放大淡出
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,240,190,1)'); r.addColorStop(.4, 'rgba(255,200,80,.5)'); r.addColorStop(1, 'rgba(255,180,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const sparks = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    s.renderOrder = 9; s.visible = false; parent.add(s); return { s, t: 1, D: 0, off: 0, y: 0 }; });
  let sparkIdx = 0, nextD = 160, count = 0;

  function place(D, off, y) {
    const c = slots.find(s => !s.live); if (!c) return;
    Object.assign(c, { live: true, D, off, y });
  }
  // 队形：返回下一组从哪里开始
  function spawnPattern(D0) {
    const k = rnd(), lane = (rnd() < .5 ? -1 : 1) * LANE;
    if (k < .3) {                                         // 一条线
      for (let i = 0; i < 8; i++) place(D0 + i * 7, lane, .75);
      return D0 + 56;
    }
    if (k < .55) {                                        // 换道：从一条车道斜穿到另一条
      for (let i = 0; i < 11; i++) { const u = i / 10; place(D0 + i * 7, lane * (1 - 2 * u * u * (3 - 2 * u)), .75); }
      return D0 + 77;
    }
    if (k < .8) {                                         // 蛇行
      for (let i = 0; i < 14; i++) place(D0 + i * 7, Math.sin(i * .5) * 2.4, .75);
      return D0 + 98;
    }
    for (let i = 0; i < 9; i++) place(D0 + i * 8, lane * .5, .75 + Math.sin(Math.PI * i / 8) * 5.5);   // 空中拱门：要按空格跳起来才吃得到
    return D0 + 72;
  }

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  // trackD：车所在处的公路里程；dz：本帧前进距离；car：{ x, y }。返回本帧吃到的金币数
  function update(dt, trackD, dz, car, t) {
    while (nextD < trackD + AHEAD) nextD = spawnPattern(nextD) + 160 + rnd() * 180;
    let got = 0;
    slots.forEach((c, i) => {
      if (!c.live) { inst.setMatrixAt(i, M.makeScale(0, 0, 0)); return; }
      const z = trackD - c.D, x = roadCenter(c.D) + c.off;
      if (z > 30) { c.live = false; inst.setMatrixAt(i, M.makeScale(0, 0, 0)); return; }
      // 车身约 4.4 米长：本帧车头扫过的区间与金币有交集、横向与高度对得上就算吃到
      if (z - dz <= 2.4 && z >= -2.4 && Math.abs(x - car.x) < 1.45 && Math.abs(c.y - (car.y + .6)) < 1.3) {
        c.live = false; got++;
        const sp = sparks[sparkIdx++ % sparks.length]; Object.assign(sp, { t: 0, D: c.D, off: c.off, y: c.y }); sp.s.visible = true;
        inst.setMatrixAt(i, M.makeScale(0, 0, 0)); return;
      }
      P.set(x, c.y + Math.sin(t * 3 + c.D) * .06, z); Q.setFromAxisAngle(UP, t * 3.2 + c.D * .21); S.setScalar(1);
      inst.setMatrixAt(i, M.compose(P, Q, S));
    });
    inst.instanceMatrix.needsUpdate = true;
    for (const sp of sparks) {
      if (!sp.s.visible) continue;
      sp.t += dt / .35; if (sp.t >= 1) { sp.s.visible = false; continue; }
      sp.s.position.set(roadCenter(sp.D) + sp.off, sp.y, trackD - sp.D); sp.s.scale.setScalar(.6 + sp.t * 2.6); sp.s.material.opacity = (1 - sp.t) * .9;
    }
    count += got;
    return got;
  }
  function setVisible(on) { inst.visible = faces.visible = on; if (!on) sparks.forEach(s => { s.s.visible = false; }); }
  return { update, setVisible, get count() { return count; } };
}
