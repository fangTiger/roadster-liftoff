// 起终点：横跨赛道的龙门架（两根立柱 + 横梁 + 两面横幅）、横梁下五盏发车灯、路面黑白格终点线。
// 发车灯：倒数期间红灯逐个点亮，GO 时全部变绿，1.5 秒后熄灭
import * as THREE from 'three';
const banner = (title, sub) => {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#0d1a24'; g.fillRect(0, 0, 2048, 256);
  // 两端格子旗
  for (const x0 of [0, 1792]) for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) & 1 ? '#f2f2f2' : '#111'; g.fillRect(x0 + i * 32, j * 64, 32, 64); }
  g.fillStyle = '#ffd34d'; g.fillRect(256, 0, 1536, 10); g.fillRect(256, 246, 1536, 10);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 118px "Helvetica Neue", Arial, sans-serif'; g.fillText(title, 1024, 112);
  g.fillStyle = '#9fd8ff'; g.font = '500 46px "PingFang SC", "Helvetica Neue", sans-serif'; g.fillText(sub, 1024, 200);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};
export function createStartGate(scene, track, name) {
  const gate = track.checkpointGates.at(-1), p = track.at(0), w = p.w, yaw = Math.atan2(p.tx, p.tz);
  const root = new THREE.Group(); root.position.set(p.x, p.y, p.z); root.rotation.y = yaw; scene.add(root);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: .6, roughness: .45 });
  const span = w + 4, H = 7.6;
  for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.8, H, .8), metal); post.position.set(side * span / 2, H / 2, 0); post.castShadow = true; root.add(post); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + .8, 1.9, .7), metal); beam.position.y = H + .2; beam.castShadow = true; root.add(beam);
  // 横幅：面向来车一面写 START / FINISH，背面写 MARS ROADSTER
  const front = new THREE.Mesh(new THREE.PlaneGeometry(span, span / 8), new THREE.MeshStandardMaterial({ map: banner('START · FINISH', name), roughness: .7, emissive: 0xffffff, emissiveIntensity: .12, emissiveMap: null }));
  front.position.set(0, H + .2, -.37); front.rotation.y = Math.PI; root.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(span, span / 8), new THREE.MeshStandardMaterial({ map: banner('MARS ROADSTER', name), roughness: .7 }));
  back.position.set(0, H + .2, .37); root.add(back);
  // 发车灯：横梁下方一排五盏，朝向来车方向
  const lamps = [];
  for (let i = 0; i < 5; i++) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .5), metal); housing.position.set((i - 2) * 1.05, H - 1.25, -.1); root.add(housing);
    const m = new THREE.MeshStandardMaterial({ color: 0x220808, emissive: 0x000000, emissiveIntensity: 4, roughness: .3 });
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(.24, 24), m); lamp.position.set((i - 2) * 1.05, H - 1.25, -.36); lamp.rotation.y = Math.PI; root.add(lamp); lamps.push(m);
  }
  // 地面黑白格终点线（横跨路面，沿路方向 2 米）
  const ck = document.createElement('canvas'); ck.width = 256; ck.height = 32; { const g = ck.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) & 1 ? '#eee' : '#141414'; g.fillRect(i * 16, j * 16, 16, 16); } }
  const ckTex = new THREE.CanvasTexture(ck); ckTex.colorSpace = THREE.SRGBColorSpace; ckTex.magFilter = THREE.NearestFilter; ckTex.wrapS = THREE.RepeatWrapping; ckTex.repeat.set(w / 8, 1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 2), new THREE.MeshStandardMaterial({ map: ckTex, roughness: .8, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
  line.rotation.x = -Math.PI / 2; line.position.y = .06; line.receiveShadow = true; root.add(line);
  let greenUntil = -1;
  function update(s) {
    const r = s.race;
    if (r.frozen) { const lit = Math.min(5, Math.ceil((3 - r.countdown) / 3 * 5 + .001)); lamps.forEach((m, i) => { m.emissive.setHex(i < lit ? 0xff0000 : 0); m.emissiveIntensity = i < lit ? 2.2 : 0; }); greenUntil = -1; return; }
    if (greenUntil < 0) greenUntil = s.step + 180;
    const green = s.step < greenUntil; lamps.forEach(m => { m.emissive.setHex(green ? 0x22ff55 : 0); m.emissiveIntensity = green ? 3 : 0; });
  }
  return { update, position: root.position };
}
