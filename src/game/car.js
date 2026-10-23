// Roadster 车辆：加载模型、黑白涂装、把扁平化的零件重新组装成可转动/转向的车轮、尾部推进器火焰
import * as THREE from 'three';
import { loadGLTF } from './assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 模型坐标系（米，车头 +Z）下四个车轮的中心
const WHEELS = [
  { name: 'FL', c: V(.778, .313, 1.534), front: true }, { name: 'FR', c: V(-.778, .313, 1.534), front: true },
  { name: 'RL', c: V(.804, .341, -1.387), front: false }, { name: 'RR', c: V(-.77, .341, -1.387), front: false },
];

function restyle(mesh) {
  const nm = mesh.material.name;
  if (nm === 'car_main_paint') mesh.material = new THREE.MeshPhysicalMaterial({ name: nm, color: '#f4f4f2', roughness: .22, clearcoat: 1, clearcoatRoughness: .02 });
  else if (/Glass_Tint_max|Glass_mid_tint/.test(nm)) mesh.material = new THREE.MeshPhysicalMaterial({ name: nm, color: '#050608', metalness: .2, roughness: .02, clearcoat: 1, transparent: true, opacity: .93 });
  else if (nm === 'calipers') mesh.material = new THREE.MeshStandardMaterial({ name: nm, color: '#c9c9c9', metalness: .8, roughness: .35 });
  else if (/headlights|Glass_Clear/.test(nm) && mesh.material.emissive) { mesh.material = mesh.material.clone(); mesh.material.emissive.set('#eaf3ff'); mesh.material.emissiveIntensity = 1.2; }
  else if (/rear_lights/.test(nm)) { mesh.material = mesh.material.clone(); mesh.material.emissive.set('#ff1020'); mesh.material.emissiveIntensity = 3; }
}

