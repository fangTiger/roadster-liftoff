// 二次加速特效：车尾四道金橙色长火焰（尖端偏玫红）+ 一圈向后扩散的冲击波环，持续约 0.7 秒
import * as THREE from 'three';
const DURATION = .7;
function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { k: { value: 0 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform float k, t; varying vec2 vUv; varying vec3 vN, vV;
      void main(){
        float along=clamp(1.-vUv.y,0.,1.);
        vec3 n=vN/max(length(vN),1e-4), v=vV/max(length(vV),1e-4);
        float rim=pow(clamp(abs(dot(n,v)),1e-4,1.),1.2);
        float flick=.8+.2*sin(t*70.+vUv.y*24.)*sin(t*41.);
        vec3 tip=vec3(1.,.22,.45), mid=vec3(1.,.55,.12), core=vec3(1.,.95,.75);
        vec3 col=mix(tip,mid,smoothstep(.0,.55,along)); col=mix(col,core,pow(along,4.));
        float a=pow(max(along,1e-4),1.2)*rim*k*flick;
        gl_FragColor=vec4(clamp(col*a*2.2,0.,10.),1.); }`,
  });
}
export function createBoostFx(scene, car) {
  const flames = [];
  for (const x of [-.5, -.17, .17, .5]) {
    const g = new THREE.Group(); g.position.set(x, .38, 2.2); g.rotation.x = Math.PI / 2; car.body.add(g);
    for (const [r, len] of [[.11, 3.4], [.05, 1.4]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 20, 1, true), flameMaterial()); f.position.y = len / 2; f.renderOrder = 11; f.visible = false; g.add(f); flames.push(f); }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.visible = false; scene.add(ring);
  let left = 0, age = 0;
  // 触发：在车尾后方放下冲击波环，面朝车尾方向
  function trigger(c) {
    left = DURATION; age = 0;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    ring.position.set(c.x - fx * 2.4, c.y + .5, c.z - fz * 2.4); ring.lookAt(c.x - fx * 10, c.y + .6, c.z - fz * 10); ring.visible = true;
  }
  function update(dt, t) {
    if (left > 0) { left = Math.max(0, left - dt); age += dt; }
    const k = left > 0 ? Math.min(1, left / .25) * Math.min(1, age / .06) : 0;
    for (const f of flames) { f.visible = k > .01; f.material.uniforms.k.value = k; f.material.uniforms.t.value = t; f.scale.y = .6 + .4 * k; }
    const r = Math.min(1, age / .4); ring.scale.setScalar(.8 + r * 2.6); ring.material.opacity = ring.visible ? (1 - r) * (1 - r) * .5 : 0; if (r >= 1) ring.visible = false;
  }
  return { trigger, update };
}
