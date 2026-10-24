// 太空场景：NASA Blue Marble 地球（8K 全球 + 东亚高清块 + 云层 + 夜景灯光）、大气散射、星空、
// 2008 年的老前辈与驾驶座上的太空人。整组默认隐藏，冲出大气层时由导演模块切换显示
import * as THREE from 'three';
import { loadGLTF } from './assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const EARTH_R = 6400;
const RA = EARTH_R * 1.028;

function earthMaterial(sunDir, tex) {
  return new THREE.ShaderMaterial({
    uniforms: { sd: { value: sunDir }, surf: { value: tex.surf }, hdp: { value: tex.patch }, clouds: { value: tex.clouds }, night: { value: tex.night }, pb: { value: new THREE.Vector4(70, 150, 0, 55) }, fade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vW; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 sd; uniform sampler2D surf, hdp, clouds, night; uniform vec4 pb; uniform float fade; varying vec2 vUv; varying vec3 vN, vW;
      void main(){
        float lon=vUv.x*360.-180., lat=(vUv.y-.5)*180.;
        vec3 c=texture2D(surf,vUv).rgb;
        vec2 pu=vec2((lon-pb.x)/(pb.y-pb.x),(lat-pb.z)/(pb.w-pb.z));
        if(pu.x>0.&&pu.x<1.&&pu.y>0.&&pu.y<1.){ float e=min(min(pu.x,1.-pu.x),min(pu.y,1.-pu.y)); c=mix(c,texture2D(hdp,pu).rgb,smoothstep(0.,.04,e)); }
        float cl=smoothstep(.12,.95,texture2D(clouds,vUv).b)*.9;
        vec3 N=normalize(vN), Vd=normalize(cameraPosition-vW); float nd=dot(N,sd), dif=max(nd,0.);
        float ocean=smoothstep(.02,.12,c.b-c.r)*(1.-smoothstep(.22,.38,max(c.r,c.g)));
        vec3 col=c*dif*1.7;
        col+=pow(max(dot(reflect(-sd,N),Vd),1e-5),140.)*ocean*(1.-cl)*vec3(1.,.93,.82)*2.2;
        col=mix(col,vec3(.97,.98,1.)*(dif*1.55+.004),cl);
        col+=texture2D(night,vUv).rgb*vec3(1.,.78,.5)*smoothstep(.04,-.18,nd)*(1.-cl*.8)*1.2;
        float mu=max(dot(N,Vd),0.), haze=pow(max(1.-mu,1e-5),2.4);
        col=mix(col,vec3(.32,.58,1.)*(dif*1.2+.03),haze*.55*smoothstep(-.3,.25,nd));
        col+=vec3(1.,.42,.14)*smoothstep(-.18,0.,nd)*smoothstep(.18,0.,nd)*.22;
        col=col*vec3(.92,.96,1.)+vec3(.0,.01,.03)*dif;
        gl_FragColor=vec4(col*fade,1.);
        #include <colorspace_fragment>
      }`,
  });
}

function atmosphereMaterial(sunDir, center) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { sd: { value: sunDir }, ec: { value: center }, r0: { value: EARTH_R }, r1: { value: RA }, fade: { value: 1 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 sd, ec; uniform float r0, r1, fade; varying vec3 vW;
      void main(){
        vec3 rd=normalize(vW-cameraPosition); float tc=dot(ec-cameraPosition,rd); vec3 P=cameraPosition+rd*tc; float h=length(P-ec);
        if(h<r0) discard;
        float alt=(h-r0)/(r1-r0); float dens=exp(-alt*5.5)*(1.-smoothstep(.85,1.,alt));
        vec3 n=normalize(P-ec); float l=dot(n,sd); float lit=smoothstep(-.28,.3,l);
        vec3 col=mix(vec3(1.,.45,.16),vec3(.3,.56,1.),smoothstep(-.05,.35,l));
        col=mix(col,vec3(.85,.93,1.),exp(-alt*14.)*.5);
        gl_FragColor=vec4(col*dens*lit*1.9*fade,1.);
      }`,
  });
}

// 2008 款老前辈 + 太空人（左臂搭在车门上，右手握方向盘）
async function createOldFriend() {
  const { scene: oc } = await loadGLTF('/assets/models/roadster-2008.glb');
  oc.updateMatrixWorld(true);
  const ob = new THREE.Box3().setFromObject(oc), os = ob.getSize(V()), occ = ob.getCenter(V());
  const old = new THREE.Group(), inner = new THREE.Group(); inner.add(oc); old.add(inner);
  oc.position.set(-occ.x, -ob.min.y, -occ.z); inner.scale.setScalar(3.95 / Math.max(os.x, os.z)); if (os.x > os.z) inner.rotation.y = Math.PI / 2;
  inner.updateMatrixWorld(true);
  let hl = V(), hn = 0; inner.traverse(o => { if (o.isMesh && /Projector_lights|Headllight_case/.test(o.material.name)) { hl.add(new THREE.Box3().setFromObject(o).getCenter(V())); hn++; } });
  if (hn && hl.divideScalar(hn).z > 0) inner.rotation.y += Math.PI;
  inner.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = true;
    if (o.material.name === 'Paint') o.material = new THREE.MeshPhysicalMaterial({ color: '#8c0a12', metalness: .2, roughness: .3, clearcoat: 1, clearcoatRoughness: .04 }); });
  inner.updateMatrixWorld(true); const ib = new THREE.Box3().setFromObject(inner);
  const suit = new THREE.MeshPhysicalMaterial({ color: '#f1f0ec', roughness: .65, sheen: .6, sheenColor: new THREE.Color('#ffffff') });
  const man = new THREE.Group(); const sx = -.36, sz = .25, sy = ib.max.y - .32;
  const add = (geo, mat, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; man.add(m); return m; };
  add(new THREE.CapsuleGeometry(.2, .32, 8, 20), suit, [sx, sy + .2, sz], [.28, 0, 0]);
  add(new THREE.BoxGeometry(.34, .4, .14), suit, [sx, sy + .25, sz + .2], [.28, 0, 0]);
  const helm = add(new THREE.SphereGeometry(.17, 40, 28), suit, [sx, sy + .63, sz + .1]);
  add(new THREE.SphereGeometry(.145, 40, 28, Math.PI * 1.15, Math.PI * .7, Math.PI * .28, Math.PI * .42), new THREE.MeshPhysicalMaterial({ color: '#111216', metalness: 1, roughness: .05, clearcoat: 1 }), [sx, sy + .625, sz + .06]);
  add(new THREE.TorusGeometry(.13, .025, 12, 32), new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: .7, roughness: .4 }), [sx, sy + .48, sz + .1], [Math.PI / 2, 0, 0]);
  add(new THREE.CapsuleGeometry(.065, .36, 6, 12), suit, [sx - .26, sy + .26, sz - .05], [-.4, 0, -1.1]);
  add(new THREE.CapsuleGeometry(.06, .3, 6, 12), suit, [sx - .5, sy + .14, sz - .2], [-1.3, 0, -.3]);
  add(new THREE.CapsuleGeometry(.065, .4, 6, 12), suit, [sx + .14, sy + .22, sz - .3], [-1.15, 0, .25]);
  old.add(man); helm.name = 'helmet';
  return old;
}

