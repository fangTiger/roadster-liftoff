import * as THREE from 'three';
import { noise } from './layout.js';

// 极端减面丢失的针叶用小枝补片补足；树干、枯枝仍来自实拍素材。
export function needleGeometry(height, radius) {
  const positions = [], uv = [], indices = [];
  for (let layer = 0; layer < 15; layer++) {
    const t = layer / 14, y = height * (.18 + t * .7), width = radius * (1 - t * .88), h = height * (.18 - t * .08);
    for (let blade = 0; blade < 4; blade++) {
      const angle = blade * Math.PI / 4 + layer * 2.4, c = Math.cos(angle), s = Math.sin(angle), branchWidth = width * (.72 + noise(layer, blade) * .28), start = positions.length / 3;
      for (const [x, dy] of [[-branchWidth, 0], [branchWidth, 0], [-branchWidth, h], [branchWidth, h]]) positions.push(x * c, y + dy, x * s);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1); indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
let needleMap;
function branchTexture() {
  if (needleMap) return needleMap;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  // 透明底上的细枝与针叶，避免用不透明锥体填树冠。
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const y = 470 - i * 23, endX = 256 + side * (1 - i / 21) * 235, endY = y - 50 - noise(i, side) * 40;
    ctx.strokeStyle = '#5a5940'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(256, y); ctx.lineTo(endX, endY); ctx.stroke();
    for (let n = 0; n < 22; n++) {
      const t = n / 22, x = 256 + (endX - 256) * t, by = y + (endY - y) * t;
      ctx.strokeStyle = ['#233c2c', '#324d32', '#3f5736', '#52613b'][Math.floor(noise(i, n, side) * 4)]; ctx.lineWidth = 1.3 + noise(i, n) * .8;
      for (const direction of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + side * (6 + noise(n, i) * 10), by + direction * (10 + noise(n, i, 3) * 12)); ctx.stroke(); }
    }
  }
  ctx.strokeStyle = '#625e3d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(256, 500); ctx.lineTo(256, 35); ctx.stroke();
  needleMap = new THREE.CanvasTexture(canvas); needleMap.colorSpace = THREE.SRGBColorSpace; needleMap.anisotropy = 4; return needleMap;
}
export function restoreNeedles(parts, height) {
  const remaining = parts.filter(p => !/twig|leaf|leaves|needle/i.test(p.material.name));
  const material = new THREE.MeshStandardMaterial({ map: branchTexture(), alphaTest: .35, side: THREE.DoubleSide, roughness: 1, color: 0xc4d0bc });
  return [...remaining, { geometry: needleGeometry(height, 4.5), material }];
}
