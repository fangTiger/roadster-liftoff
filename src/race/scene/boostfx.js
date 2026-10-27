// 加速火焰：处在加速状态（加速带、漂移加速、二次加速）时车尾喷出四道金橙色长火焰（尖端偏玫红），并点亮一盏橙色光照亮路面；
// 压上加速带和二次加速的瞬间再放一圈向后扩散的冲击波环
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
        gl_FragColor=vec4(clamp(col*a*1.9,0.,6.),1.); }`,
  });
}
export function createBoostFx(scene, car) {
  const flames = [];
  for (const x of [-.5, -.17, .17, .5]) {
    const g = new THREE.Group(); g.position.set(x, .38, 2.2); g.rotation.x = Math.PI / 2; car.body.add(g);
    for (const [r, len] of [[.17, 5.2], [.08, 2.2]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 20, 1, true), flameMaterial()); f.position.y = len / 2; f.renderOrder = 11; f.visible = false; g.add(f); flames.push(f); }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.visible = false; scene.add(ring);
  const glow = new THREE.PointLight(0xff8a2a, 0, 9, 2); glow.position.set(0, .45, 3.4); car.body.add(glow);
  let left = 0, age = 0, k = 0;
  // 触发：在车尾后方放下冲击波环，面朝车尾方向
  function trigger(c) {
    left = DURATION; age = 0;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    ring.position.set(c.x - fx * 2.4, c.y + .5, c.z - fz * 2.4); ring.lookAt(c.x - fx * 10, c.y + .6, c.z - fz * 10); ring.visible = true;
  }
  // boosting：车辆当前是否处在加速状态（boostTime > 0）；触发后的 0.7 秒内火焰额外加强
  function update(dt, t, boosting) {
    if (left > 0) { left = Math.max(0, left - dt); age += dt; }
    const target = Math.max(boosting ? .85 : 0, left > 0 ? 1 : 0);
    k += (target - k) * Math.min(1, dt * (target > k ? 25 : 6));
    const flick = .85 + .15 * Math.sin(t * 60) * Math.sin(t * 37);
    for (const f of flames) { f.visible = k > .01; f.material.uniforms.k.value = k; f.material.uniforms.t.value = t; f.scale.y = .55 + .45 * k * flick; }
    glow.intensity = k * 9 * flick;
    const r = Math.min(1, age / .4); ring.scale.setScalar(.8 + r * 2.6); ring.material.opacity = ring.visible ? (1 - r) * (1 - r) * .5 : 0; if (r >= 1) ring.visible = false;
  }
  return { trigger, update };
}
