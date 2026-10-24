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

const INV_ACES = `
      vec3 invACES(vec3 c){
        vec3 y=clamp(invOut*c,0.,.995);
        vec3 A=1.-.983729*y, B=.0245786-.4329510*y, C=-(.000090537+.238081*y);
        vec3 v=(-B+sqrt(max(B*B-4.*A*C,0.)))/(2.*A);
        return max(invIn*v,0.)/(exposure/.6);
      }`;

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
  const shared = { bg: { value: bg }, hi: { value: hi }, rect: { value: HI_RECT }, invIn: { value: invIn }, invOut: { value: invOut }, exposure: { value: renderer.toneMappingExposure } };
  return new THREE.ShaderMaterial({
    depthWrite: false, fog: false, uniforms: shared,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D bg, hi; uniform vec4 rect; uniform mat3 invIn, invOut; uniform float exposure; varying vec2 vUv;
${INV_ACES}
      void main(){
        vec3 c=texture2D(bg,vUv).rgb;
        vec2 p=vec2((vUv.x-rect.x)/(rect.y-rect.x),(vUv.y-rect.z)/(rect.w-rect.z));
        if(p.x>0.&&p.x<1.&&p.y>0.&&p.y<1.){ float e=min(min(p.x,1.-p.x),min(p.y,1.-p.y)); c=mix(c,texture2D(hi,p).rgb,smoothstep(0.,.03,e)); }
        gl_FragColor=vec4(min(invACES(c),vec3(40.)),1.);
      }`,
  });
}

export async function createDesert(scene, renderer) {
  // 沙漠里的所有物体都挂在 root 下，飞上太空时整组隐藏
  const root = new THREE.Group(); const sceneRef = scene; scene = root; sceneRef.add(root);
  const { hdr, sunDir } = await loadHDR('/assets/hdri/goegap_road_2k.hdr');
  sunDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ROT);
  sceneRef.environment = hdr; sceneRef.environmentRotation.y = ROT;
  const fog = new THREE.FogExp2('#c4b293', .0011);    // 远景薄雾，让铺设的地面融进照片
  sceneRef.fog = fog;
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
  // 中央虚线：3 米实线 + 9 米间隔，随路面一起滚动，是高速时最直观的速度参照
  const dashTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(236,232,220,.92)'; g.fillRect(0, 0, 8, 16); const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, L / 12); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(.13, L), new THREE.MeshStandardMaterial({ map: dashTex, alphaMap: fade, transparent: true, depthWrite: false, roughness: .7 }));
  dash.rotation.x = -Math.PI / 2; dash.position.set(ROAD_X, .016, 80 - L / 2); dash.receiveShadow = true; dash.renderOrder = 2.2;
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
  scene.add(shoulder, road, dash);
  // 流动地面：照片里的地面是静止的，车开起来只有路面窄条在动，看上去像定格。
  // 这里铺一张覆盖到地平线的大平面：底色按全景天空盒的投影从照片里取（与照片地面逐像素一致，远处无缝），
  // 近处把照片模糊成大块色调，再叠上随行驶距离滚动的碎石细节与大尺度明暗斑，让整片地面跟着车速流过
  sky.updateMatrixWorld(true);
  const gu = { ...sky.material.uniforms, skyInv: { value: sky.matrixWorld.clone().invert() }, detail: { value: gravel.map }, scroll: { value: 0 }, detailK: { value: 1 } };
  // 不写深度：爬升时天空穹顶要能像盖住天空盒一样把它雾化掉；地面上的物体自己写深度，不受影响
  const groundMat = new THREE.ShaderMaterial({
    fog: false, depthWrite: false, uniforms: gu,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform sampler2D bg, hi, detail; uniform vec4 rect; uniform mat3 invIn, invOut; uniform mat4 skyInv; uniform float exposure, scroll, detailK; varying vec3 vW;
      ${INV_ACES}
      // 天空盒是 z 轴翻转的球体，按顶点方向取 UV（与 SphereGeometry 的 UV 公式一致）
      vec2 panoUV(vec3 w){ vec3 d=normalize((skyInv*vec4(w,1.)).xyz); return vec2(fract(atan(-d.z,-d.x)/6.28318531),1.-acos(clamp(d.y,-1.,1.))/3.14159265); }
      vec3 photo(vec2 uv, vec2 gx, vec2 gy){
        vec3 c=textureGrad(bg,uv,gx,gy).rgb;
        vec2 sz=vec2(rect.y-rect.x,rect.w-rect.z), p=(uv-rect.xz)/sz;
        if(p.x>0.&&p.x<1.&&p.y>0.&&p.y<1.){ float e=min(min(p.x,1.-p.x),min(p.y,1.-p.y)); c=mix(c,textureGrad(hi,p,gx/sz,gy/sz).rgb,smoothstep(0.,.03,e)); }
        return c;
      }
      float lum(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
      void main(){
        vec2 uv=panoUV(vW);
        vec2 gx=dFdx(uv), gy=dFdy(uv); gx.x-=floor(gx.x+.5); gy.x-=floor(gy.x+.5);   // 跨越全景接缝时修正导数
        float r=length(vW.xz-cameraPosition.xz);
        float near=1.-smoothstep(40.,320.,r);
        float blur=exp2(near*3.5);                                     // 近处把照片模糊约 3.5 级 mip，只留大块色调
        vec3 base=photo(uv,gx*blur,gy*blur);
        // 滚动细节：4 米一格的碎石贴图 + 约 60 米的大尺度明暗斑，只取亮度比值，颜色仍由照片决定
        vec2 q=vec2(vW.x,vW.z-scroll);
        vec3 d0=texture2D(detail,q/4.).rgb, m0=textureLod(detail,vec2(.5),12.).rgb;
        float fine=lum(d0)/max(lum(m0),1e-3);
        float macro=lum(textureLod(detail,q/61.+vec2(.37,.11),3.5).rgb)/max(lum(m0),1e-3);
        float k=detailK*(1.-smoothstep(120.,700.,r));
        float ratio=mix(1.,clamp(fine,.35,1.9),k*.85)*mix(1.,clamp(macro,.6,1.45),k*.9*near);
        gl_FragColor=vec4(min(invACES(base)*ratio,vec3(40.)),1.);
      }`,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1500), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(ROAD_X, -.01, 100 - 750); ground.renderOrder = .5;
  scene.add(ground);
  if (/noflow/.test(location.search)) ground.visible = false;
  if (/noground|noroad/.test(location.search)) road.visible = false;
  if (/noground|noshoulder/.test(location.search)) shoulder.visible = false;
  // 阴影承接面（车影落在路面上）
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .5, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = .016; catcher.receiveShadow = true; catcher.renderOrder = 2.5; scene.add(catcher);

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
    scatter('/assets/props/didelta_spinosa.glb', 520, () => ({ x: sideX(ROAD_HALF + 1.2, 150), z: anyZ(), s: .6 + rnd() * 1.1, r: rnd() * 6.28, span: SPAN })),
    scatter('/assets/props/boulder_01.glb', 70, () => ({ x: sideX(ROAD_HALF + 4, 160), z: anyZ(), s: .25 + rnd() * .55, r: rnd() * 6.28, span: SPAN })),
    scatter('/assets/props/dead_quiver_trunk.glb', 18, () => ({ x: sideX(ROAD_HALF + 6, 110), z: anyZ(), s: .8 + rnd() * .6, r: rnd() * 6.28, span: SPAN })),
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
    for (const tx of [...Object.values(asphalt), dashTex]) tx.offset.y += dz / L * tx.repeat.y;
    for (const tx of Object.values(gravel)) tx.offset.y += dz / LS * tx.repeat.y;
    gu.scroll.value = (gu.scroll.value + dz) % 24400;                   // 4 米与 61 米两种格距的公倍数，取模防止精度丢失
    placeProps();
  }
  placeProps();

  // 太阳与阴影相机跟随车
  // 离地越高，铺设的路面越透明：高处只看照片地面，避免两套透视对不上
  const groundMats = [road.material, dash.material, ...shoulders.map(m => m.material)];
  // 路面是真实 3D 几何，低空悬停时保留；爬升到几十米以上再淡出，交给照片与云层
  function setAltitude(y) { const k = Math.max(0, Math.min(1, 1 - (y - 40) / 80)); for (const m of groundMats) m.opacity = k; road.visible = shoulder.visible = dash.visible = k > .01; }
  function follow(carPos) { sun.target.position.copy(carPos); sun.position.copy(carPos).addScaledVector(sunDir, 60); catcher.position.x = carPos.x; catcher.position.z = carPos.z; }
  // 显示/隐藏整个沙漠：同时切换环境光照贴图与雾
  function setVisible(on) { root.visible = on; sceneRef.fog = on ? fog : null; if (on) { sceneRef.environment = hdr; sceneRef.environmentRotation.y = ROT; sceneRef.background = null; } }
  return { root, advance, follow, setAltitude, setVisible, fog, sunDir, ROAD_X, ROAD_HALF };
}
