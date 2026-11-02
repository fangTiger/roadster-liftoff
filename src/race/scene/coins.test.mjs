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

test('流光只在金币冲刺时显示并随金币数增强，满层粒子、损失四散约八百毫秒后回收',()=>{
 assert.equal(typeof coinsModule.createCoinTrail,'function');const root=new THREE.Group(),fx=coinsModule.createCoinTrail(root),fast={vx:0,vz:30},ribbon=fx.root.children[0];
 fx.update({coins:0,...fast},.1);assert.equal(fx.root.visible,false);
 fx.update({coins:5,...fast},.1);assert.equal(fx.root.visible,false,'有金币但未冲刺时不显示');
 for(let i=0;i<10;i++)fx.update({coins:5,coinDash:.3,...fast},.02);assert.equal(fx.root.visible,true);assert.ok(ribbon.visible&&ribbon.material.opacity>.8,'冲刺时显示明亮光柱');const half=ribbon.scale.x;
 for(let i=0;i<10;i++)fx.update({coins:10,dash:true,...fast},.02);assert.ok(ribbon.scale.x>half);assert.ok(fx.root.children.find(c=>c.isPoints).visible);
 for(let i=0;i<60;i++)fx.update({coins:10,...fast},.02);assert.equal(fx.root.visible,false,'冲刺结束后隐藏');
 fx.update({coins:5,...fast},.1);const burst=fx.root.children.find(c=>c.name==='coin-loss');assert.equal(burst.count,5);assert.equal(burst.visible,true);assert.equal(fx.root.visible,true);fx.update({coins:5,...fast},.81);assert.equal(burst.visible,false);
 fx.dispose();assert.equal(root.children.length,0);
});
