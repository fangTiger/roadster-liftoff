import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { instanceParts, loadPrototype, updateInstances, centerPrototype } from './props.js';
import { loadTexture } from './terrain.js';
import { noise } from './layout.js';

function warningMaterial() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e8b92c'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#222725';
  for (let x = -64; x < 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 80, 64); ctx.lineTo(x + 64, 64); ctx.fill(); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map, roughness: .8, side: THREE.DoubleSide });
}
export async function createObstacles(scene, track) {
  const concrete = new THREE.MeshStandardMaterial({ map: loadTexture('brushed_concrete'), normalMap: loadTexture('brushed_concrete', 'nor'), roughness: .95, side: THREE.DoubleSide, color: 0xbebcb3 });
  const warning = warningMaterial(), rust = new THREE.MeshStandardMaterial({ color: 0x69432c, roughness: .9 }), wood = new THREE.MeshStandardMaterial({ color: 0x51402c, roughness: 1 });
  const groups = [], moving = [], fans = [];
  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m; }
  function box(parent, material, x, y, z, w, h, d) { return mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z); }
  function group(x, y, z, yaw = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g); groups.push(g); return g; }
  const [tyre, barrier, rock, stone] = await Promise.all([
    loadPrototype('old_tyre', .95, { flat: true, axis: 'x' }), loadPrototype('concrete_road_barrier', 1.3, { maxRadius: 1.1 }),
    loadPrototype('rock_07', 2, { axis: 'y', maxRadius: 1 }), loadPrototype('rock_09', 7, { maxRadius: 4 }),
  ]);
  centerPrototype(rock);
  // 只在加载时减面一次，近景仍使用原素材的几何、UV 与橡胶贴图。
  const reducer = new SimplifyModifier();
  for (const p of tyre) p.geometry = reducer.modify(p.geometry, Math.floor(p.geometry.attributes.position.count * .65));
  // 轮胎墙两层；近处用素材模型，远处用低面数同轮廓实例，按 128 米块切换。
  const wallBuckets = new Map();
  for (const w of track.walls) {
    if (w.type !== 'tires' && w.type !== 'tunnel') continue;
    const length = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z), count = Math.ceil(length / 1.03);
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, x = w.a.x + (w.b.x - w.a.x) * t, z = w.a.z + (w.b.z - w.a.z) * t;
      const n = track.nearest(x, z), y = n.y + n.lateral * n.bank, key = `${Math.floor(x / 128)},${Math.floor(z / 128)}`;
      if (!wallBuckets.has(key)) wallBuckets.set(key, []);
      for (let layer = 0; layer < 2; layer++) wallBuckets.get(key).push({ x, y: y + layer * .3, z, yaw: noise(x, z) * 6.28 });
    }
  }
  const lowTyre = new THREE.TorusGeometry(.34, .13, 4, 8); lowTyre.rotateX(Math.PI / 2); lowTyre.translate(0, .13, 0);
  const lowParts = [{ geometry: lowTyre, material: new THREE.MeshStandardMaterial({ color: 0x262a26, roughness: 1, map: tyre[0].material.map }) }], walls = [];
  for (const points of wallBuckets.values()) {
    const near = new THREE.Group(), far = new THREE.Group(); instanceParts(near, tyre, points); instanceParts(far, lowParts, points); scene.add(near, far); for (const m of far.children) m.receiveShadow = false;
    walls.push({ near, far, points, x: Math.floor(points[0].x / 128) * 128 + 64, z: Math.floor(points[0].z / 128) * 128 + 64 });
  }
  // 沿真实走线生成水泥拱壳：拱脚在墙外，拱顶净高由机关数据决定。
  function arch(from, to, height, material, thickness = .5) {
    const geos = [], cross = [-.1, ...Array.from({ length: 17 }, (_, i) => i * Math.PI / 16), Math.PI + .1];
    const point = (s, angle, outer) => {
      const p = track.at(s), a = Math.max(0, Math.min(Math.PI, angle)), radius = p.w / 2 + 1.3 + outer;
      const lateral = Math.cos(a) * radius, y = angle < 0 || angle > Math.PI ? 0 : 2.1 + Math.sin(a) * (height - 2.1 + outer);
      return [p.x - p.tz * lateral, p.y + y + lateral * p.bank, p.z + p.tx * lateral];
    };
    for (let s = from; s < to; s += 4) {
      const end = Math.min(to, s + 4), pos = [], uv = [], idx = [];
      for (const outer of [0, thickness]) for (const t of [s, end]) for (let j = 0; j < cross.length; j++) { pos.push(...point(t, cross[j], outer)); uv.push(j * .4, t / 3); }
      const n = cross.length;
      for (let shell = 0; shell < 2; shell++) for (let j = 0; j < n - 1; j++) { const a = shell * n * 2 + j; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
      for (const row of [0, 1]) for (let j = 0; j < n - 1; j++) { const a = row * n + j; idx.push(a, a + 1, a + 2 * n, a + 1, a + 2 * n + 1, a + 2 * n); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); geos.push(g);
    }
    const shell = mesh(scene, mergeGeometries(geos), material); shell.castShadow = true; return shell;
  }
  for (const f of track.features) {
    const yaw = Math.atan2(f.tx, f.tz);
    if (f.type === 'tunnel') {
      arch(f.from, f.to, f.height, concrete);
      for (const s of [f.from, f.to - .9]) arch(s, s + .9, f.height - .03, warning, .65);
      const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffdfa1, emissive: 0xffc86b, emissiveIntensity: 2 });
      for (let s = f.from + 12; s < f.to; s += 24) { const p = track.at(s); const g = group(p.x, p.y, p.z, Math.atan2(p.tx, p.tz)); box(g, lampMaterial, 0, f.height - .15, 0, 1.5, .08, .5); }
    }
    if (f.type === 'cones') {
      const placements = [];
      for (const item of f.items) {
        const n = track.nearest(item.x, item.z), g = group(item.x, n.y + n.lateral * n.bank, item.z, Math.atan2(n.tx, n.tz));
        if (item.kind === 'concrete') { placements.push({ x: item.x, y: g.position.y, z: item.z, yaw: Math.atan2(n.tx, n.tz), sx: 1, sy: 1, sz: 1 }); }
        else {
          box(g, rust, 0, .05, 0, .7, .1, .7);
          mesh(g, new THREE.ConeGeometry(.35, 1, 12), new THREE.MeshStandardMaterial({ color: 0xee6920 }), 0, .55, 0);
          mesh(g, new THREE.CylinderGeometry(.16, .22, .18, 12), new THREE.MeshStandardMaterial({ color: 0xf7edda }), 0, .58, 0);
        }
      }
      instanceParts(scene, barrier, placements);
    }
    if (f.type === 'slot') {
      // 凸出的岩石外轮廓完全落在碰撞矩形内，保留数据规定的三米通道。
      const g = group(f.x, f.y, f.z, yaw);
      instanceParts(g, stone, [-1, 1].map(side => ({ x: side * (f.width / 2 + f.rockRadius), y: -.2, z: 0, sx: 1, sy: 1, sz: 1, yaw: side * .4 })));
    }
    if (f.type === 'ramp') {
      // 坡面贴合已有路面高度；不额外抬高，以免出现视觉坡面与模拟高度不一致。
      const pos = [], uv = [], idx = [], length = f.length;
      for (let i = 0; i <= length; i++) {
        const p = track.at(f.s + i), half = p.w / 2 - .6;
        for (const l of [-half, half]) { pos.push(p.x - p.tz * l, p.y + p.bank * l + .065, p.z + p.tx * l); uv.push(l / 2, i / 3); }
        if (i < length) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(idx); geometry.computeVertexNormals(); mesh(scene, geometry, warning);
    }
    if (f.type === 'gap') for (const [s, direction] of [[f.from, -1], [f.to, 1]]) {
      const p = track.at(s), g = group(p.x, p.y, p.z, Math.atan2(p.tx, p.tz)), verts = [], indices = [];
      // 不规则断口在缺口外侧；桥面顶点不高于原路面，钢筋向下弯折。
      for (let i = 0; i <= 12; i++) {
        const x = (i / 12 - .5) * p.w, edge = direction * (.35 + noise(i, s) * .9);
        verts.push(x, -.08, edge, x, -.9 - noise(i, s, 3) * .4, edge, x, -.08, direction * 4);
        if (i < 12) { const a = i * 3; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a, a + 2, a + 3, a + 2, a + 5, a + 3); }
        const rod = mesh(g, new THREE.CylinderGeometry(.025, .025, 1.5, 5), rust, x, -.25, -direction * .2); rod.rotation.x = Math.PI / 2 + direction * .2;
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); mesh(g, geometry, concrete);
    }
    if (f.type === 'rockfall') {
      const g = new THREE.Group(); scene.add(g);
      if (f.kind === 'tumbleweed') {
        const positions = [];
        for (let i = 0; i < 100; i++) {
          const a = noise(i, 0) * Math.PI * 2, b = noise(i, 9) * Math.PI, r = f.radius * (.6 + noise(i, 4) * .4);
          const x = Math.cos(a) * Math.sin(b) * r, y = Math.cos(b) * r, z = Math.sin(a) * Math.sin(b) * r;
          positions.push(x, y, z, x * .5 + .12, y * .5, z * .5 - .1);
        }
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x746044 })));
      } else {
        const prototype = new THREE.Group(); instanceParts(prototype, rock, [{ x: 0, y: 0, z: 0, scale: f.radius }]); g.add(prototype);
      }
      g.visible = false; moving.push(g);
    }
  }
  for (const f of track.features.filter(f => f.type === 'landmarks')) {
    let x = f.x, z = f.z;
    // 地标也检查其它相邻路段，发卡弯内部可能紧邻另一条路。
    for (let i = 0; i < 24; i++) { const n = track.nearest(x, z); if (n.distance > n.w / 2 + 11) break; x -= f.tz * 4; z += f.tx * 4; }
    const g = group(x, track.heightAt(x, z), z, Math.atan2(f.tx, f.tz)), name = f.name.zh;
    if (/风车/.test(name)) {
      mesh(g, new THREE.CylinderGeometry(1, 1.8, 9, 10), concrete, 0, 4.5, 0);
      mesh(g, new THREE.ConeGeometry(2, 2, 8), rust, 0, 10, 0);
      const fan = new THREE.Group(); fan.position.set(0, 8, 1.4); g.add(fan);
      for (const a of [0, Math.PI / 2]) { const blade = box(fan, wood, 0, 0, 0, .6, 10, .18); blade.rotation.z = a; } fans.push(fan);
    } else if (/塔|小屋|谷仓|船屋/.test(name)) {
      for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) { box(g, wood, x, 3, z, .24, 6, .24); const brace = box(g, wood, x, 2.5, 0, .12, 5, .14); brace.rotation.x = .6; }
      box(g, wood, 0, 5.5, 0, 4, .3, 4); for (const x of [-1.8, 1.8]) box(g, wood, x, 6.4, 0, .12, 1.4, 3.8);
      mesh(g, new THREE.ConeGeometry(3, 1.8, 4), rust, 0, 8, 0).rotation.y = Math.PI / 4;
    } else if (/电线|输电/.test(name)) {
      for (const x of [-2, 2]) box(g, wood, x, 6, 0, .35, 12, .35);
      for (const y of [10, 11.5]) box(g, wood, 0, y, 0, 8, .3, .3);
    } else if (/干草/.test(name)) {
      const hay = new THREE.MeshStandardMaterial({ color: 0xbca764, roughness: 1 });
      for (let i = 0; i < 5; i++) mesh(g, new THREE.CylinderGeometry(1, 1, 2, 12), hay, (i % 3 - 1) * 2.1, i > 2 ? 2.8 : 1, 0).rotation.x = Math.PI / 2;
    } else if (/轮胎/.test(name)) instanceParts(g, tyre, Array.from({ length: 9 }, (_, i) => ({ x: (i % 3 - 1) * 1.1, y: Math.floor(i / 3) * .3, z: 0 })));
    else if (/石|残骸/.test(name)) instanceParts(g, stone, [{ x: -3, y: 0, z: 0, scale: .8 }, { x: 3, y: 0, z: 0, scale: .6 }]);
    else if (/花坛/.test(name)) {
      const flower = new THREE.MeshStandardMaterial({ color: 0xe2b4cf });
      for (let i = 0; i < 24; i++) mesh(g, new THREE.IcosahedronGeometry(.18, 0), flower, (noise(i, 2) - .5) * 6, .4, (noise(i, 8) - .5) * 3);
    } else if (/栅栏|码头/.test(name)) {
      for (let i = -3; i <= 3; i++) box(g, wood, i, 1, 0, .15, 2, .15);
      for (const y of [.6, 1.5]) box(g, wood, 0, y, 0, 7, .15, .15);
    } else { box(g, wood, 0, 1.5, 0, .15, 3, .15); box(g, warning, 0, 3, 0, 2, 1, .12); }
  }
  return { update(snapshot) {
    const car = snapshot.car;
    for (const g of groups) { const distance = Math.hypot(car.x - g.position.x, car.z - g.position.z); g.visible = distance < 700; g.traverse(o => { if (o.isMesh) o.castShadow = distance < 70; }); }
    for (const w of walls) {
      const distance = Math.hypot(car.x - w.x, car.z - w.z);
      if (distance > 800) { w.near.visible = w.far.visible = false; continue; }
      const close = [], distant = [];
      for (const p of w.points) { const d = Math.hypot(car.x - p.x, car.z - p.z); if (d < 22) close.push(p); else if (d < 700) distant.push(p); }
      updateInstances(w.near, close); updateInstances(w.far, distant);
      for (const m of w.near.children) m.castShadow = true;
    }
    for (const m of moving) m.visible = false;
    for (const h of snapshot.hazards) { const m = moving[h.id]; if (!m) continue; m.visible = true; m.position.set(h.x, h.y, h.z); m.rotation.set(snapshot.step / 55, 0, snapshot.step / 45); }
    for (const fan of fans) fan.rotation.z = snapshot.step / 120 * .35;
  } };
}
