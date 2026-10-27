// 竞速模式的天空与光照：瑞士阿尔卑斯山谷实拍全景（Poly Haven「Alps Field」）
// - 背景：16K HDR 按与渲染器相同的 ACES 曝光烘焙成分块（scripts/race/bake-sky.mjs）；先显示 4K 预览，
//   地平线以上 4 块 4096²、以下 4 块 2048² 加载完逐块替换，避开单张贴图的尺寸上限
// - 环境光与车漆反射：同一全景的 2K HDR；太阳方向取 HDR 最亮点
import * as THREE from 'three';
import { loadHDR } from '../../game/assets.js';
const BASE = '/assets/race/sky/', R = 1500;
export async function createDesertSky(scene, renderer, { rotation = 0 } = {}) {
  const { hdr, sunDir } = await loadHDR(BASE + 'alps_field_2k.hdr');
  scene.environment = hdr; scene.environmentRotation.y = rotation; scene.background = null;
  sunDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  scene.fog = new THREE.FogExp2('#b9c7d6', .00055);
  const tl = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  const mat = map => new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, toneMapped: false, fog: false, depthWrite: false });
  // 球面贴图与环境贴图的经度方向相反，沿 z 镜像后两者对齐（背景里的太阳和真实光照同一方向）
  const sky = new THREE.Group(); sky.scale.z = -1; sky.rotation.y = rotation; sky.renderOrder = -1; scene.add(sky);
  const preview = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), mat(tex(await tl.loadAsync(BASE + 'sky-preview.jpg'))));
  preview.frustumCulled = false; sky.add(preview);
  // 高清分块：加载完成后显示在预览球内侧（半径略小），全部到齐后隐藏预览
  let pending = 8;
  for (const [row, name] of [[0, 'top'], [1, 'bottom']]) for (let i = 0; i < 4; i++) {
    tl.loadAsync(`${BASE}sky-${name}-${i}.jpg`).then(t => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R - 5, 32, 24, i * Math.PI / 2, Math.PI / 2, row * Math.PI / 2, Math.PI / 2), mat(tex(t)));
      m.frustumCulled = false; sky.add(m);
      if (--pending === 0) preview.visible = false;
    }).catch(() => {});
  }
  const sun = new THREE.DirectionalLight('#fff4e6', 3.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0002; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 160 }); scene.add(sun, sun.target);
  // 每帧把天空球和阴影相机挪到车旁
  function update(camera, car) { sky.position.copy(camera.position); sun.target.position.copy(car); sun.position.copy(car).addScaledVector(sunDir, 80); }
  return { update, sunDir };
}
