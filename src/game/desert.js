// 沙漠公路世界：实拍 HDR 做天空/光照/远景，车周围换成可滚动的真实路面，路边灌木、石头、反光桩循环流动
import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { loadHDR, loadGLTF, loadPBR } from './assets.js';

const ROT = 1.257;          // 旋转全景，让照片里的公路沿 -Z 延伸
const ROAD_X = .55;         // 照片里公路中心相对原点的横向偏移
const ROAD_HALF = 4.2;      // 路面半宽（米）
const SPAN = 420;           // 路边物体循环的纵向长度

let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

// 径向渐隐贴图：近处不透明，远处透明，交给实拍地面接管
function fadeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.12, '#fff'); gr.addColorStop(.97, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0); side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(.12, 'rgba(0,0,0,0)'); side.addColorStop(.88, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c); return t;
}

// 背景材质：JPG 已按 ACES（曝光 0.85）映射过，后期链还会再做一次色调映射，
// 所以这里先做 ACES 逆运算还原成线性亮度，最终画面颜色与 JPG 一致
const HI_RECT = new THREE.Vector4(.24164, .65833, 1 - .61108, 1 - .27771);   // 前方高清块在全景 UV 中的范围 (u0, u1, v0, v1)
async function createSkyMaterial(renderer) {
  const loader = new THREE.TextureLoader();
  const [bg, hi] = await Promise.all(['goegap_bg_8k.jpg', 'goegap_front_16k.jpg'].map(f => loader.loadAsync('/assets/hdri/' + f)));
  for (const tx of [bg, hi]) { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  hi.wrapS = hi.wrapT = THREE.ClampToEdgeWrapping;
  const cols = cs => new THREE.Matrix3().set(cs[0][0], cs[1][0], cs[2][0], cs[0][1], cs[1][1], cs[2][1], cs[0][2], cs[1][2], cs[2][2]);
  const invIn = cols([[.59719, .07600, .02840], [.35458, .90834, .13383], [.04823, .01566, .83777]]).invert();
  const invOut = cols([[1.60475, -.10208, -.00327], [-.53108, 1.10813, -.07276], [-.07367, -.00605, 1.07602]]).invert();
  return new THREE.ShaderMaterial({
    depthWrite: false, fog: false,
    uniforms: { bg: { value: bg }, hi: { value: hi }, rect: { value: HI_RECT }, invIn: { value: invIn }, invOut: { value: invOut }, exposure: { value: renderer.toneMappingExposure } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D bg, hi; uniform vec4 rect; uniform mat3 invIn, invOut; uniform float exposure; varying vec2 vUv;
      vec3 invACES(vec3 c){
        vec3 y=clamp(invOut*c,0.,.995);
        vec3 A=1.-.983729*y, B=.0245786-.4329510*y, C=-(.000090537+.238081*y);
        vec3 v=(-B+sqrt(max(B*B-4.*A*C,0.)))/(2.*A);
        return max(invIn*v,0.)/(exposure/.6);
      }
      void main(){
        vec3 c=texture2D(bg,vUv).rgb;
        vec2 p=vec2((vUv.x-rect.x)/(rect.y-rect.x),(vUv.y-rect.z)/(rect.w-rect.z));
        if(p.x>0.&&p.x<1.&&p.y>0.&&p.y<1.){ float e=min(min(p.x,1.-p.x),min(p.y,1.-p.y)); c=mix(c,texture2D(hi,p).rgb,smoothstep(0.,.03,e)); }
        gl_FragColor=vec4(min(invACES(c),vec3(40.)),1.);
      }`,
  });
}

export async function createDesert(scene, renderer) {
  const { hdr, sunDir } = await loadHDR('/assets/hdri/goegap_road_2k.hdr');
  sunDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ROT);
  scene.environment = hdr; scene.environmentRotation.y = ROT;
  scene.fog = new THREE.FogExp2('#c4b293', .0011);     // 远景薄雾，让铺设的地面融进照片
  // 背景：光照/反射用 2K HDR；画面背景用自己做过 ACES 色调映射的 8K 全景 + 前方 16K 高清块
  const sky = new GroundedSkybox(hdr, 1.6, 1200, 256); sky.position.y = 1.59; sky.rotation.y = ROT;
  sky.material = await createSkyMaterial(renderer); scene.add(sky);

  const sun = new THREE.DirectionalLight('#fff0dc', 3.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0002; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 路面与路肩：贴图随行驶距离滚动，透明度只看几何 UV（不随滚动）
  const fade = fadeTexture();
  const L = 900;                         // 平面纵向覆盖 [-820, +80]，远端渐隐到地平线
  const asphalt = await loadPBR('/assets/tex/asphalt_02', [2, L / 4]);
  const gravel = await loadPBR('/assets/tex/dry_ground_rocks', [1.5, 140 / 4]);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, L), new THREE.MeshStandardMaterial({ ...asphalt, color: '#b9b4ad', roughness: 1, alphaMap: fade, transparent: true, depthWrite: false }));
  road.rotation.x = -Math.PI / 2; road.position.set(ROAD_X, .012, 80 - L / 2); road.receiveShadow = true; road.renderOrder = 2;
  // 路肩：只在路面两侧各铺 6 米的窄条，向外渐隐，让车旁的地面也跟着流动；更远处交给照片里的真实地面
  const LS = 140, SW = 6;
  const edgeFade = flip => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(flip ? 1 : 0, 'rgba(255,255,255,0)'); h.addColorStop(flip ? 0 : 1, 'rgba(255,255,255,.85)');
    g.fillStyle = h; g.fillRect(0, 0, 64, 256);
    const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(.3, 'rgba(0,0,0,0)'); v.addColorStop(.97, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c); };
  const shoulders = [-1, 1].map(side => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SW, LS), new THREE.MeshStandardMaterial({ ...gravel, color: '#cdb99c', roughness: 1, alphaMap: edgeFade(side > 0), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X + side * (ROAD_HALF + SW / 2 - .3), .006, 80 - LS / 2); m.receiveShadow = true; m.renderOrder = 1; return m;
  });
  const shoulder = new THREE.Group(); shoulder.add(...shoulders);
  scene.add(shoulder, road);
  if (/noground|noroad/.test(location.search)) road.visible = false;
  if (/noground|noshoulder/.test(location.search)) shoulder.visible = false;
  // 阴影承接面（车影落在路面上）
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .5 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = .016; catcher.receiveShadow = true; scene.add(catcher);

  // 路边物体：灌木、石头、枯树干、反光桩；实例化渲染，车往前开时它们向 +Z 流动，越过车后方回收到远处
  const groups = [];                     // { inst, items, y }
  const movers = new Set();              // 去重后的可移动条目 { x, z, s, r, span }
  const add = (inst, items, y = 0) => { groups.push({ inst, items, y }); items.forEach(it => movers.add(it)); scene.add(inst); };
  async function scatter(url, count, place) {
    const { scene: s } = await loadGLTF(url); let src; s.traverse(o => { if (o.isMesh && !src) src = o; });
    const inst = new THREE.InstancedMesh(src.geometry, src.material, count);
    inst.castShadow = inst.receiveShadow = true; inst.frustumCulled = false;
    add(inst, Array.from({ length: count }, place));
  }
  const sideX = (min, max) => ROAD_X + (rnd() < .5 ? -1 : 1) * (min + Math.pow(rnd(), 1.5) * (max - min));
  const anyZ = () => 60 - rnd() * SPAN;
  await Promise.all([
    scatter('/assets/props/didelta_spinosa.glb', 260, () => ({ x: sideX(ROAD_HALF + 1.2, 60), z: anyZ(), s: .6 + rnd() * 1.1, r: rnd() * 6.28, span: SPAN })),
    scatter('/assets/props/boulder_01.glb', 26, () => ({ x: sideX(ROAD_HALF + 4, 70), z: anyZ(), s: .25 + rnd() * .55, r: rnd() * 6.28, span: SPAN })),
    scatter('/assets/props/dead_quiver_trunk.glb', 10, () => ({ x: sideX(ROAD_HALF + 6, 50), z: anyZ(), s: .8 + rnd() * .6, r: rnd() * 6.28, span: SPAN })),
  ]);
  // 反光桩：每 50 米一对，白桩 + 橙色反光片
  const postGeo = new THREE.BoxGeometry(.1, 1, .1); postGeo.translate(0, .5, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: .6 }), 18);
  const refl = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, .14, .11), new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: .6 }), 18);
  posts.castShadow = true; posts.frustumCulled = refl.frustumCulled = false;
  const postItems = Array.from({ length: 18 }, (_, i) => ({ x: ROAD_X + (i % 2 ? 1 : -1) * (ROAD_HALF + .9), z: 60 - Math.floor(i / 2) * 50, s: 1, r: 0, span: 450 }));
  add(posts, postItems); add(refl, postItems, .85);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function placeProps() {
    for (const { inst, items, y } of groups) {
      items.forEach((it, i) => { P.set(it.x, y, it.z); Q.setFromAxisAngle(UP, it.r); S.setScalar(it.s); inst.setMatrixAt(i, M.compose(P, Q, S)); });
      inst.instanceMatrix.needsUpdate = true;
    }
  }
  // dz：本帧车前进的距离；地面贴图与路边物体一起向 +Z 流动
  function advance(dz) {
    for (const it of movers) { it.z += dz; if (it.z > 60) it.z -= it.span; }
    for (const tx of Object.values(asphalt)) tx.offset.y += dz / L * tx.repeat.y;
    for (const tx of Object.values(gravel)) tx.offset.y += dz / LS * tx.repeat.y;
    placeProps();
  }
  placeProps();

  // 太阳与阴影相机跟随车
  // 离地越高，铺设的路面越透明：高处只看照片地面，避免两套透视对不上
  const groundMats = [road.material, ...shoulders.map(m => m.material)];
  function setAltitude(y) { const k = Math.max(0, 1 - y / 6); for (const m of groundMats) m.opacity = k; road.visible = shoulder.visible = k > .01; }
  function follow(carPos) { sun.target.position.copy(carPos); sun.position.copy(carPos).addScaledVector(sunDir, 60); catcher.position.x = carPos.x; catcher.position.z = carPos.z; }
  return { advance, follow, setAltitude, sunDir, ROAD_X, ROAD_HALF };
}
