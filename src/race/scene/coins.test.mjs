import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildTrack } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
import { coinPositions } from '../sim/physics.js';
const coinsModule = await import('./coins.js').catch(() => ({}));

function fixture(run) {
 const load = THREE.TextureLoader.prototype.load;
 let loads = 0;
 THREE.TextureLoader.prototype.load = () => { loads++; return new THREE.Texture(); };
 try { run(() => loads); } finally { THREE.TextureLoader.prototype.load = load; }
}
test('没有金币 feature 时不创建网格或加载贴图，更新和释放可安全调用', () => fixture(loads => {
 assert.equal(typeof coinsModule.createRaceCoins, 'function');
 const scene = new THREE.Scene(), coins = coinsModule.createRaceCoins(scene, { features: [] });
 coins.update({ step: 0, car: { lap: 1, picked: {} } }); coins.dispose(); coins.dispose();
 assert.equal(scene.children.length, 0); assert.equal(loads(), 0);
}));
test('金币沿模拟坐标直立旋转，仅隐藏本地车本圈已拾取的金币，新圈恢复', () => fixture(() => {
 assert.equal(typeof coinsModule.createRaceCoins, 'function');
 const track = buildTrack(TRACKS[2].def), positions = coinPositions(track), scene = new THREE.Scene();
 const coins = coinsModule.createRaceCoins(scene, track), body = scene.getObjectByName('race-coins'), faces = scene.getObjectByName('race-coin-faces');
 assert.ok(body?.isInstancedMesh); assert.equal(body.count, positions.length); assert.equal(faces.instanceMatrix, body.instanceMatrix);
 assert.equal(body.frustumCulled, false); assert.equal(faces.frustumCulled, false);
 const snapshot = { step: 0, car: { lap: 1, picked: {} } }, a = new THREE.Matrix4(), b = new THREE.Matrix4();
 coins.update(snapshot);
 for (const [i, p] of positions.entries()) {
  body.getMatrixAt(i, a);
  assert.ok(new THREE.Vector3().setFromMatrixPosition(a).distanceTo(new THREE.Vector3(p.x, p.y, p.z)) < .001);
  const near = track.nearest(p.x, p.z);
  assert.ok(p.y - .42 * 1.5 > near.y + near.lateral * near.bank + .04, '金币底部应高于正式路面');
 }
 body.getMatrixAt(0, a); coins.update({ ...snapshot, step: 60 }); body.getMatrixAt(0, b); assert.notDeepEqual(a.elements, b.elements);
 snapshot.car.picked[positions[0].id] = 1; coins.update(snapshot); body.getMatrixAt(0, a); body.getMatrixAt(1, b);
 assert.equal(a.determinant(), 0); assert.ok(b.determinant() > 0);
 snapshot.car.lap++; coins.update(snapshot); body.getMatrixAt(0, a); assert.ok(a.determinant() > 0);
 coins.dispose();
}));
test('释放两份实例缓冲、几何、材质和金币贴图各一次，并从场景移除', () => fixture(() => {
 assert.equal(typeof coinsModule.createRaceCoins, 'function');
 const scene = new THREE.Scene(), coins = coinsModule.createRaceCoins(scene, buildTrack(TRACKS[2].def));
 const body = scene.getObjectByName('race-coins'), faces = scene.getObjectByName('race-coin-faces');
 const resources = [body, faces, body.geometry, body.material, faces.geometry, faces.material, faces.material.map];
 const counts = resources.map(resource => { const count = { n: 0 }; resource.addEventListener('dispose', () => count.n++); return count; });
 coins.dispose(); coins.dispose();
 assert.deepEqual(counts.map(c => c.n), resources.map(() => 1)); assert.equal(scene.children.length, 0);
}));