export async function createSpace(scene, renderer) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const sunDir = V(-.62, .34, -.71).normalize();
  // 星空改由天空穹顶（NASA 星图）负责
  // 灯光：太阳硬光 + 地球反照蓝光 + 极弱环境光
  const sun = new THREE.DirectionalLight('#fff8ef', 5.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0002;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 200 }); group.add(sun, sun.target);
  const earthshine = new THREE.DirectionalLight('#6f9cff', .7); group.add(earthshine, earthshine.target);
  group.add(new THREE.AmbientLight('#1a2030', .25));
  const skyLight = new THREE.HemisphereLight('#9cc0ea', '#4a5a6a', 0); group.add(skyLight);
  // 地球与大气
  const tl = new THREE.TextureLoader();
  const [surf, patch, clouds, night] = await Promise.all(['bm_surface_8k.jpg', 'bm_patch_eastasia.jpg', 'earth_bump_roughness_clouds_4096.jpg', 'earth_night_4096.jpg'].map(f => tl.loadAsync('/assets/earth/' + f)));
  surf.colorSpace = patch.colorSpace = night.colorSpace = THREE.SRGBColorSpace;
  [surf, patch, clouds, night].forEach(x => { x.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 320, 200), earthMaterial(sunDir, { surf, patch, clouds, night }));
  const center = V(); const atm = new THREE.Mesh(new THREE.SphereGeometry(RA, 200, 140), atmosphereMaterial(sunDir, center));
  earth.material.fog = false; atm.material.fog = false;
  group.add(earth, atm);
  // 让东亚（东经 124°、北纬 24°）朝向给定方向，北方大致朝上
  const ll = (lo, la) => { const ph = (lo + 180) / 360 * Math.PI * 2, th = (90 - la) * Math.PI / 180; return V(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); };
  function aimEarth(dir) {
    const q1 = new THREE.Quaternion().setFromUnitVectors(ll(124, 24), dir);
    const n1 = V(0, 1, 0).applyQuaternion(q1).projectOnPlane(dir).normalize(), up = V(0, 1, 0).projectOnPlane(dir).normalize();
    earth.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(dir, Math.atan2(V().crossVectors(n1, up).dot(dir), n1.dot(up))).multiply(q1));
  }
  // 车漆反射：缩比地球 + 太阳
  const pm = new THREE.PMREMGenerator(renderer); const envS = new THREE.Scene(); envS.background = new THREE.Color('#000');
  const eRep = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ map: surf, color: new THREE.Color(.75, .82, 1) })); envS.add(eRep);
  const sb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.7) })); sb.position.copy(sunDir).multiplyScalar(55);   // 环境里的太阳只给柔和反光，高光交给平行光 envS.add(sb);
  let envTex = null;
  // reuse：已经烘焙过就直接复用（加载时预热烘焙一次，爬升途中不再现场烘焙，避免卡顿）
  function bakeEnv(reuse = false) { if (reuse && envTex) return envTex; const k = 60 / center.length(); eRep.scale.setScalar(EARTH_R * k); eRep.position.copy(center).multiplyScalar(k); eRep.quaternion.copy(earth.quaternion); envTex?.dispose(); envTex = pm.fromScene(envS, .01).texture; return envTex; }

  const oldFriend = await createOldFriend(); oldFriend.visible = false; group.add(oldFriend);

  // h：车所在高度（地表以上，场景单位）；地球中心放在车下方并略微靠前，地平线弯曲随高度变化
  function place(carPos, h, forward = V(0, 0, -1), lead = .9) {
    center.copy(carPos).add(V(0, -EARTH_R - h, 0)).addScaledVector(forward, h * lead);
    earth.position.copy(center); atm.position.copy(center);
    sun.target.position.copy(carPos); sun.position.copy(carPos).addScaledVector(sunDir, 60);
    earthshine.target.position.copy(carPos); earthshine.position.copy(carPos).addScaledVector(V().subVectors(center, carPos).normalize(), 60);
  }
  function setFade(k) { earth.material.uniforms.fade.value = k; atm.material.uniforms.fade.value = k; }
  return { group, earth, atm, sunDir, oldFriend, place, aimEarth, bakeEnv, setFade, center, sun, skyLight };
}
