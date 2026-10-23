// 离地 LIFTOFF 入口（当前为效果验证版，正式开发将按模块拆分）
// 素材：Roadster 2020 模型（CC-BY，metarex.4d）、2008 Roadster 模型（CC-BY，the_86_guy）、Poly Haven 实拍 HDR（CC0）、NASA 地球贴图；详见 CREDITS.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VIEW = (location.search.match(/view=(\w+)/) || [])[1] || 'road';
const DEBUG = location.search.includes('debug');
document.querySelectorAll('#cams span').forEach(s => s.classList.toggle('on', s.dataset.v === VIEW));
const $ = id => document.getElementById(id);
$('camname').textContent = { road: '电影运镜', chase: '追随', lift: '低角跟拍', space: '电影运镜' }[VIEW] || '';
if (VIEW === 'road') document.querySelectorAll('#cams span').forEach(s => s.classList.toggle('on', s.dataset.v === 'space'));
if (VIEW === 'chase') document.querySelectorAll('#cams span').forEach(s => s.classList.toggle('on', s.dataset.v === 'road'));
if (VIEW === 'lift') { $('lt').textContent = '离地高度'; $('lv').innerHTML = '6.2<i>m</i>'; $('alt').textContent = '6 m'; $('tt').textContent = '第一次起飞'; $('ts').textContent = '十个推进器同时点燃'; $('spd').textContent = '186'; }
if (VIEW === 'space') { $('lt').textContent = '轨道高度'; $('lv').innerHTML = '412<i>km</i>'; $('alt').textContent = '412 km'; $('tt').textContent = '与前辈同框'; $('ts').textContent = '在轨道上追上 2018 年的老前辈'; $('spd').textContent = '27,600'; $('speed').style.display = 'none'; $('clock').textContent = '轨道 · 第 1 圈'; }
if (VIEW === 'road' || VIEW === 'chase') $('speed').style.opacity = .6;

const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = VIEW === 'space' ? .75 : VIEW === 'chase' ? .7 : .85;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(VIEW === 'road' ? 34 : 40, W / H, .05, 40000);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 模型经 meshopt 压缩，加载器需要挂解码器
const gltfLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// —— 车：加载、归一化尺寸、车头朝 -Z、黑白涂装 ——
async function loadRoadster() {
  const gltf = await gltfLoader().loadAsync('/assets/models/roadster-2020.glb');
  const car = gltf.scene; car.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(car), size = box.getSize(V()), c = box.getCenter(V());
  const s = 4.4 / Math.max(size.x, size.z); const wrap = new THREE.Group(); car.position.sub(c).multiplyScalar(1); wrap.add(car);
  car.position.set(-c.x, -box.min.y, -c.z); wrap.scale.setScalar(s);
  if (size.x > size.z) wrap.rotation.y = Math.PI / 2;
  wrap.updateMatrixWorld(true);
  // 找车头：前大灯所在一侧
  let head = V(); let n = 0; wrap.traverse(o => { if (o.isMesh && /headlights/.test(o.material.name)) { head.add(new THREE.Box3().setFromObject(o).getCenter(V())); n++; } }); head.divideScalar(n || 1);
  if (head.z > 0) wrap.rotation.y += Math.PI;
  wrap.updateMatrixWorld(true);
  const report = [];
  wrap.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
    const m = o.material, nm = m.name;
    const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(V());
    if (DEBUG) report.push(`${o.name} | ${nm} | ${sz.x.toFixed(2)},${sz.y.toFixed(2)},${sz.z.toFixed(2)} | c ${bb.getCenter(V()).toArray().map(v => v.toFixed(2))}`);
    if (nm === 'car_main_paint') { o.material = new THREE.MeshPhysicalMaterial({ color: '#f4f4f2', metalness: 0, roughness: .22, clearcoat: 1, clearcoatRoughness: .02 }); }
    if (/Glass_Tint_max|Glass_mid_tint/.test(nm)) { o.material = new THREE.MeshPhysicalMaterial({ color: '#050608', metalness: .2, roughness: .02, clearcoat: 1, transparent: true, opacity: .93 }); }
    if (nm === 'calipers') o.material = new THREE.MeshStandardMaterial({ color: '#c9c9c9', metalness: .8, roughness: .35 });
    if (/headlights|Glass_Clear/.test(nm)) { if (o.material.emissive) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#eaf3ff'); o.material.emissiveIntensity = 1.2; } }
    if (/rear_lights/.test(nm)) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#ff1020'); o.material.emissiveIntensity = 3; }
  });
  if (DEBUG) console.log('MESHES\n' + report.join('\n'));
  return wrap;
}

