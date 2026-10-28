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
  for (let z = hf.z0 + 20; z < hf.z0 + (hf.height - 1) * hf.step - 20; z += spacing) {
    for (let x = hf.x0 + 20; x < hf.x0 + (hf.width - 1) * hf.step - 20; x += spacing) {
      const r = noise(x, z, 17), px = x + (r - .5) * spacing, pz = z + (noise(x, z, 39) - .5) * spacing;
      const n = track.nearest(px, pz), cluster = noise(Math.floor(px / 110), Math.floor(pz / 110), 51);
      if (r > .62 || n.distance > 230 || cluster < .15) continue;
      const kind = r < .22 ? 'fir' : r < .32 ? 'pine' : r < .43 ? 'shrub' : r < .49 ? 'stump' : r < .57 ? 'moss' : 'boulder';
      const scale = .7 + noise(x, z, 73) * .65, radius = (kind === 'fir' || kind === 'pine' ? 5 : kind === 'boulder' ? 4 : 2) * scale;
      if (n.distance < n.w / 2 + 6 + radius || protectedPoints.some(p => Math.hypot(px - p.x, pz - p.z) <= 24 + radius)) continue;
      const slope = Math.hypot(track.heightAt(px + 2, pz) - track.heightAt(px - 2, pz), track.heightAt(px, pz + 2) - track.heightAt(px, pz - 2)) / 4;
      if (slope > .65 || track.surfaceAt(px, pz) === 6) continue;
      points.push({ x: px, z: pz, y: track.heightAt(px, pz), kind, scale, radius, yaw: noise(x, z, 91) * Math.PI * 2 });
      if (points.length === 900) return points;
    }
  }
  return points;
}
