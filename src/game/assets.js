// 资源加载：meshopt 压缩的 glTF、HDR 全景、贴图
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const tex = new THREE.TextureLoader();

export const loadGLTF = url => gltf.loadAsync(url);

// HDR 全景：截断溢出的太阳像素（半精度 Inf 会让泛光出黑点），并返回最亮点方向（太阳）
export async function loadHDR(url) {
  const hdr = await new HDRLoader().loadAsync(url);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const { data, width, height } = hdr.image;
  const half = data instanceof Uint16Array, cap = half ? THREE.DataUtils.toHalfFloat(30000) : 30000;
  for (let i = 0; i < data.length; i++) {
    if (half) { if ((data[i] & 0x7C00) === 0x7C00 || (data[i] < 0x8000 && data[i] > cap)) data[i] = cap; }
    else if (!isFinite(data[i]) || data[i] > cap) data[i] = cap;
  }
  const stride = data.length / (width * height), f = v => half ? THREE.DataUtils.fromHalfFloat(v) : v;
  let best = 0, bi = 0;
  for (let i = 0; i < width * height; i += 2) { const l = f(data[i * stride]) + f(data[i * stride + 1]) + f(data[i * stride + 2]); if (l > best) { best = l; bi = i; } }
  const u = (bi % width) / width, v = 1 - Math.floor(bi / width) / height;
  const phi = (u - .5) * Math.PI * 2, el = (v - .5) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el));
  return { hdr, sunDir };
}

// 可平铺的 PBR 贴图组（颜色、法线、粗糙度）
export async function loadPBR(base, repeat) {
  const [map, normalMap, roughnessMap] = await Promise.all(['diff', 'nor', 'rough'].map(k => tex.loadAsync(`${base}_${k}.webp`)));
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8; }
  return { map, normalMap, roughnessMap };
}
