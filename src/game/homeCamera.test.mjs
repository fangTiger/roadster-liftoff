import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGrass } from './grass.js';
import { sampleHomeCamera, createHomeCamera, HOME_KEYFRAMES } from './homeCamera.js';

test('关键帧按平滑曲线插值，循环首尾连续且不修改预设', () => {
  const frames = [
    { at: 0, position: [0, 2, 4], look: [0, 0, 0], fov: 40 },
    { at: 10, position: [10, 4, 8], look: [2, 0, -2], fov: 50 },
    { at: 20, position: [0, 2, 4], look: [0, 0, 0], fov: 40 },
  ];
  const before = JSON.stringify(frames);
  assert.deepEqual(sampleHomeCamera(5, frames), { position: [5, 3, 6], look: [1, 0, -1], fov: 45 });
  assert.deepEqual(sampleHomeCamera(0, frames), sampleHomeCamera(20, frames));
  assert.deepEqual(sampleHomeCamera(-1, frames), sampleHomeCamera(0, frames));
  assert.equal(JSON.stringify(frames), before);
  for (let t = 0; t <= 100; t += .5) assert.ok(sampleHomeCamera(t).position.every(Number.isFinite));
  assert.deepEqual(HOME_KEYFRAMES[0].position, HOME_KEYFRAMES.at(-1).position);
});

function setup(reduced = false) {
  const camera = new THREE.PerspectiveCamera(), root = new THREE.Group();
  const advances = [], thrusts = [];
  let trackD = 0;
  const car = { root, wheels: [], setThrust: (...args) => thrusts.push(args) };
  const desert = { centerAt: () => 2, slopeAt: () => 0, get trackD() { return trackD; }, advance: (...args) => { advances.push(args); trackD += args[0]; }, captureDisplayState() { const initial = trackD; return () => { trackD = initial; }; }, follow() {}, setAltitude() {} };
  const vehicle = { state: { x: 7, y: 0, yaw: .1, fuel: 1, dist: 0 } };
  const before = structuredClone(vehicle.state);
  let synced = 0;
  const home = createHomeCamera({ camera, car, desert, vehicle, rig: { syncChase: () => synced++ }, motionQuery: { matches: reduced } });
  return { home, camera, root, advances, thrusts, vehicle, before, desert, synced: () => synced };
}

test('首页慢行与尾焰只用于展示，停止后恢复车辆并交还相机', () => {
  const s = setup(); s.home.start(); const initial = s.camera.position.clone(); s.home.update(3);
  assert.notDeepEqual(s.camera.position, initial); assert.ok(s.advances[0][0] > 0); assert.ok(s.thrusts.at(-1)[0] > 0);
  assert.deepEqual(s.vehicle.state, s.before);
  s.home.stop(); assert.equal(s.synced(), 1); assert.equal(s.root.position.x, 7);
  const stopped = s.camera.position.clone(); s.home.update(3); assert.deepEqual(s.camera.position, stopped);
  assert.equal(s.thrusts.at(-1)[0], 0);
});

test('减少动态效果保持相机、世界与尾焰静止，运行时切换同样生效', () => {
  const s = setup(true); s.home.start(); const initial = s.camera.position.clone(); s.home.update(3);
  assert.deepEqual(s.camera.position, initial); assert.equal(s.advances.length, 0);
  assert.equal(s.thrusts[0][1], s.thrusts.at(-1)[1]);
});

test('长时间展示结束后恢复世界里程，保留正式游戏的起步直道', () => {
  const s = setup(); s.home.start(); s.home.update(600);
  assert.equal(s.desert.trackD, 1320);
  s.home.stop(); assert.equal(s.desert.trackD, 0); assert.deepEqual(s.vehicle.state, s.before);
  assert.ok(s.advances.every(([distance]) => distance >= 0), '展示通过快照恢复，不能倒退单向循环场景');
  s.home.start(); s.home.update(1); s.home.stop(); assert.equal(s.desert.trackD, 0);
});

test('真实草丛跨多个循环后按快照恢复实例分布与后续滚动', () => {
  const grass = createGrass({ count: 20 });
  grass.init(() => 2);
  const initial = [...grass.mesh.instanceMatrix.array];
  const restore = grass.captureDisplayState();
  for (let i = 0; i < 36000; i++) { grass.advance(2.2 / 60, () => 2); grass.tick(1 / 60); }
  restore();
  assert.deepEqual([...grass.mesh.instanceMatrix.array], initial);
  grass.advance(1, () => 2);
  for (let i = 0; i < 20; i++) assert.ok(grass.mesh.instanceMatrix.array[i * 16 + 14] >= -350 && grass.mesh.instanceMatrix.array[i * 16 + 14] <= 30);
  grass.mesh.geometry.dispose(); grass.mesh.material.dispose();
});
