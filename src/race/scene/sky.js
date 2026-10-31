// 竞速模式的天空与光照：Poly Haven 实拍全景，16K HDR 按与渲染器相同的 ACES 曝光烘焙成分块（scripts/race/bake-sky.mjs）。
// 先显示 4K 预览，地平线以上 4 块 4096²、以下 4 块 2048² 加载完逐块替换，避开单张贴图的尺寸上限；
// 环境光与车漆反射用同一全景的 2K HDR，太阳方向取 HDR 最亮点。
import * as THREE from 'three';
import { loadHDR } from '../../game/assets.js';
const R = 1500;
// fog：远景雾色；tint：路外草地 / 开阔平地的染色（配合各张图的地面颜色）；disc：纯天空全景没有地面，铺一大片延伸到地平线的草地；
// faceSun：把全景转到太阳位于发车方向（+z）偏这么多弧度处，一出发就迎着夕阳 / 朝霞开；
// env：环境光强度（这几张全景整体偏亮，白车会过曝）；sun：太阳光强度与颜色
export const SKIES = {
  sunset: { label: '晚霞天空', source: 'Kloppenheim 06 (Pure Sky)', fog: '#cfc4c0', tint: [0x9fbf6e, 0xaecb7a], disc: true, faceSun: .35, env: .65, sun: [2.2, '#ffd2a8'] },
  dawn: { label: '山谷黎明', source: 'Kiara 1 Dawn', fog: '#b39aa8', tint: [0xc49686, 0xcea392], faceSun: .3, env: .6, sun: [2.2, '#ffc6c0'] },
};
export const DEFAULT_SKY = 'sunset';
// 太阳方向：只在地平线以上找最亮的像素（黄昏时太阳很低，全图最亮点可能是地面或湖面的反光）
function findSun(hdr) {
  const { data, width, height } = hdr.image, stride = data.length / (width * height), half = data instanceof Uint16Array;
  const f = v => half ? THREE.DataUtils.fromHalfFloat(v) : v;
  let best = -1, bi = 0;
  for (let y = 0; y < Math.floor(height * .49); y++) for (let x = 0; x < width; x += 2) {
    const i = y * width + x, l = f(data[i * stride]) + f(data[i * stride + 1]) + f(data[i * stride + 2]);
    if (l > best) { best = l; bi = i; }
  }
  // 与 game/assets.js 的 loadHDR 相同的经纬度换算（数据第 0 行是天顶，只扫上半部分即地平线以上）
  const u = (bi % width) / width, v = 1 - Math.floor(bi / width) / height, phi = (u - .5) * Math.PI * 2, el = (v - .5) * Math.PI;
  return new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el));
}
export async function createSky(scene, renderer, key = DEFAULT_SKY) {
  const cfg = SKIES[key] || SKIES[DEFAULT_SKY], base = `/assets/race/sky/${SKIES[key] ? key : DEFAULT_SKY}/`;
  const { hdr } = await loadHDR(base + 'env_2k.hdr'), sunDir = findSun(hdr);
  // 绕竖轴转 rotation 后，方向角 atan2(x, z) 增加 rotation
  const rotation = cfg.faceSun === undefined ? 0 : cfg.faceSun - Math.atan2(sunDir.x, sunDir.z);
  scene.environment = hdr; scene.environmentRotation.y = rotation; scene.environmentIntensity = cfg.env ?? 1; scene.background = null;
  sunDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  scene.fog = new THREE.FogExp2(cfg.fog, .00055);
  const tl = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  const mat = map => new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, toneMapped: false, fog: false, depthWrite: false });
  // 球面贴图与环境贴图的经度方向相反，沿 z 镜像后两者对齐（背景里的太阳和真实光照同一方向）
  const sky = new THREE.Group(); sky.scale.z = -1; sky.rotation.y = rotation; sky.renderOrder = -1; scene.add(sky);
  const preview = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), mat(tex(await tl.loadAsync(base + 'sky-preview.jpg'))));
  preview.frustumCulled = false; sky.add(preview);
  let pending = 8;
  for (const [row, name] of [[0, 'top'], [1, 'bottom']]) for (let i = 0; i < 4; i++) {
    tl.loadAsync(`${base}sky-${name}-${i}.jpg`).then(t => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R - 5, 32, 24, i * Math.PI / 2, Math.PI / 2, row * Math.PI / 2, Math.PI / 2), mat(tex(t)));
      m.frustumCulled = false; sky.add(m);
      if (--pending === 0) preview.visible = false;
    }).catch(() => {});
  }
  // 纯天空：地平线以下是天空的倒影，铺一大片草地盖住，边缘交给雾
  let disc = null;
  if (cfg.disc) {
    const grass = tl.load('/assets/tex/grass_ground_diff.webp'); grass.colorSpace = THREE.SRGBColorSpace; grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(600, 600); grass.anisotropy = 8;
    disc = new THREE.Mesh(new THREE.CircleGeometry(4200, 64), new THREE.MeshStandardMaterial({ map: grass, color: cfg.tint[0], roughness: 1 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -1.2; disc.receiveShadow = true; scene.add(disc);
  }
  const [sunPower, sunColor] = cfg.sun || [3.2, '#fff4e6'], sun = new THREE.DirectionalLight(sunColor, sunPower); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0002; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 160 }); scene.add(sun, sun.target);
  // 每帧把天空球和阴影相机挪到车旁；大地面跟着镜头水平移动
  function update(camera, car) { sky.position.copy(camera.position); sun.target.position.copy(car); sun.position.copy(car).addScaledVector(sunDir, 80); if (disc) disc.position.set(camera.position.x, -1.2, camera.position.z); }
  return { update, sunDir, tint: cfg.tint };
}