// 推进器火焰：加色混合的锥体，强度由 uniform 控制
function flameMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(color) }, k: { value: 0 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 c; uniform float k, t; varying vec2 vUv; varying vec3 vN, vV;
      void main(){
        // GPU 上 pow/normalize 碰到 0 或负数会得到 NaN，经泛光扩散会让整屏发黑，这里全部钳制
        float along=clamp(1.-vUv.y,0.,1.);
        vec3 n=vN/max(length(vN),1e-4), v=vV/max(length(vV),1e-4);
        float rim=pow(clamp(abs(dot(n,v)),1e-4,1.),1.4);
        float flick=.85+.15*sin(t*90.+vUv.y*30.)*sin(t*53.);
        float a=pow(max(along,1e-4),1.6)*rim*k*flick;
        vec3 col=mix(c,vec3(1.),pow(max(along,1e-4),5.));
        gl_FragColor=vec4(clamp(col*a*1.4,0.,8.),1.); }`,
  });
}

export async function createCar() {
  const { scene: model } = await loadGLTF('/assets/models/roadster-2020.glb');
  const root = new THREE.Group(), chassis = new THREE.Group();
  root.add(chassis); chassis.add(model);
  model.rotation.y = Math.PI;                       // 车头转向 -Z（前进方向）
  model.traverse(o => { if (o.isMesh) { restyle(o); o.castShadow = o.receiveShadow = true; } });
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model); model.position.y = -box.min.y; root.updateMatrixWorld(true);

  // 车轮：按距离把轮毂、轮胎、刹车盘归到对应车轮；卡钳只随转向、不随滚动
  const meshes = []; model.traverse(o => o.isMesh && meshes.push(o));
  const wheels = WHEELS.map(w => {
    const center = model.localToWorld(w.c.clone());
    const steer = new THREE.Group(); steer.position.copy(center); root.add(steer);
    const spin = new THREE.Group(); steer.add(spin); root.updateMatrixWorld(true);
    return { ...w, center, steer, spin, radius: w.c.y + model.position.y };
  });
  for (const m of meshes) {
    const c = new THREE.Box3().setFromObject(m).getCenter(V());
    const w = wheels.find(w => c.distanceTo(w.center) < .3);
    if (!w) continue;
    if (m.material.name === 'calipers') { if (w.front) w.steer.attach(m); } else w.spin.attach(m);
  }

  // 推进器：尾部 4 个（加速）+ 车底四角 4 个（离地），火焰沿喷口局部 +Y 方向伸出
  function thrusterSet(spots, rotX, sizes) {
    const flames = [];
    for (const [x, y, z] of spots) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = rotX; chassis.add(g);
      for (const [r, len, col] of sizes) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 20, 1, true), flameMaterial(col));
        f.position.y = len / 2; f.userData.len = len; g.add(f); flames.push(f);
      }
    }
    return (k, t) => { for (const f of flames) { f.material.uniforms.k.value = k; f.material.uniforms.t.value = t; const s = .4 + .6 * k; f.scale.set(1, s, 1); f.position.y = f.userData.len * s / 2; f.visible = k > .01; } };
  }
  const setThrust = thrusterSet([-.5, -.17, .17, .5].map(x => [x, .38, 2.2]), Math.PI / 2, [[.065, 1.4, '#9fdcff'], [.03, .55, '#ffffff']]);
  const setLift = thrusterSet([[-.72, .16, -1.45], [.72, .16, -1.45], [-.72, .16, 1.3], [.72, .16, 1.3]], Math.PI, [[.1, 2.6, '#9fdcff'], [.045, 1.0, '#ffffff']]);
  setThrust(0, 0); setLift(0, 0);
  // 再入等离子：包裹全车的椭球，菲涅尔边缘发光，车头最亮
  const plasma = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { k: { value: 0 }, t: { value: 0 } },
    vertexShader: 'varying vec3 vN, vV, vP; void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform float k, t; varying vec3 vN, vV, vP;
      void main(){
        float f=pow(clamp(1.-abs(dot(normalize(vN),normalize(vV))),1e-4,1.),2.2);
        float front=smoothstep(.1,-1.,vP.z);                       // 车头（-Z）更亮，车尾几乎透明
        float flick=.8+.2*sin(t*70.+vP.z*12.)*sin(t*41.+vP.x*9.);
        vec3 col=mix(vec3(1.,.35,.08),vec3(1.,.85,.6),front*.6);
        gl_FragColor=vec4(clamp(col*f*front*front*flick*k*3.,0.,8.),1.);
      }`,
  }));
  plasma.scale.set(1.35, .9, 2.7); plasma.position.set(0, .62, -.3); plasma.visible = false; chassis.add(plasma);
  // 尾迹：从车身两侧向后拖出的长条火焰
  const trail = new THREE.Mesh(new THREE.ConeGeometry(.95, 7, 32, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { k: { value: 0 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float k, t; varying vec2 vUv;
      void main(){ float along=clamp(vUv.y,0.,1.);                       // 1 在车身处，0 在尾端
        float n=.75+.25*sin(vUv.x*40.+t*30.)*sin(vUv.x*17.-t*23.+vUv.y*9.);
        vec3 col=mix(vec3(1.,.3,.05),vec3(1.,.8,.5),pow(along,3.));
        float edge=sin(vUv.x*6.2832*3.)*.5+.5;                         // 沿圆周明暗相间，像一缕缕火舌
        gl_FragColor=vec4(clamp(col*pow(along,3.)*n*(.35+.65*edge)*k*.55,0.,6.),1.); }`,
  }));
  trail.rotation.x = -Math.PI / 2; trail.position.set(0, .62, 1.2 + 3.5); trail.visible = false; chassis.add(trail);
  // 尾迹在多数镜头下像探照灯光柱，暂不显示，只保留包裹车头的等离子火光
  const setPlasma = (k, t) => { for (const m of [plasma]) { m.visible = k > .01; m.material.uniforms.k.value = k; m.material.uniforms.t.value = t; } };
  // 车灯亮度：太空纯黑背景里大灯泛光过强，需要压低
  const lamps = []; model.traverse(o => { if (o.isMesh && /headlights|Glass_Clear/.test(o.material.name) && o.material.emissive) lamps.push(o.material); });
  const setHeadlights = k => { for (const m of lamps) m.emissiveIntensity = 1.2 * k; };
  return { root, chassis, wheels, setThrust, setLift, setPlasma, setHeadlights };
}