// 推进器尾焰
const flameMat = col => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(col) } },
  vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
  fragmentShader: 'uniform vec3 c; varying vec2 vUv; varying vec3 vN, vV; void main(){ float along=1.-vUv.y; float rim=pow(abs(dot(vN,vV)),1.4); float a=pow(along,1.6)*rim; vec3 col=mix(c,vec3(1.),pow(along,5.)); gl_FragColor=vec4(col*a*1.4,1.); }' });
function thruster(parent, pos, dir, len, r) {
  const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize().negate());
  const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 24, 1, true), flameMat('#9fdcff')); f.position.y = -len / 2; f.rotation.x = Math.PI; g.add(f);
  const core = new THREE.Mesh(new THREE.ConeGeometry(r * .45, len * .4, 16, 1, true), flameMat('#ffffff')); core.position.y = -len * .2; core.rotation.x = Math.PI; g.add(core);
  parent.add(g);
}

let CP = V(0, 0, 0), car;
async function main() {
  if (VIEW !== 'space') {
    const hdr = await new HDRLoader().loadAsync('/assets/hdri/goegap_road_2k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    { const dd = hdr.image.data; if (dd instanceof Uint16Array) { const cap = THREE.DataUtils.toHalfFloat(30000); for (let i = 0; i < dd.length; i++) if ((dd[i] & 0x7C00) === 0x7C00 || (dd[i] < 0x8000 && dd[i] > cap)) dd[i] = cap; } else { for (let i = 0; i < dd.length; i++) if (!isFinite(dd[i]) || dd[i] > 30000) dd[i] = 30000; } }
    // 找太阳：HDR 最亮像素
    const { data, width, height } = hdr.image; let best = 0, bi = 0; const stride = data.length / (width * height);
    const toF = v => (typeof v === 'number' && data instanceof Uint16Array) ? THREE.DataUtils.fromHalfFloat(v) : v;
    for (let i = 0; i < width * height; i += 3) { const l = toF(data[i * stride]) + toF(data[i * stride + 1]) + toF(data[i * stride + 2]); if (l > best) { best = l; bi = i; } }
    const u = (bi % width) / width, v = 1 - Math.floor(bi / width) / height;
    const ROT = +(location.search.match(/rot=([-\d.]+)/) || [0, 1.257])[1];                                         // 让照片里的公路沿 -Z 延伸
    const phi = (u - .5) * Math.PI * 2, el = (v - .5) * Math.PI;
    const sunDir = V(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el)).applyAxisAngle(V(0, 1, 0), ROT);
    scene.environment = hdr; scene.environmentRotation.y = ROT; scene.environmentIntensity = 1;
    const sky = new GroundedSkybox(hdr, 1.6, 90); sky.position.y = 1.6 - .01; sky.rotation.y = ROT; scene.add(sky);
    const sun = new THREE.DirectionalLight('#fff0dc', 3.2); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0002; sun.shadow.normalBias = .02; sun.shadow.radius = 4;
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 120 }); scene.add(sun, sun.target);
    car = await loadRoadster(); scene.add(car);
    const lift = VIEW === 'lift'; CP = V(.55, lift ? 6.2 : 0, 0); car.position.copy(CP); if (lift) car.rotation.set(.05, car.rotation.y + .06, -.04);
    sun.target.position.copy(CP); sun.position.copy(CP).add(sunDir.clone().multiplyScalar(50));
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .55 })); catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.position.y = .002; scene.add(catcher);
    // 接触阴影
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: lift ? .25 : .75, map: (() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 2, 0, 0); const r = g.createRadialGradient(64, 64, 6, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.9)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); })() }));
    ao.rotation.x = -Math.PI / 2; ao.position.set(CP.x, .004, 0); if (lift) ao.scale.setScalar(1.8); scene.add(ao);
    // 推进器：车尾 4 个，腾空时车底 4 个
    const tail = new THREE.Group(); tail.position.copy(CP); if (lift) tail.rotation.set(.05, .06, -.04); scene.add(tail);
    for (const x of [-.5, -.17, .17, .5]) thruster(tail, V(x, .38, 2.2), V(0, 0, 1), lift ? 1.6 : .9, .06);
    if (lift) for (const [x, z] of [[-.75, -1.4], [.75, -1.4], [-.75, 1.4], [.75, 1.4]]) thruster(tail, V(x, .12, z), V(0, -1, 0), 3.2, .1);
    // 扬尘
    const dust = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(200,175,140,.55)'); r.addColorStop(1, 'rgba(200,175,140,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return cv; })());
    let sd = 5; const rr = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < (lift ? 30 : 8); i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dust, transparent: true, depthWrite: false, opacity: .18 + rr() * .2 })); const d = rr();
      s.position.set((rr() - .5) * (2 + d * (lift ? 9 : 4)), lift ? rr() * 1.5 : .2 + d * 1.2, lift ? (rr() - .5) * 6 : 2.3 + d * 9); s.scale.setScalar(.8 + d * (lift ? 4 : 2.6)); scene.add(s); }
  } else {
    // —— 地球轨道 ——
    scene.background = new THREE.Color('#000');
    let sd = 9; const rr = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    const sv = []; for (let i = 0; i < 7000; i++) { const v = V(rr() - .5, rr() - .5, rr() - .5).normalize().multiplyScalar(15000); sv.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.5, sizeAttenuation: false, transparent: true, opacity: .85 })));
    // 光照：太阳硬光 + 地球反照的蓝色补光，背光面接近全黑（真实太空光照）
    const sunDir = V(-.62, .34, -.71).normalize();
    const sun = new THREE.DirectionalLight('#fff8ef', 5.2); sun.position.copy(sunDir).multiplyScalar(60); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0002;
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 200 }); scene.add(sun, sun.target);
    const R = 6400, RA = R * 1.028, EC = V(2600, -R - 900, 3400);
    const earthshine = new THREE.DirectionalLight('#6f9cff', .7); earthshine.position.copy(EC).normalize().multiplyScalar(60); scene.add(earthshine);
    scene.add(new THREE.AmbientLight('#1a2030', .25));
    // 地球：NASA Blue Marble（公有领域）8K 全球 + 东亚 21600 级高清补丁 + 柔和云层（三通道贴图的 B 通道）+ 夜景灯光
    const tl = new THREE.TextureLoader();
    const [surf, patch, clouds, night] = await Promise.all(['bm_surface_8k.jpg', 'bm_patch_eastasia.jpg', 'earth_bump_roughness_clouds_4096.jpg', 'earth_night_4096.jpg'].map(f => tl.loadAsync('/assets/earth/' + f)));
    surf.colorSpace = patch.colorSpace = night.colorSpace = THREE.SRGBColorSpace;
    [surf, patch, clouds, night].forEach(x => { x.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 320, 200), new THREE.ShaderMaterial({
      uniforms: { sd: { value: sunDir }, surf: { value: surf }, hdp: { value: patch }, clouds: { value: clouds }, night: { value: night }, pb: { value: new THREE.Vector4(70, 150, 0, 55) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vW; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 sd; uniform sampler2D surf, hdp, clouds, night; uniform vec4 pb; varying vec2 vUv; varying vec3 vN, vW;
        void main(){
          float lon=vUv.x*360.-180., lat=(vUv.y-.5)*180.;
          vec3 c=texture2D(surf,vUv).rgb;
          vec2 pu=vec2((lon-pb.x)/(pb.y-pb.x),(lat-pb.z)/(pb.w-pb.z));
          if(pu.x>0.&&pu.x<1.&&pu.y>0.&&pu.y<1.){ float e=min(min(pu.x,1.-pu.x),min(pu.y,1.-pu.y)); c=mix(c,texture2D(hdp,pu).rgb,smoothstep(0.,.04,e)); }
          float cl=smoothstep(.12,.95,texture2D(clouds,vUv).b)*.9;
          vec3 N=normalize(vN), Vd=normalize(cameraPosition-vW); float nd=dot(N,sd), dif=max(nd,0.);
          float ocean=smoothstep(.02,.12,c.b-c.r)*(1.-smoothstep(.22,.38,max(c.r,c.g)));
          vec3 col=c*dif*1.7;
          col+=pow(max(dot(reflect(-sd,N),Vd),0.),140.)*ocean*(1.-cl)*vec3(1.,.93,.82)*2.2;
          col=mix(col,vec3(.97,.98,1.)*(dif*1.55+.004),cl);
          col+=texture2D(night,vUv).rgb*vec3(1.,.78,.5)*smoothstep(.04,-.18,nd)*(1.-cl*.8)*1.2;
          float mu=max(dot(N,Vd),0.), haze=pow(1.-mu,2.4);
          col=mix(col,vec3(.32,.58,1.)*(dif*1.2+.03),haze*.55*smoothstep(-.3,.25,nd));
          col+=vec3(1.,.42,.14)*smoothstep(-.18,0.,nd)*smoothstep(.18,0.,nd)*.22;
          col=col*vec3(.92,.96,1.)+vec3(.0,.01,.03)*dif;
          gl_FragColor=vec4(col,1.);
          #include <colorspace_fragment>
        }` }));
    // 让东亚（东经 115°、北纬 32°）朝向镜头前方，且北方大致朝上
    const ll = (lo, la) => { const ph = (lo + 180) / 360 * Math.PI * 2, th = (90 - la) * Math.PI / 180; return V(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); };
    const camP = V(-6.4, 1.9, -8.2), look = V(2.4, -.2, 2.6).sub(camP).normalize();
    const target = camP.clone().add(look.multiplyScalar(5200)).sub(EC).normalize();
    const q1 = new THREE.Quaternion().setFromUnitVectors(ll(124, 24), target);
    const n1 = V(0, 1, 0).applyQuaternion(q1).projectOnPlane(target).normalize(), up = V(0, 1, 0).projectOnPlane(target).normalize();
    const ang = Math.atan2(V().crossVectors(n1, up).dot(target), n1.dot(up));
    earth.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(target, ang).multiply(q1));
    earth.position.copy(EC); scene.add(earth);
    // 大气层：按视线掠过大气的最低高度计算散射亮度，地平线处蓝白、晨昏处偏橙
    const atm = new THREE.Mesh(new THREE.SphereGeometry(RA, 200, 140), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { sd: { value: sunDir }, ec: { value: EC }, r0: { value: R }, r1: { value: RA } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 sd, ec; uniform float r0, r1; varying vec3 vW;
        void main(){
          vec3 rd=normalize(vW-cameraPosition), oc=ec-cameraPosition; float tc=dot(oc,rd); vec3 P=cameraPosition+rd*tc; float h=length(P-ec);
          if(h<r0) discard;
          float alt=(h-r0)/(r1-r0); float dens=exp(-alt*5.5)*(1.-smoothstep(.85,1.,alt));
          vec3 n=normalize(P-ec); float l=dot(n,sd); float lit=smoothstep(-.28,.3,l);
          vec3 col=mix(vec3(1.,.45,.16),vec3(.3,.56,1.),smoothstep(-.05,.35,l));
          col=mix(col,vec3(.85,.93,1.),exp(-alt*14.)*.5);
          gl_FragColor=vec4(col*dens*lit*1.9,1.);
        }` }));
    atm.position.copy(EC); scene.add(atm);
    // 车的反射环境：缩比地球 + 太阳，让车漆倒映出蓝色地球
    const pm = new THREE.PMREMGenerator(renderer); const envS = new THREE.Scene(); envS.background = new THREE.Color('#000');
    const k = 60 / EC.length(); const eRep = new THREE.Mesh(new THREE.SphereGeometry(R * k, 64, 48), new THREE.MeshBasicMaterial({ map: surf, color: new THREE.Color(.75, .82, 1) }));
    eRep.quaternion.copy(earth.quaternion); eRep.position.copy(EC).multiplyScalar(k); envS.add(eRep);
    const sb = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(40, 38, 34) })); sb.position.copy(sunDir).multiplyScalar(55); envS.add(sb);
    scene.environment = pm.fromScene(envS, .01).texture; scene.environmentIntensity = .8;
    car = await loadRoadster(); scene.add(car); car.rotation.set(.04, car.rotation.y - .15, .08);
    // —— 2008 年的老前辈（CC-BY，the_86_guy）+ 驾驶座上的太空人 ——
    const og = await gltfLoader().loadAsync('/assets/models/roadster-2008.glb');
    const oc = og.scene; oc.updateMatrixWorld(true);
    let ob = new THREE.Box3().setFromObject(oc), os = ob.getSize(V()), occ = ob.getCenter(V());
    const old = new THREE.Group(); const inner = new THREE.Group(); inner.add(oc); old.add(inner);
    oc.position.set(-occ.x, -ob.min.y, -occ.z); inner.scale.setScalar(3.95 / Math.max(os.x, os.z)); if (os.x > os.z) inner.rotation.y = Math.PI / 2;
    inner.updateMatrixWorld(true);
    let hl = V(), hn = 0; inner.traverse(o => { if (o.isMesh && /Projector_lights|Headllight_case/.test(o.material.name)) { hl.add(new THREE.Box3().setFromObject(o).getCenter(V())); hn++; } });
    if (hn && hl.divideScalar(hn).z > 0) inner.rotation.y += Math.PI;
    inner.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = true; const nm = o.material.name;
      if (nm === 'Paint') o.material = new THREE.MeshPhysicalMaterial({ color: '#8c0a12', metalness: .2, roughness: .3, clearcoat: 1, clearcoatRoughness: .04 }); });
    inner.updateMatrixWorld(true); const ib = new THREE.Box3().setFromObject(inner);
    // 太空人：白色宇航服、头盔、深色面罩；左臂搭在车门上，右手握方向盘
    const suit = new THREE.MeshPhysicalMaterial({ color: '#f1f0ec', roughness: .65, sheen: .6, sheenColor: new THREE.Color('#ffffff') });
    const man = new THREE.Group(); const sx = -.36, sz = .25, sy = ib.max.y - .32;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .32, 8, 20), suit); torso.position.set(sx, sy + .2, sz); torso.rotation.x = .28; man.add(torso);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.34, .4, .14), suit); pack.position.set(sx, sy + .25, sz + .2); pack.rotation.x = .28; man.add(pack);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(.17, 40, 28), suit); helm.position.set(sx, sy + .63, sz + .1); man.add(helm);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(.145, 40, 28, Math.PI * 1.15, Math.PI * .7, Math.PI * .28, Math.PI * .42), new THREE.MeshPhysicalMaterial({ color: '#111216', metalness: 1, roughness: .05, clearcoat: 1 }));
    visor.position.copy(helm.position).add(V(0, -.005, -.04)); man.add(visor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .025, 12, 32), new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: .7, roughness: .4 })); ring.position.set(sx, sy + .48, sz + .1); ring.rotation.x = Math.PI / 2; man.add(ring);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(.065, .36, 6, 12), suit); armL.position.set(sx - .26, sy + .26, sz - .05); armL.rotation.set(-.4, 0, -1.1); man.add(armL);
    const foreL = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .3, 6, 12), suit); foreL.position.set(sx - .5, sy + .14, sz - .2); foreL.rotation.set(-1.3, 0, -.3); man.add(foreL);
    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(.065, .4, 6, 12), suit); armR.position.set(sx + .14, sy + .22, sz - .3); armR.rotation.set(-1.15, 0, .25); man.add(armR);
    man.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); old.add(man);
    old.position.set(4.6, 1.5, 4.6); old.rotation.set(-.1, .35, .22); scene.add(old);

    const tail = new THREE.Group(); tail.rotation.set(.04, -.15, .08); scene.add(tail);
    for (const x of [-.5, -.17, .17, .5]) thruster(tail, V(x, .38, 2.2), V(0, 0, 1), 2.4, .07);
  }
  // —— 镜头 ——
  const views = { top: [[0, 60, .01], [0, 0, 0]], road: [[-4.6, .75, -6.8], [.4, .55, .6]], chase: [[3.8, .85, 6.2], [-.8, .6, -3]], lift: [[-6.6, -4.7, -7.4], [.2, .3, .4]], space: [[-6.4, 1.9, -8.2], [2.4, -.2, 2.6]] };
  const [co, lo] = views[VIEW];
  camera.position.copy(CP).add(V(...co)); if (VIEW !== 'space') camera.position.y = Math.max(camera.position.y, .35); camera.lookAt(CP.clone().add(V(...lo)));
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), .35, .4, .95));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec2 d=vUv-.5; vec3 c=texture2D(tDiffuse,vUv).rgb; c=(c-.5)*1.05+.5; float v=smoothstep(.95,.3,length(d*vec2(1.1,1.))); c*=mix(.78,1.,v); gl_FragColor=vec4(c,1.); }' }));
  composer.render();
  document.title = 'done';
}
main().catch(e => { console.log('ERR ' + e.message); document.title = 'done'; });
