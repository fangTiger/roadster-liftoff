import * as THREE from 'three';
import { terrainTiles } from './layout.js';

export function loadTexture(name, channel = 'diff') {
  const t = new THREE.TextureLoader().load(`/assets/race/tex/${name}_${channel}.webp`);
  if (channel === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// 标准光照材质保留天空反射、雾与阴影，只替换地表混合部分。
function terrainMaterial(tint) {
  const names = ['grass_path_2', 'forrest_ground_01', 'rocks_ground_02', 'rock_face_03', 'mossy_rock', 'cliff_side'];
  const maps = names.map(n => loadTexture(n));
  const mat = new THREE.MeshStandardMaterial({ map: maps[0], normalMap: loadTexture(names[0], 'nor'), normalScale: new THREE.Vector2(.35, .35), roughnessMap: loadTexture(names[2], 'rough'), roughness: 1 });
  mat.onBeforeCompile = shader => {
    maps.forEach((t, i) => { shader.uniforms[`ground${i}`] = { value: t }; });
    shader.uniforms.grassTint = { value: new THREE.Color(tint?.[0] ?? 0x9fbf6e) };
    shader.uniforms.fieldTint = { value: new THREE.Color(tint?.[1] ?? 0xaecb7a) };
    shader.vertexShader = 'attribute vec2 surface; varying vec3 alpinePosition; varying vec3 alpineNormal; varying vec2 alpineSurface;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nalpinePosition=(modelMatrix*vec4(position,1.)).xyz; alpineNormal=normalize(mat3(modelMatrix)*normal); alpineSurface=surface;');
    shader.fragmentShader = `varying vec3 alpinePosition; varying vec3 alpineNormal; varying vec2 alpineSurface;
      uniform vec3 grassTint; uniform vec3 fieldTint;
      uniform sampler2D ground0; uniform sampler2D ground1; uniform sampler2D ground2;
      uniform sampler2D ground3; uniform sampler2D ground4; uniform sampler2D ground5;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec3 p=alpinePosition; vec3 n=abs(normalize(alpineNormal));
      float forest=smoothstep(.05,.65,sin(p.x*.017)*cos(p.z*.021))*.72;
      vec3 grass=texture2D(ground0,p.xz/7.).rgb*mix(grassTint,fieldTint,alpineSurface.y)*1.35;
      vec3 floorColor=mix(grass,texture2D(ground1,p.xz/6.).rgb,forest);
      floorColor=mix(floorColor,texture2D(ground2,p.xz/5.).rgb,alpineSurface.x*.8);
      vec3 weights=pow(n,vec3(4.)); weights/=max(.001,weights.x+weights.y+weights.z);
      vec3 cliff=texture2D(ground3,p.zy/8.).rgb*weights.x+texture2D(ground5,p.xz/8.).rgb*weights.y+texture2D(ground3,p.xy/8.).rgb*weights.z;
      cliff=mix(cliff,texture2D(ground4,p.xz/5.).rgb,.18*n.y);
      float steep=smoothstep(.18,.62,1.-n.y);
      diffuseColor.rgb*=mix(floorColor,cliff,steep);
    `);
  };
  mat.customProgramCacheKey = () => 'alpine-splat-v1'; return mat;
}
export function terrainGeometry(track, tile, step) {
  const nx = Math.ceil(tile.width / step), nz = Math.ceil(tile.depth / step), positions = [], uv = [], surfaces = [], indices = [];
  function vertex(x, z, skirt = 0) {
    const near = track.nearest(x, z); let y = track.heightAt(x, z) - .15;
    if (near.distance < near.w / 2 + 6) y = Math.min(y, near.y + near.lateral * near.bank - .35);
    positions.push(x, y - skirt, z); uv.push(x / 7, z / 7);
    const surface = track.surfaceAt(x, z); surfaces.push(surface === 3 || surface >= 5 ? 1 : 0, surface === 4 ? 1 : 0);
    return positions.length / 3 - 1;
  }
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) vertex(tile.x + x / nx * tile.width, tile.z + z / nz * tile.depth);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const a = z * (nx + 1) + x, c = a + nx + 1; indices.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // 向下延伸边缘，封住相邻块采用不同细分级别时的裂缝。
  const edges = [Array.from({ length: nx + 1 }, (_, x) => x), Array.from({ length: nz + 1 }, (_, z) => z * (nx + 1) + nx), Array.from({ length: nx + 1 }, (_, x) => nz * (nx + 1) + nx - x), Array.from({ length: nz + 1 }, (_, z) => (nz - z) * (nx + 1))];
  for (const edge of edges) {
    // 裙边与顶面分开顶点，避免竖直法线把平地边缘染成岩壁。
    const top = edge.map(i => vertex(positions[i * 3], positions[i * 3 + 2]));
    const bottom = edge.map(i => vertex(positions[i * 3], positions[i * 3 + 2], 40));
    for (let i = 0; i < edge.length - 1; i++) indices.push(top[i], top[i + 1], bottom[i], top[i + 1], bottom[i + 1], bottom[i]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('surface', new THREE.Float32BufferAttribute(surfaces, 2)); g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
export function createTerrain(scene, track, { tint, mobile = false } = {}) {
  const material = terrainMaterial(tint), chunks = [];
  for (const tile of terrainTiles(track.heightfield)) {
    const group = new THREE.Group(); group.position.set(tile.x + tile.width / 2, 0, tile.z + tile.depth / 2);
    const levels = (mobile ? [4, 8, 16] : [2, 8, 16]).map(step => {
      const g = terrainGeometry(track, tile, step); g.translate(-group.position.x, 0, -group.position.z);
      const mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true; group.add(mesh); return mesh;
    });
    scene.add(group); chunks.push({ group, levels });
  }
  return { update(car) {
    for (const { group, levels } of chunks) {
      const distance = Math.hypot(car.x - group.position.x, car.z - group.position.z);
      group.visible = distance < 1100;
      const index = distance < 210 ? 0 : distance < 480 ? 1 : 2;
      levels.forEach((m, i) => { m.visible = i === index; m.receiveShadow = distance < 150; });
    }
  } };
}
