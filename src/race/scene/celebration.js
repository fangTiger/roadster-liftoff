// 冲线庆祝：车周围喷出彩带（实例化小纸片，带重力与旋转），四周天空接连炸开烟花（加色发光的粒子球壳）
import * as THREE from 'three';
const COLORS = [0xffd34d, 0xff4d6d, 0x4bc8e5, 0x8ef0c8, 0xffffff, 0xb07cff];
export function createCelebration(scene) {
  const N = 700, paper = new THREE.InstancedMesh(new THREE.PlaneGeometry(.22, .14), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .6, metalness: .2 }), N);
  paper.frustumCulled = false; paper.visible = false; scene.add(paper);
  const P = Array.from({ length: N }, (_, i) => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), c: new THREE.Color(COLORS[i % COLORS.length]) }));
  P.forEach((q, i) => paper.setColorAt(i, q.c));
  // 烟花：每一发是一个球壳粒子云
  const sparks = [], dummy = new THREE.Object3D();
  const sparkGeo = new THREE.SphereGeometry(.3, 6, 4);
  let active = false, t = 0, center = new THREE.Vector3(), nextBurst = 0;
  function burst() {
    const n = 90, color = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const mesh = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), n);
    mesh.frustumCulled = false; scene.add(mesh);
    // 炸点在车周围 14–26 米、离地 9–17 米，环拍镜头大多能拍到
    const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 12, o = center.clone().add(new THREE.Vector3(Math.sin(a) * d, 9 + Math.random() * 8, Math.cos(a) * d));
    const dirs = Array.from({ length: n }, () => new THREE.Vector3().randomDirection().multiplyScalar(7 + Math.random() * 3));
    sparks.push({ mesh, o, dirs, age: 0 });
  }
  function start(pos) {
    active = true; t = 0; nextBurst = .3; center.copy(pos); paper.visible = true;
    for (const q of P) {
      q.p.set(pos.x + (Math.random() - .5) * 3, pos.y + 1 + Math.random(), pos.z + (Math.random() - .5) * 3);
      q.v.set((Math.random() - .5) * 9, 9 + Math.random() * 9, (Math.random() - .5) * 9);
      q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); q.w.set((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12);
    }
  }
  function update(dt) {
    if (!active) return; t += dt;
    for (let i = 0; i < N; i++) {
      const q = P[i]; q.v.y -= 9.8 * dt; q.v.multiplyScalar(1 - 1.6 * dt); if (q.v.y < -2.2) q.v.y = -2.2;   // 空气阻力：纸片飘落
      q.p.addScaledVector(q.v, dt); q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
      if (q.p.y < center.y + .05) { q.p.y = center.y + .05; q.v.set(0, 0, 0); q.w.set(0, 0, 0); }
      dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.updateMatrix(); paper.setMatrixAt(i, dummy.matrix);
    }
    paper.instanceMatrix.needsUpdate = true;
    if (t > nextBurst && t < 9) { burst(); nextBurst = t + .45 + Math.random() * .5; }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k]; s.age += dt; const e = 1 - Math.exp(-s.age * 3);
      s.dirs.forEach((d, i) => { dummy.position.copy(s.o).addScaledVector(d, e * 1.2); dummy.position.y -= s.age * s.age * 2; dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(.05, 1 - s.age / 1.6)); dummy.updateMatrix(); s.mesh.setMatrixAt(i, dummy.matrix); });
      s.mesh.instanceMatrix.needsUpdate = true; s.mesh.material.opacity = Math.max(0, 1 - s.age / 1.6);
      if (s.age > 1.6) { scene.remove(s.mesh); s.mesh.material.dispose(); sparks.splice(k, 1); }
    }
  }
  return { start, update, get active() { return active; } };
}
