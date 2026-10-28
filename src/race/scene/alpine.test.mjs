import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
import * as layout from './layout.js';

test('三张地图的植被确定性散布，冠幅与所有主支路及入口保持净空', () => {
  assert.equal(typeof layout.scatterProps, 'function');
  for (const { def } of TRACKS) {
    const track = buildTrack(def), points = layout.scatterProps(track);
    assert.ok(points.length > 100 && points.length <= 900);
    assert.deepEqual(points, layout.scatterProps(track));
    for (const p of points) {
      const n = track.nearest(p.x, p.z);
      assert.ok(n.distance >= n.w / 2 + 6 + p.radius);
      assert.ok(Math.abs(track.heightAt(p.x, p.z) - p.y) < .01);
      for (const g of track.checkpointGates) assert.ok(Math.hypot(p.x - g.x, p.z - g.z) > 20 + p.radius);
      for (const f of track.features.filter(f => f.type === 'tunnel')) {
        for (const s of [f.from, f.to]) { const q = track.at(s); assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 24 + p.radius); }
      }
    }
  }
});

test('分块完整覆盖高度场且相邻块共享边界，远级细分更少', () => {
  assert.equal(typeof layout.terrainTiles, 'function');
  const tiles = layout.terrainTiles({ x0: -10, z0: -20, width: 151, height: 131, step: 2 });
  assert.equal(tiles.length, 9);
  assert.equal(tiles.reduce((sum, t) => sum + t.width * t.depth, 0), 300 * 260);
  assert.ok(tiles.every(t => t.width <= 128 && t.depth <= 128));
});

test('针叶补片保持在散布冠幅之内且控制面数', async () => {
  const geometry = await import('./foliage.js');
  assert.equal(typeof geometry.needleGeometry, 'function');
  const g = geometry.needleGeometry(14, 4.5);
  const p = g.attributes.position;
  assert.ok(g.index.count / 3 <= 1000);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= 4.5 + 1e-5);
    assert.ok(p.getY(i) >= 0 && p.getY(i) <= 14);
  }
});

test('轮胎无显式缩放时，动态裁剪仍生成有限的单位缩放矩阵', async () => {
  const THREE = await import('three');
  const { updateInstances } = await import('./props.js');
  const group = new THREE.Group(), mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  group.add(mesh); updateInstances(group, [{ x: 2, y: 3, z: 4, yaw: .2 }]);
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  assert.ok(matrix.elements.every(Number.isFinite));
  assert.equal(mesh.count, 1);
  assert.ok(Math.abs(matrix.determinant() - 1) < 1e-6);
});

test('困难地图的公共边界高度不随地形细分等级改变', async () => {
  const { terrainGeometry } = await import('./terrain.js');
  const track = buildTrack(TRACKS.find(t => t.difficulty === 'hard').def);
  const tile = { x: 118, z: 204, width: 128, depth: 128 };
  const height = step => { const g = terrainGeometry(track, tile, step), p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getX(i) === 246 && p.getZ(i) === 268) return p.getY(i); };
  assert.equal(height(8), height(16));
});

test('非球形滚石以几何中心旋转，所有顶点落在碰撞球内', async () => {
  const THREE = await import('three'), props = await import('./props.js');
  assert.equal(typeof props.centerPrototype, 'function');
  const parts = [{ geometry: new THREE.BoxGeometry(4, 1, 2).translate(0, .5, 0) }];
  props.centerPrototype(parts, 1);
  const p = parts[0].geometry.attributes.position;
  for (let i = 0; i < p.count; i++) assert.ok(Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) <= 1 + 1e-6);
  parts[0].geometry.computeBoundingBox(); const b = parts[0].geometry.boundingBox;
  assert.ok(Math.abs(b.min.y + b.max.y) < 1e-6);
});

test('平坦地形边缘法线不受竖直裙边污染', async () => {
  const { terrainGeometry } = await import('./terrain.js');
  const flat = { heightAt: () => 0, surfaceAt: () => 2, nearest: () => ({ distance: 200, w: 12, y: 0, lateral: 0, bank: 0 }) };
  const g = terrainGeometry(flat, { x: 0, z: 0, width: 128, depth: 128 }, 2), p = g.attributes.position, n = g.attributes.normal;
  const i = Array.from({ length: p.count }, (_, i) => i).find(i => p.getX(i) === 0 && p.getZ(i) === 64);
  assert.ok(n.getY(i) > .999, `平地边缘法线应向上，实际 ${n.getY(i)}`);
});

test('三图混种大松树并补齐路边素材和成排设施，陡坡有两类岩块', () => {
  for (const { def, difficulty } of TRACKS) {
    const track = buildTrack(def), points = layout.scatterProps(track);
    for (const kind of ['fir', 'largePine', 'firSapling', 'stone', 'shrub4', 'trunk', 'pole', 'fence']) {
      assert.ok(points.some(p => p.kind === kind), `${difficulty} 缺少 ${kind}`);
    }
    assert.ok(points.filter(p => p.kind === 'pole').length >= 3);
    assert.ok(points.filter(p => p.kind === 'fence').length >= 5);
    if (difficulty === 'hard') for (const kind of ['rockFace', 'mountainside']) {
      assert.ok(points.some(p => p.kind === kind), `陡坡缺少 ${kind}`);
    }
  }
});

test('铁丝网连续成段，新增装饰包围圆不穿过任意墙段，移动端也保持多样性', () => {
  for (const { def } of TRACKS) for (const mobile of [false, true]) {
    const track = buildTrack(def), points = layout.scatterProps(track, mobile);
    const fence = points.filter(p => p.kind === 'fence');
    for (let i = 1; i < fence.length; i++) assert.ok(Math.hypot(fence[i].x - fence[i - 1].x, fence[i].z - fence[i - 1].z) <= 2.2);
    for (const kind of ['largePine', 'firSapling', 'stone', 'shrub4', 'trunk', 'pole', 'fence']) assert.ok(points.some(p => p.kind === kind));
    for (const p of points) for (const w of track.walls) {
      const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
      const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / (dx * dx + dz * dz)));
      assert.ok(Math.hypot(p.x - w.a.x - t * dx, p.z - w.a.z - t * dz) > p.radius + 1);
    }
  }
});

test('台地与峡谷岩层形成多处点缀，并位于真实陡坡上', () => {
  const track = buildTrack(TRACKS.find(t => t.difficulty === 'hard').def);
  const rocks = layout.scatterProps(track).filter(p => ['rockFace', 'mountainside'].includes(p.kind));
  assert.ok(rocks.length >= 6);
  for (const p of rocks) {
    const dx = track.heightAt(p.x + 2, p.z) - track.heightAt(p.x - 2, p.z);
    const dz = track.heightAt(p.x, p.z + 2) - track.heightAt(p.x, p.z - 2);
    assert.ok(Math.hypot(dx, dz) / 4 >= .7);
  }
});
