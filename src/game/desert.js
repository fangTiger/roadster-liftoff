// 沙漠公路世界：实拍 HDR 做天空/光照/远景，车周围换成可滚动的真实路面，路边灌木、石头、反光桩循环流动
import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { loadHDR, loadGLTF, loadPBR } from './assets.js';
import { ROAD_X, roadCenter, roadSlope } from './road.js';

const ROT = 1.257;          // 旋转全景，让照片里的公路沿 -Z 延伸（ROAD_X：照片里公路中心相对原点的横向偏移）
const VERGE = 15;           // 照片里公路连同两侧土路肩的半宽（米），流动地面把这一条换成两侧的草地
const ROAD_HALF = 4.2;      // 路面半宽（米）
const SPAN = 560, BACK = 140;   // 路边物体循环的纵向长度；越过车后方 BACK 米才回收（高空俯视时车后也有景物）

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

  // 路面、虚线、路肩：沿公路曲线铺设的条带，贴图随行驶距离滚动，透明度只看几何 UV（不随滚动）
  const fade = fadeTexture();
  const L = 1800, STEP = 3;              // 条带纵向覆盖 [-1720, +80]，远端渐隐到地平线；每 3 米一排顶点
  const asphalt = await loadPBR('/assets/tex/asphalt_02', [2, L / 4]);
  const SW = 1.2;                        // 路肩宽度：沥青外一窄条压实的土边，再往外就是草地
  const gravel = await loadPBR('/assets/tex/dry_ground_rocks', [SW / 4, L / 4]);
  // 条带几何直接建在世界坐标里，每帧按里程把每一排顶点横移到“路中心 + 偏移”处
  const ribbons = [];
  function ribbon(width, offset, mat, y, order) {
    const geo = new THREE.PlaneGeometry(width, L, 1, Math.round(L / STEP)); geo.rotateX(-Math.PI / 2); geo.translate(offset, 0, 80 - L / 2);
    const pos = geo.attributes.position, base = Float32Array.from({ length: pos.count }, (_, i) => pos.getX(i));
    const m = new THREE.Mesh(geo, mat); m.position.y = y; m.receiveShadow = true; m.renderOrder = order; m.frustumCulled = false;
    ribbons.push({ pos, base }); return m;
  }
  function bendRibbons(D) {
    for (const { pos, base } of ribbons) {
      for (let i = 0; i < pos.count; i += 2) { const c = roadCenter(D - pos.getZ(i)); pos.setX(i, base[i] + c); pos.setX(i + 1, base[i + 1] + c); }
      pos.needsUpdate = true;
    }
  }
  const road = ribbon(ROAD_HALF * 2, 0, new THREE.MeshStandardMaterial({ ...asphalt, color: '#b9b4ad', roughness: 1, alphaMap: fade, transparent: true, depthWrite: false }), .012, 2);
  // 中央虚线：3 米实线 + 9 米间隔，随路面一起滚动，是高速时最直观的速度参照
  const dashTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(236,232,220,.92)'; g.fillRect(0, 0, 8, 16); const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, L / 12); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const dash = ribbon(.13, 0, new THREE.MeshStandardMaterial({ map: dashTex, alphaMap: fade, transparent: true, depthWrite: false, roughness: .7 }), .016, 2.2);
  // 路肩：横向从沥青边缘向草地渐隐，纵向与路面一样两端渐隐
  const edgeFade = flip => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(flip ? 1 : 0, 'rgba(255,255,255,0)'); h.addColorStop(flip ? .3 : .7, 'rgba(255,255,255,.55)'); h.addColorStop(flip ? 0 : 1, 'rgba(255,255,255,.7)');
    g.fillStyle = h; g.fillRect(0, 0, 64, 256);
    const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(.12, 'rgba(0,0,0,0)'); v.addColorStop(.97, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c); };
  const shoulders = [-1, 1].map(side => ribbon(SW, side * (ROAD_HALF + SW / 2 - .2),
    new THREE.MeshStandardMaterial({ ...gravel, color: '#c4ae8c', roughness: 1, alphaMap: edgeFade(side > 0), transparent: true, depthWrite: false }), .006, 1));
  const shoulder = new THREE.Group(); shoulder.add(...shoulders);
  scene.add(shoulder, road, dash);
  // 流动地面：照片里的地面是静止的，车开起来只有路面窄条在动，看上去像定格。
  // 这里铺一张跟随镜头、覆盖到地平线的大平面：底色按全景天空盒的投影从照片里取（与照片地面逐像素一致，远处无缝）；
  // 照片里的直路连同土路肩换成两侧草地的颜色（3D 公路会拐弯，不能再留一条照片里的直路）；
  // 近处把照片模糊成大块色调，再叠上随行驶距离滚动的干草地细节与航拍尺度的草地/碎石斑块，让整片地面跟着车速流过。
  // 照片只在离地两米的视角下成立：升空后照片地面被径向拉成条纹，改为以草地贴图为主、照片只提供大块色调，远处融进雾霭
  sky.updateMatrixWorld(true);
  const tl = new THREE.TextureLoader();
  const [grassTex, aerialTex] = await Promise.all(['grass_ground', 'aerial_grass_rock'].map(n => tl.loadAsync(`/assets/tex/${n}_diff.webp`)));
  for (const t of [grassTex, aerialTex]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  const gu = { ...sky.material.uniforms, skyInv: { value: sky.matrixWorld.clone().invert() }, grass: { value: grassTex }, aerial: { value: aerialTex },
    so: { value: Array.from({ length: 5 }, () => new THREE.Vector2()) }, roadX: { value: ROAD_X }, verge: { value: VERGE }, haze: { value: new THREE.Color('#b1b4b4') }, hazeK: { value: 0 },
    grassL: { value: new THREE.Color() }, grassR: { value: new THREE.Color() } };
  // 两侧草地的平均色：照片是站在路中间拍的，车旁十几米内全是沥青和土路肩（右侧逆光处是一片沙土），近处没法直接用照片。
  // 这里取照片里公路两侧 40–120 米、前方 60–250 米那片草地的平均色，近处地面用它铺底，和远处照片里的草地一致
  {
    const img = sky.material.uniforms.bg.value.image, W = 1024, H = 512;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g2 = cv.getContext('2d', { willReadFrequently: true }); g2.drawImage(img, 0, 0, W, H);
    const px = g2.getImageData(0, 0, W, H).data, inv = gu.skyInv.value, w = new THREE.Vector3();
    for (const [side, col] of [[-1, gu.grassL.value], [1, gu.grassR.value]]) {
      const acc = [0, 0, 0]; let n = 0;
      for (let x = 40; x <= 120; x += 8) for (let z = 60; z <= 250; z += 10) {
        const d = w.set(ROAD_X + side * x, 0, -z).applyMatrix4(inv).normalize();
        const u = ((Math.atan2(-d.z, -d.x) / (Math.PI * 2)) % 1 + 1) % 1, v = 1 - Math.acos(d.y) / Math.PI;
        const i = (Math.min(H - 1, Math.floor((1 - v) * H)) * W + Math.min(W - 1, Math.floor(u * W))) * 4;
        for (let c = 0; c < 3; c++) acc[c] += Math.pow(px[i + c] / 255, 2.2); n++;     // 在线性空间里求平均
      }
      col.setRGB(acc[0] / n, acc[1] / n, acc[2] / n, THREE.LinearSRGBColorSpace);
    }
  }
  // 不写深度：爬升时天空穹顶要能盖住地平线附近的地面；地面上的物体自己写深度，不受影响
  const groundMat = new THREE.ShaderMaterial({
    fog: false, depthWrite: false, uniforms: gu,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform sampler2D bg, hi, grass, aerial; uniform vec4 rect; uniform mat3 invIn, invOut; uniform mat4 skyInv;
      uniform float exposure, roadX, verge, hazeK; uniform vec2 so[5]; uniform vec3 haze, grassL, grassR; varying vec3 vW;
      ${INV_ACES}
      // 天空盒是 z 轴翻转的球体，按顶点方向取 UV（与 SphereGeometry 的 UV 公式一致）
      vec2 panoUV(vec3 w){ vec3 d=normalize((skyInv*vec4(w,1.)).xyz); return vec2(fract(atan(-d.z,-d.x)/6.28318531),1.-acos(clamp(d.y,-1.,1.))/3.14159265); }
      vec3 photo(vec2 uv, vec2 gx, vec2 gy){
        vec3 c=textureGrad(bg,uv,gx,gy).rgb;
        vec2 sz=vec2(rect.y-rect.x,rect.w-rect.z), p=(uv-rect.xz)/sz;
        if(p.x>0.&&p.x<1.&&p.y>0.&&p.y<1.){ float e=min(min(p.x,1.-p.x),min(p.y,1.-p.y)); c=mix(c,textureGrad(hi,p,gx/sz,gy/sz).rgb,smoothstep(0.,.03,e)); }
        return c;
      }
      // 照片在 w 处的地面颜色；照片里的公路和土路肩那一条，改取两侧更外面的草地
      vec3 field(vec3 w, vec2 gx, vec2 gy){
        float dx=w.x-roadX, ad=abs(dx);
        vec3 c=photo(panoUV(w),gx,gy);
        float k=1.-smoothstep(verge-3.,verge+2.,ad);
        if(k>0.){
          float o=verge+4.+ad*.35;
          vec3 l=photo(panoUV(vec3(roadX-o,w.y,w.z)),gx,gy), r=photo(panoUV(vec3(roadX+o,w.y,w.z)),gx,gy);
          c=mix(c,mix(l,r,smoothstep(-6.,6.,dx)),k);
        }
        return c;
      }
      void main(){
        vec2 uv=panoUV(vW);
        vec2 gx=dFdx(uv), gy=dFdy(uv); gx.x-=floor(gx.x+.5); gy.x-=floor(gy.x+.5);   // 跨越全景接缝时修正导数
        float dist=length(vW-cameraPosition);
        float air=smoothstep(4.,60.,cameraPosition.y);                 // 0：贴地视角，1：航拍视角（照片离地几米就开始失真）
        float near=1.-smoothstep(40.,320.,dist);
        float blur=exp2(max(near*3.5,air*5.));                          // 近处/高空把照片模糊成大块色调
        vec3 base=field(vW,gx*blur,gy*blur);
        // 近处（以及高空俯瞰时）改用两侧草地的平均色铺底，远处过渡回照片
        float sw=mix(30.,700.,air);                                     // 高空时两侧色差拉成大范围的渐变，不出现分界线
        vec3 pal=mix(grassL,grassR,smoothstep(-sw,sw,vW.x-roadX));
        base=mix(base,pal,max(1.-smoothstep(70.,260.,dist),air));
        // 细节只取颜色比值（贴图 ÷ 贴图平均色），整体色调仍由照片决定：2.5 米一格的干草地、15 米与 170 米两种尺度的草地碎石斑块
        vec2 q=vW.xz;
        vec3 mg=max(textureLod(grass,vec2(.5),12.).rgb,vec3(1e-3)), ma=max(textureLod(aerial,vec2(.5),12.).rgb,vec3(1e-3));
        vec3 fine=texture2D(grass,q/2.5+so[0]).rgb/mg;
        // 同一张贴图按互不整除的尺度、不同角度各取一次再平均，高空俯瞰时看不出重复的方格
        vec3 mid=(texture2D(aerial,q/15.+so[1]).rgb+texture2D(aerial,mat2(.6,.8,-.8,.6)*q/23.7+so[2]).rgb)*.5/ma;
        vec3 mac=(texture2D(aerial,mat2(.8,-.6,.6,.8)*q/170.+so[3]).rgb/ma+texture2D(grass,mat2(.28,.96,-.96,.28)*q/61.+so[4]).rgb/mg)*.5;
        float kf=1.-smoothstep(25.,180.,dist), km=1.-smoothstep(300.,4000.,dist), kM=1.-smoothstep(1500.,20000.,dist);
        vec3 ratio=mix(vec3(1.),clamp(fine,.25,2.2),kf*.9)
                  *mix(vec3(1.),clamp(mid,.35,2.),km*mix(.4,.6,air))
                  *mix(vec3(1.),clamp(mac,.5,1.7),kM*mix(.25,.8,air));
        vec3 lin=min(invACES(base)*ratio,vec3(40.));
        // 高空的空气透视：越远越融进与天空穹顶地平线同色的雾霭
        lin=mix(lin,invACES(haze),hazeK*(1.-exp(-dist/7000.)));
        gl_FragColor=vec4(lin,1.);
      }`,
  });
  // 4 万米见方、跟随镜头；着色全按世界坐标计算，平面移动不影响画面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 80, 80), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(ROAD_X, -.01, 0); ground.renderOrder = .5; ground.frustumCulled = false;
  scene.add(ground);
  if (/noflow/.test(location.search)) ground.visible = false;
  if (/noground|noroad/.test(location.search)) road.visible = false;
  if (/noground|noshoulder/.test(location.search)) shoulder.visible = false;
  // 阴影承接面（车影落在路面上）
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .5, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = .016; catcher.receiveShadow = true; catcher.renderOrder = 2.5; scene.add(catcher);

  // 路边物体：灌木、石头、枯树干、反光桩；实例化渲染，车往前开时它们向 +Z 流动，越过车后方回收到远处
  const groups = [];                     // { inst, items, y }
  const movers = new Set();              // 去重后的可移动条目 { off, x, z, s, r, span }：off 是相对路中心的横向偏移，x 在生成/回收时按弯道算好后固定
  const add = (inst, items, y = 0) => { groups.push({ inst, items, y }); items.forEach(it => movers.add(it)); scene.add(inst); };
  async function scatter(url, count, place) {
    const { scene: s } = await loadGLTF(url); let src; s.traverse(o => { if (o.isMesh && !src) src = o; });
    const inst = new THREE.InstancedMesh(src.geometry, src.material, count);
    inst.castShadow = inst.receiveShadow = true; inst.frustumCulled = false;
    add(inst, Array.from({ length: count }, place));
  }
  const sideX = (min, max) => (rnd() < .5 ? -1 : 1) * (min + Math.pow(rnd(), 1.5) * (max - min));
  const anyZ = () => BACK - rnd() * SPAN;
  await Promise.all([
    scatter('/assets/props/didelta_spinosa.glb', 680, () => ({ off: sideX(ROAD_HALF + SW + .6, 150), z: anyZ(), s: .6 + rnd() * 1.1, r: rnd() * 6.28, span: SPAN })),
    scatter('/assets/props/boulder_01.glb', 70, () => ({ off: sideX(ROAD_HALF + 4, 160), z: anyZ(), s: .25 + rnd() * .55, r: rnd() * 6.28, span: SPAN })),
    scatter('/assets/props/dead_quiver_trunk.glb', 18, () => ({ off: sideX(ROAD_HALF + 6, 110), z: anyZ(), s: .8 + rnd() * .6, r: rnd() * 6.28, span: SPAN })),
  ]);
  // 反光桩：每 50 米一对，白桩 + 橙色反光片
  const postGeo = new THREE.BoxGeometry(.1, 1, .1); postGeo.translate(0, .5, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: .6 }), 18);
  const refl = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, .14, .11), new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: .6 }), 18);
  posts.castShadow = true; posts.frustumCulled = refl.frustumCulled = false;
  const postItems = Array.from({ length: 18 }, (_, i) => ({ off: (i % 2 ? 1 : -1) * (ROAD_HALF + .9), z: BACK - Math.floor(i / 2) * 50, s: 1, r: 0, span: 450 }));
  add(posts, postItems); add(refl, postItems, .85);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function placeProps() {
    for (const { inst, items, y } of groups) {
      items.forEach((it, i) => { P.set(it.x, y, it.z); Q.setFromAxisAngle(UP, it.r); S.setScalar(it.s); inst.setMatrixAt(i, M.compose(P, Q, S)); });
      inst.instanceMatrix.needsUpdate = true;
    }
  }
  // dz：本帧车前进的距离；地面贴图与路边物体一起向 +Z 流动
  // 地面细节随里程滚动：每张贴图的滚动量在 CPU 上用双精度算好并取小数部分再传给着色器，
  // 着色器里不出现“世界坐标 - 累计里程”这种大数相减，跑多远贴图都不抖。
  // 每项：[贴图坐标矩阵第二列 (c, d)（GLSL mat2 按列存放）, 格距, 固定偏移]，与着色器里五次采样一一对应
  const SO = [[0, 1, 2.5, 0, 0], [0, 1, 15, 0, 0], [-.8, .6, 23.7, .21, .63], [.6, .8, 170, .37, .11], [-.96, .28, 61, .5, .2]];
  const fr = x => x - Math.floor(x);
  function scrollGround(D) { SO.forEach(([c, d, k, ox, oy], i) => gu.so.value[i].set(fr(ox - D * c / k), fr(oy - D * d / k))); }
  scrollGround(0);
  // trackD：世界累计滚动的里程；车所在处（z = 0）的公路里程就是 trackD，z 处是 trackD - z
  let trackD = 0;
  const centerAt = (z = 0) => roadCenter(trackD - z), slopeAt = (z = 0) => roadSlope(trackD - z);
  for (const it of movers) it.x = centerAt(it.z) + it.off;
  function advance(dz) {
    trackD += dz;
    for (const it of movers) { it.z += dz; if (it.z > BACK) { it.z -= it.span; it.x = centerAt(it.z) + it.off; } }
    for (const tx of [...Object.values(asphalt), ...Object.values(gravel), dashTex]) tx.offset.y += dz / L * tx.repeat.y;
    scrollGround(trackD);
    bendRibbons(trackD); placeProps();
  }
  bendRibbons(0); placeProps();

  // 高空的空气透视：地面融进天空穹顶地平线的雾霭色，路面与路边物体的雾随高度变稀（看得见的距离随高度变远）
  const fogCol = fog.color.clone();
  function setAltitude(y, hazeColor) {
    const air = Math.max(0, Math.min(1, (y - 12) / 140));
    gu.hazeK.value = air; if (hazeColor) gu.haze.value.copy(hazeColor);      // 不传颜色时沿用上一次的雾霭色
    fog.density = .0011 / (1 + Math.max(0, y - 10) / 60);
    fog.color.copy(fogCol).lerp(gu.haze.value, air);
  }
  // 太阳与阴影相机跟随车；流动地面跟随镜头
  function follow(carPos, cam) {
    sun.target.position.copy(carPos); sun.position.copy(carPos).addScaledVector(sunDir, 60); catcher.position.x = carPos.x; catcher.position.z = carPos.z;
    if (cam) ground.position.set(cam.position.x, -.01, cam.position.z);
  }
  // 显示/隐藏整个沙漠：同时切换环境光照贴图与雾
  function setVisible(on) { root.visible = on; sceneRef.fog = on ? fog : null; if (on) { sceneRef.environment = hdr; sceneRef.environmentRotation.y = ROT; sceneRef.background = null; } }
  return { root, advance, follow, setAltitude, setVisible, fog, sunDir, centerAt, slopeAt, ROAD_X, ROAD_HALF, get trackD() { return trackD; } };
}
