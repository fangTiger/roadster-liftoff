// 轮胎印：漂移、大幅侧滑或急刹时，从两个后轮位置向地面铺深色窄条；环形缓冲，最旧的被覆盖
import * as THREE from 'three';
const MAX = 6000, HALF = .14, REAR = 1.35, TRACK = .82;
export function createSkidmarks(scene) {
  const pos = new Float32Array(MAX * 4 * 3), geo = new THREE.BufferGeometry(), idx = [];
  for (let i = 0; i < MAX; i++) { const o = i * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x14110f, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
  mesh.frustumCulled = false; scene.add(mesh);
  let next = 0, last = null;
  function wheels(c) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = fz, rz = -fx;
    return [-1, 1].map(side => ({ x: c.x - fx * REAR + rx * TRACK * side, z: c.z - fz * REAR + rz * TRACK * side, y: c.y + .06 }));
  }
  // 每帧调用：c 为插值后的车辆状态
  function update(c) {
    const speed = Math.hypot(c.vx, c.vz), slip = Math.abs(c.vx * Math.cos(c.yaw) - c.vz * Math.sin(c.yaw));
    const on = c.grounded && speed > 6 && (c.drifting || slip > 2.5);
    const now = on ? wheels(c) : null;
    if (now && last) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), px = fz * HALF, pz = -fx * HALF;
      for (let w = 0; w < 2; w++) {
        const a = last[w], b = now[w], o = next * 12;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 16) continue;   // 重置传送等大跳变不连线
        pos.set([a.x - px, a.y, a.z - pz, a.x + px, a.y, a.z + pz, b.x - px, b.y, b.z - pz, b.x + px, b.y, b.z + pz], o);
        next = (next + 1) % MAX;
      }
      geo.attributes.position.needsUpdate = true;
    }
    last = now;
  }
  return { update };
}
