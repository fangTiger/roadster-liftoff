import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLTF } from '../../game/assets.js';
import { scatterProps } from './layout.js';
import { restoreNeedles } from './foliage.js';

const cache = new Map();
const triangleCount = root => { let count = 0; root.traverse(o => { if (o.isMesh) count += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }); return count; };
// 一个 GLB 常装有多个并排展示的变体；只选择面数最少的完整变体，避免把整组当成一棵树。
export async function loadPrototype(name, size, { flat = false, axis = 'y', dense = false, maxRadius = Infinity, select } = {}) {
  if (!cache.has(name)) cache.set(name, loadGLTF(`/assets/race/props/${name}.glb`));
  const { scene } = await cache.get(name); scene.updateMatrixWorld(true);
  const roots = scene.children.filter(c => triangleCount(c) > 0).sort((a, b) => triangleCount(a) - triangleCount(b));
  const selected = select ? roots.filter(c => select(c.name)) : [dense ? roots.at(-1) : roots[0]], parts = [];
  for (const root of selected) root.traverse(o => {
    if (!o.isMesh) return;
    const geometry = o.geometry.clone();
    // 量化 glTF 的整型属性必须先展开，否则应用世界变换会再次量化并截断坐标。
    for (const key of ['position', 'normal', 'uv']) {
      const a = geometry.getAttribute(key); if (!a) continue;
      const values = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) values[i * a.itemSize + j] = a.getComponent(i, j);
      geometry.setAttribute(key, new THREE.Float32BufferAttribute(values, a.itemSize));
    }
    geometry.applyMatrix4(o.matrixWorld); if (flat) geometry.rotateX(-Math.PI / 2);
    const material = o.material.clone(); material.envMapIntensity = .5;
    if (material.alphaTest) { material.alphaTest = .45; material.side = THREE.DoubleSide; }
    parts.push({ geometry, material });
  });
  const bounds = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); bounds.union(p.geometry.boundingBox); }
  const dimensions = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const factor = Math.min(size / dimensions[axis], maxRadius / (Math.hypot(dimensions.x, dimensions.z) / 2));
  for (const p of parts) { p.geometry.translate(-center.x, -bounds.min.y, -center.z); p.geometry.scale(factor, factor, factor); p.geometry.computeBoundingSphere(); }
  return parts;
}
// 滚石绕几何中心转动，统一包围球与模拟碰撞半径。
export function centerPrototype(parts, radius = 1) {
  const bounds = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); bounds.union(p.geometry.boundingBox); }
  const center = bounds.getCenter(new THREE.Vector3()); let extent = 0;
  for (const p of parts) {
    const a = p.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) extent = Math.max(extent, Math.hypot(a.getX(i) - center.x, a.getY(i) - center.y, a.getZ(i) - center.z));
  }
  const scale = radius / extent;
  for (const p of parts) { p.geometry.translate(-center.x, -center.y, -center.z); p.geometry.scale(scale, scale, scale); p.geometry.computeBoundingSphere(); }
  return parts;
}
export function instanceParts(parent, parts, placements) {
  const dummy = new THREE.Object3D(), meshes = [];
  for (const { geometry, material } of parts) {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    placements.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.pitch || 0, p.yaw || 0, p.roll || 0); const s = p.scale ?? 1; dummy.scale.set(p.sx ?? s, p.sy ?? s, p.sz ?? s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh);
  }
  return meshes;
}

