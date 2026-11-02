import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildTrack } from '../../src/race/track/build.js';
import { TRACKS } from '../../src/race/track/data/index.js';

test('截图湖面只改克隆的渲染地形，保留赛道净空和原始物理高度场', async () => {
  const { addCaptureLake } = await import('./capture-lake.mjs');
  const track = buildTrack(TRACKS[1].def), p = track.at(1531.7484);
  const car = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.tx, p.tz) };
  const scene = new THREE.Scene(), original = new THREE.PlaneGeometry(500, 500, 30, 30);
  original.rotateX(-Math.PI / 2); original.translate(car.x, 0, car.z);
  original.setAttribute('surface', new THREE.BufferAttribute(new Float32Array(original.attributes.position.count * 2), 2));
  const originalPositions = original.attributes.position.array.slice();
  const terrain = new THREE.Mesh(original, new THREE.MeshBasicMaterial()); scene.add(terrain);
  const physicalHeights = track.heightfield.heights.slice();
  const { lake, modifiedVertices } = addCaptureLake(scene, track, { car, angle: -.85 });
  assert.ok(lake.isMesh && lake.geometry.index.count > 1000);
  assert.ok(modifiedVertices > 0);
  assert.notEqual(terrain.geometry, original);
  assert.deepEqual(original.attributes.position.array, originalPositions, '原始资源不能被写入');
  assert.deepEqual(track.heightfield.heights, physicalHeights, '物理高度场不能被写入');
  const positions = lake.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const n = track.nearest(positions.getX(i), positions.getZ(i));
    assert.ok(n.distance > n.w / 2 + 10, '水面不能覆盖道路与路肩');
  }
});
