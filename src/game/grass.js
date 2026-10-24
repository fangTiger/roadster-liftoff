// 路边草丛：成千上万丛程序生成的干草（每丛 14 片细草叶），给平坦的草地加上真实的立体细节与视差。
// 和路边物体一样随行驶向 +Z 流动、越过车后方就回收到前方远处，横向跟着弯道走；越靠近路边越密。
// 草叶随风轻摆（顶点着色器里按高度的平方偏移），颜色取照片里两侧草地的平均色再加深浅变化，与地面融为一体
import * as THREE from 'three';

const BLADES = 14;
let seed = 97; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

// 一丛草：每片草叶是底宽顶尖的三段折线（5 个顶点、3 个三角形），朝向、高度、倾斜各不相同
function clumpGeometry() {
  const pos = [], nor = [], col = [], idx = [];
  for (let b = 0; b < BLADES; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * .2, h = .12 + Math.pow(rnd(), 1.4) * .34, w = .009 + rnd() * .011;
    const lean = (.15 + rnd() * .45) * h, la = a + (rnd() - .5) * 1.2;           // 向外倾倒的方向与幅度
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const ax = Math.cos(a + Math.PI / 2), az = Math.sin(a + Math.PI / 2);         // 叶面横向
    const lx = Math.cos(la), lz = Math.sin(la);
    const at = (t, s) => { const bend = lean * t * t; return [cx + ax * w * s * (1 - t) + lx * bend, h * t, cz + az * w * s * (1 - t) + lz * bend]; };
    const base = pos.length / 3;
    for (const [t, s] of [[0, -.5], [0, .5], [.55, -.5], [.55, .5], [1, 0]]) {
      pos.push(...at(t, s));
      nor.push(lx * .25, 1, lz * .25);                                             // 法线大致朝上：逆光的叶背不会发黑
      const k = .45 + t * .85; col.push(k, k * .97, k * .88);                      // 根部暗、叶尖亮且偏暖（干枯的草尖）
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

// count：草丛数量；edge：离路中心多远开始长草；width：两侧草带宽度；span：纵向循环长度；back：越过车后多远回收
export function createGrass({ count = 18000, edge = 5.6, width = 50, span = 380, back = 30, colors = [new THREE.Color('#8a7a3a'), new THREE.Color('#8a7a3a')] } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0, side: THREE.DoubleSide });
  const uTime = { value: 0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      // 风：按草丛位置错开相位，高度越高摆得越大
      vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      float sway = sin(uTime * 1.8 + ip.x * .37 + ip.y * .23) * .6 + sin(uTime * 3.1 + ip.x * .91) * .25;
      transformed.xz += vec2(.07, .045) * sway * position.y * position.y * 4.;`);
    // 双面草叶不翻转背面法线：法线统一朝上，逆光一侧的叶背不会发黑
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  const inst = new THREE.InstancedMesh(clumpGeometry(), mat, count);
  inst.frustumCulled = false; inst.castShadow = false; inst.receiveShadow = true;
  // 每丛：横向偏移 off（相对路中心）、纵向 z、旋转、缩放；颜色按所在一侧的草地色加深浅与偏黄/偏褐的变化
  const items = Array.from({ length: count }, () => {
    const side = rnd() < .5 ? -1 : 1;
    return { off: side * (edge + Math.pow(rnd(), 2.2) * width), z: back - rnd() * span, x: 0, r: rnd() * 6.28, s: .75 + rnd() * .6, side };
  });
  const c = new THREE.Color(), dry = new THREE.Color('#9c7a3c'), dark = new THREE.Color('#3d3a1c');
  items.forEach((it, i) => {
    c.copy(colors[it.side < 0 ? 0 : 1]);
    const v = rnd(); if (v < .35) c.lerp(dry, rnd() * .45); else if (v < .6) c.lerp(dark, rnd() * .4);
    c.multiplyScalar(.75 + rnd() * .5); inst.setColorAt(i, c);
  });
  const arr = inst.instanceMatrix.array;
  // 只含平移、绕 Y 旋转与等比缩放，直接写矩阵元素，比逐个 compose 快得多
  function write() {
    for (let i = 0; i < count; i++) {
      const it = items[i], o = i * 16, cs = Math.cos(it.r) * it.s, sn = Math.sin(it.r) * it.s;
      arr[o] = cs; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = it.s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = cs; arr[o + 11] = 0;
      arr[o + 12] = it.x; arr[o + 13] = 0; arr[o + 14] = it.z; arr[o + 15] = 1;
    }
    inst.instanceMatrix.needsUpdate = true;
  }
  // centerAt(z)：z 处的路中心横坐标
  function init(centerAt) { for (const it of items) it.x = centerAt(it.z) + it.off; write(); }
  function advance(dz, centerAt) {
    for (const it of items) { it.z += dz; if (it.z > back) { it.z -= span; it.x = centerAt(it.z) + it.off; } }
    write();
  }
  // 画质：低档少画一些（实例按随机顺序生成，取前 n 个就是均匀抽稀）
  function setDensity(k) { inst.count = Math.max(1, Math.round(count * Math.max(0, Math.min(1, k)))); }
  function tick(dt) { uTime.value += dt; }
  return { mesh: inst, init, advance, setDensity, tick };
}
