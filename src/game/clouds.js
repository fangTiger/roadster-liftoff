// 云层：冲出大气层/再入时穿过的一层积云。用多层分形噪声画出带明暗的云团贴图，
// 公告板精灵铺成一层，配合全屏白闪完成"穿云"
import * as THREE from 'three';

let seed = 77; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

function cloudTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
  const sm = t => t * t * (3 - 2 * t);
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, h = (a, b) => P[(P[a & 255] + b) & 255] / 255, u = sm(xf), v = sm(yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; };
  const fbm = (x, y) => { let s = 0, a = .5, f = 1; for (let i = 0; i < 6; i++) { s += a * n2(x * f, y * f); a *= .5; f *= 2.03; } return s; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.sqrt(dx * dx * .8 + dy * dy * 1.6);
    const n = fbm(x / 38, y / 38), d = Math.max(0, n * 1.25 - r * .85 - .05);
    const a = Math.min(1, d * 3.2);
    const shade = .72 + .28 * (1 - y / S) + (n - .5) * .25;            // 顶部受光、底部偏灰
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = 255 * Math.min(1, shade); img.data[i + 2] = 255 * Math.min(1, shade * 1.02); img.data[i + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createClouds(parent) {
  const group = new THREE.Group(); group.visible = false; parent.add(group);
  const tex = cloudTexture();
  const base = 170, top = 250;                 // 云层高度范围（场景单位）
  for (let i = 0; i < 220; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: new THREE.Color().setHSL(.08, .15, .86 + rnd() * .14), opacity: .78 });
    const s = new THREE.Sprite(m); const sc = 40 + rnd() * 90;
    s.position.set((rnd() - .5) * 420, base + Math.pow(rnd(), .8) * (top - base), (rnd() - .5) * 420); s.scale.set(sc * 1.6, sc, 1); s.material.rotation = rnd() * 6.28;
    group.add(s);
  }
  // 云层跟随车的水平位置，只在穿云时显示
  function follow(x, z) { group.position.x = x; group.position.z = z; }
  return { group, follow, base, top };
}
