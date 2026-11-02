// NFT 摄影布景：现有湖畔场景没有水面，仅由 render-tracks 的 capture 页面加载。
// 只改页面内克隆的渲染几何，不写入赛道定义、物理高度场或游戏运行时。
import * as THREE from 'three';

export function addCaptureLake(scene, track, { car, angle }) {
  const yaw = car.yaw + angle, forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const center = { x: car.x - forward.x * 100, z: car.z - forward.z * 100 };
  const across = { x: forward.z, z: -forward.x }, width = 150, depth = 85;
  const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
  function sample(x, z) {
    const dx = x - center.x, dz = z - center.z;
    const u = (dx * across.x + dz * across.z) / width, v = (dx * forward.x + dz * forward.z) / depth;
    const theta = Math.atan2(v, u), radius = Math.hypot(u, v) / (1 + .035 * Math.sin(theta * 3) + .025 * Math.cos(theta * 7));
    if (radius > 1.1) return { radius, weight: 0, clearance: 0 };
    const near = track.nearest(x, z), clearance = near.distance - near.w / 2;
    return { radius, clearance, weight: (1 - smooth(.88, 1.07, radius)) * smooth(7, 13, clearance) };
  }
  let modifiedVertices = 0, hiddenInstances = 0;
  scene.updateMatrixWorld(true);
  const point = new THREE.Vector3(), matrix = new THREE.Matrix4();
  scene.traverse(mesh => {
    if (mesh.geometry?.hasAttribute('surface')) {
      // 各级地形共用原始资源；克隆后才压低湖盆，路面与路肩保留净空。
      const geometry = mesh.geometry.clone(), positions = geometry.attributes.position, inverse = mesh.matrixWorld.clone().invert();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        const { weight } = sample(point.x, point.z);
        if (!weight) continue;
        point.y = Math.min(point.y, point.y * (1 - weight) - 3 * weight);
        point.applyMatrix4(inverse); positions.setXYZ(i, point.x, point.y, point.z); modifiedVertices++;
      }
      positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere(); mesh.geometry = geometry;
    }
    if (mesh.isInstancedMesh && !mesh.name.startsWith('race-coin')) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
        const { radius, clearance } = sample(point.x, point.z);
        if (radius < 1.04 && clearance > 10) {
          matrix.scale(new THREE.Vector3(0, 0, 0)); mesh.setMatrixAt(i, matrix); hiddenInstances++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  // 自然岸线 + 细小起伏的反光水面；天空反射来自当前场景的环境贴图。
  const vertices = [], indices = [], size = 2;
  function world(u, v) {
    const x = center.x + across.x * u + forward.x * v, z = center.z + across.z * u + forward.z * v;
    const { radius, clearance } = sample(x, z);
    return { u, v, x, z, inside: Math.min(1 - radius, (clearance - 10.1) / width) >= 0 };
  }
  function shoreline(a, b) {
    let inner = a.inside ? a : b, outer = a.inside ? b : a;
    // 对跨岸三角面求交，避免按整格剔除造成台阶状锯齿。
    for (let i = 0; i < 10; i++) {
      const mid = world((inner.u + outer.u) / 2, (inner.v + outer.v) / 2);
      if (mid.inside) inner = mid; else outer = mid;
    }
    return inner;
  }
  for (let v = -depth; v < depth; v += size) for (let u = -width; u < width; u += size) {
    const corners = [world(u, v), world(u + size, v), world(u, v + size), world(u + size, v + size)];
    for (const triangle of [[0, 2, 1], [1, 2, 3]]) {
      const polygon = [];
      for (let i = 0; i < 3; i++) {
        const a = corners[triangle[i]], b = corners[triangle[(i + 1) % 3]];
        if (a.inside) polygon.push(a);
        if (a.inside !== b.inside) polygon.push(shoreline(a, b));
      }
      for (let i = 1; i < polygon.length - 1; i++) for (const point of [polygon[0], polygon[i], polygon[i + 1]]) {
        indices.push(vertices.length / 3);
        vertices.push(point.x, -.22 + .025 * Math.sin(point.x * .8 + point.z * .4) * Math.cos(point.z * .65), point.z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const lake = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color: '#235d70', metalness: .1, roughness: .3, clearcoat: .2, clearcoatRoughness: .25, specularIntensity: .35, envMapIntensity: .7, side: THREE.DoubleSide }));
  lake.name = 'nft-capture-lake'; scene.add(lake);
  return { lake, modifiedVertices, hiddenInstances };
}
