// 散布只影响显示，不改变赛道或模拟。半径包含冠幅，给主路、支路与入口留出净空。
export function terrainTiles(hf) {
  const tiles = [], width = (hf.width - 1) * hf.step, depth = (hf.height - 1) * hf.step;
  for (let z = 0; z < depth; z += 128) for (let x = 0; x < width; x += 128) {
    tiles.push({ x: hf.x0 + x, z: hf.z0 + z, width: Math.min(128, width - x), depth: Math.min(128, depth - z) });
  }
  return tiles;
}
export const noise = (x, z, salt = 0) => {
  let h = Math.imul(Math.floor(x) ^ 193, 374761393) ^ Math.imul(Math.floor(z) ^ salt, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function scatterProps(track, mobile = false) {
  const hf = track.heightfield, points = [], spacing = mobile ? 42 : 30;
  const protectedPoints = [track.at(0), ...track.checkpointGates];
  for (const f of track.features) if (f.type === 'tunnel') for (const s of [f.from, f.to]) protectedPoints.push(track.at(s));
  const clear = (x, z, radius) => {
    const n = track.nearest(x, z);
    if (n.distance < n.w / 2 + 6 + radius || protectedPoints.some(p => Math.hypot(x - p.x, z - p.z) <= 24 + radius)) return false;
    return track.walls.every(w => {
      const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
      const t = Math.max(0, Math.min(1, ((x - w.a.x) * dx + (z - w.a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - w.a.x - t * dx, z - w.a.z - t * dz) > radius + 1;
    });
  };
  const add = (x, z, kind, radius, scale = 1, yaw = 0) => {
    if (!clear(x, z, radius) || track.surfaceAt(x, z) === 6) return;
    points.push({ x, z, y: track.heightAt(x, z), kind, radius, scale, yaw });
  };
  // 环线有向面积决定外侧；设施顺着道路切线排列，起点与检查点附近自动留空。
  let area = 0;
  for (let s = 0; s < track.length; s += 8) { const a = track.at(s), b = track.at(s + 8); area += a.x * b.z - b.x * a.z; }
  const side = area > 0 ? -1 : 1;
  const roadside = (s, kind, radius) => {
    const p = track.at(s), offset = side * (p.w / 2 + 9 + radius);
    add(p.x - p.tz * offset, p.z + p.tx * offset, kind, radius, 1, Math.atan2(p.tx, p.tz) + (kind === 'fence' ? Math.PI / 2 : 0));
  };
  const straight = track.sections.find(s => /谷底高速/.test(s.name.zh)) || track.sections.find(s => /东直道/.test(s.name.zh));
  if (straight) for (let s = straight.from + 35; s < straight.to - 25; s += 36) roadside(s, 'pole', 4);
  for (let s = 36; s < Math.min(140, track.sections[0].to - 30); s += 1.9) roadside(s, 'fence', 2.1);
  // 小型路边素材单独采样，避免大树网格让路肩缺少层次。
  const vergeKinds = ['firSapling', 'stone', 'shrub4', 'trunk'];
  for (let s = 35; s < track.length; s += mobile ? 65 : 41) {
    const p = track.at(s), kind = vergeKinds[Math.floor(noise(s, 21) * vergeKinds.length)];
    const scale = .75 + noise(s, 29) * .5, radius = (kind === 'trunk' ? 3.2 : kind === 'firSapling' ? 2.5 : 1.8) * scale;
    const offset = (noise(s, 8) > .5 ? 1 : -1) * (p.w / 2 + 8 + radius + noise(s, 31) * 12);
    add(p.x - p.tz * offset, p.z + p.tx * offset, kind, radius, scale, noise(s, 11) * Math.PI * 2);
  }
  // 陡坡使用保守水平包围圆避开墙段，按坡向布置独立岩层。
  let cliffs = 0;
  for (let z = hf.z0 + 20; z < hf.z0 + (hf.height - 1) * hf.step - 20; z += mobile ? 20 : 10) {
    for (let x = hf.x0 + 20; x < hf.x0 + (hf.width - 1) * hf.step - 20; x += mobile ? 20 : 10) {
      if (cliffs >= 24) break;
      const dx = (track.heightAt(x + 2, z) - track.heightAt(x - 2, z)) / 4;
      const dz = (track.heightAt(x, z + 2) - track.heightAt(x, z - 2)) / 4;
      if (Math.hypot(dx, dz) < .7 || noise(x, z, 115) > .5 || track.nearest(x, z).distance > 190) continue;
      const kind = cliffs % 2 ? 'mountainside' : 'rockFace', radius = kind === 'rockFace' ? 5 : 7;
      const before = points.length;
      add(x, z, kind, radius, 1, Math.atan2(dx, dz));
      if (points.length > before) cliffs++;
    }
  }
  for (let z = hf.z0 + 20; z < hf.z0 + (hf.height - 1) * hf.step - 20; z += spacing) {
    for (let x = hf.x0 + 20; x < hf.x0 + (hf.width - 1) * hf.step - 20; x += spacing) {
      const r = noise(x, z, 17), px = x + (r - .5) * spacing, pz = z + (noise(x, z, 39) - .5) * spacing;
      const n = track.nearest(px, pz), cluster = noise(Math.floor(px / 110), Math.floor(pz / 110), 51);
      if (r > .62 || n.distance > 230 || cluster < .15) continue;
      const kind = r < .11 ? 'largePine' : r < .22 ? 'fir' : r < .32 ? 'pine' : r < .43 ? 'shrub' : r < .49 ? 'stump' : r < .57 ? 'moss' : 'boulder';
      const scale = .7 + noise(x, z, 73) * .65, radius = (kind === 'fir' || kind === 'pine' || kind === 'largePine' ? 5 : kind === 'boulder' ? 4 : 2) * scale;
      if (!clear(px, pz, radius)) continue;
      const slope = Math.hypot(track.heightAt(px + 2, pz) - track.heightAt(px - 2, pz), track.heightAt(px, pz + 2) - track.heightAt(px, pz - 2)) / 4;
      if (slope > .65 || track.surfaceAt(px, pz) === 6) continue;
      points.push({ x: px, z: pz, y: track.heightAt(px, pz), kind, scale, radius, yaw: noise(x, z, 91) * Math.PI * 2 });
      if (points.length === 900) return points;
    }
  }
  return points;
}