// 将真实素材烘焙为透明交叉面片，中远景不再重复提交数万片树叶。
function bakeImpostor(renderer, parts, world) {
  const scene = new THREE.Scene(), model = new THREE.Group(); scene.add(model);
  const bounds = new THREE.Box3();
  for (const p of parts) { const m = new THREE.Mesh(p.geometry, p.material); model.add(m); p.geometry.computeBoundingBox(); bounds.union(p.geometry.boundingBox); }
  const size = bounds.getSize(new THREE.Vector3()), height = size.y, width = Math.max(size.x, size.z) * 1.1;
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height * .55, -height * .55, .1, 200);
  camera.position.set(0, height / 2, 50); camera.lookAt(0, height / 2, 0);
  scene.environment = world.environment; scene.environmentIntensity = world.environmentIntensity;
  scene.add(new THREE.HemisphereLight(0xdde8ef, 0x394031, 1));
  const light = new THREE.DirectionalLight(0xfff4e6, 2); light.position.set(-10, 20, 15); scene.add(light);
  const target = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true });
  const oldTarget = renderer.getRenderTarget(), color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(oldTarget); renderer.setClearColor(color, alpha);
  const a = new THREE.PlaneGeometry(width, height * 1.1); a.translate(0, height / 2, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: target.texture, alphaTest: .35, side: THREE.DoubleSide });
  return [{ geometry: mergeGeometries([a, b]), material }];
}
const instanceDummy = new THREE.Object3D();
export function updateInstances(group, points) {
  group.visible = points.length > 0;
  for (const mesh of group.children) {
    mesh.count = points.length;
    points.forEach((p, i) => { instanceDummy.position.set(p.x, p.y, p.z); instanceDummy.rotation.set(0, p.yaw, 0); instanceDummy.scale.setScalar(p.scale ?? 1); instanceDummy.updateMatrix(); mesh.setMatrixAt(i, instanceDummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export async function createProps(scene, track, { mobile = false, renderer } = {}) {
  const kinds = {
    fir: ['fir_tree_01', 14], pine: ['pine_sapling_medium', 9], shrub: ['shrub_02', 1.3],
    largePine: ['pine_tree_01', 18], firSapling: ['fir_sapling_medium', 4.5],
    stone: ['stone_01', 1.1], shrub4: ['shrub_04', 1.2], trunk: ['dead_tree_trunk_02', 1],
    pole: ['modular_electricity_poles', 10], fence: ['modular_chainlink_fence', 2.4],
    rockFace: ['rock_face_01', 8], mountainside: ['mountainside', 12],
    stump: ['tree_stump_01', .8], moss: ['rock_moss_set_01', 1.6], boulder: ['rock_09', 4],
  };
  const radii = { fir: 4.5, pine: 4.5, largePine: 4.5, firSapling: 2.4, stone: 1.7, shrub4: 1.7, trunk: 3.1, pole: 3.9, fence: 2, rockFace: 4.9, mountainside: 6.9, boulder: 3.7, moss: 1.9 };
  const prototypes = Object.fromEntries(await Promise.all(Object.entries(kinds).map(async ([key, [name, height]]) => [key, await loadPrototype(name, height, {
    dense: ['fir', 'pine', 'largePine', 'firSapling'].includes(key), maxRadius: radii[key] ?? 1.3,
    // 模块包必须选完整预设，不能把面数最少的螺母或卡扣当成地标。
    select: key === 'pole' ? name => name.startsWith('preset_02_') : key === 'fence' ? name => name === 'modular_chainlink_fence_double' || name === 'modular_chainlink_fence_end_01' : undefined,
  })])));
  for (const kind of ['fir', 'pine', 'largePine', 'firSapling']) prototypes[kind] = restoreNeedles(prototypes[kind], kinds[kind][1], radii[kind]);
  const solidKinds = new Set(['pole', 'fence']);
  const billboards = Object.fromEntries(Object.entries(prototypes).map(([kind, parts]) => [kind, solidKinds.has(kind) ? parts : bakeImpostor(renderer, parts, scene)]));
  const buckets = new Map();
  for (const point of scatterProps(track, mobile)) {
    const key = `${Math.floor(point.x / 256)},${Math.floor(point.z / 256)},${point.kind}`;
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(point);
  }
  const chunks = [];
  for (const points of buckets.values()) {
    const group = new THREE.Group(), near = new THREE.Group(), far = new THREE.Group();
    const center = { x: Math.floor(points[0].x / 256) * 256 + 128, z: Math.floor(points[0].z / 256) * 256 + 128 };
    instanceParts(near, prototypes[points[0].kind], points); instanceParts(far, billboards[points[0].kind], points);
    group.add(near, far); scene.add(group); chunks.push({ group, near, far, center, points });
  }
  return { update(car) {
    for (const { group, near, far, center, points } of chunks) {
      const distance = Math.hypot(car.x - center.x, car.z - center.z);
      group.visible = distance < (mobile ? 420 : 700);
      if (!group.visible) continue;
      const close = [], distant = [];
      for (const p of points) { const d = Math.hypot(car.x - p.x, car.z - p.z); if (d > (mobile ? 420 : 700)) continue; (d < (mobile ? 35 : 60) ? close : distant).push(p); }
      updateInstances(near, close); updateInstances(far, distant);
      for (const mesh of near.children) mesh.castShadow = true;
    }
  }, count: [...buckets.values()].reduce((sum, p) => sum + p.length, 0) };
}
