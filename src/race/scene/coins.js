import * as THREE from 'three';
import { createCoinModel } from '../../game/coin-model.js';
import { coinPositions } from '../sim/physics.js';

// 只消费本地车快照；拾取判定和每圈恢复规则仍由模拟层决定。
export function createRaceCoins(scene, track) {
 const positions = coinPositions(track);
 if (!positions.length) return { update() {}, dispose() {} };
 const model = createCoinModel();
 const body = new THREE.InstancedMesh(model.geometry, model.material, positions.length);
 const faces = new THREE.InstancedMesh(model.faceGeometry, model.faceMaterial, positions.length);
 body.name = 'race-coins'; faces.name = 'race-coin-faces'; body.castShadow = true;
 body.frustumCulled = faces.frustumCulled = false;
 faces.instanceMatrix = body.instanceMatrix;
 body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 const dummy = new THREE.Object3D();
 let disposed = false;
 function update(snapshot) {
  if (disposed) return;
  for (const [i, coin] of positions.entries()) {
   // y 已包含赛道高度和 feature.height，不能再次叠加地形高度。
   dummy.position.set(coin.x, coin.y, coin.z);
   dummy.rotation.set(0, snapshot.step / 60, 0);
   dummy.scale.setScalar(snapshot.car.picked[coin.id] !== snapshot.car.lap ? 1.5 : 0);
   dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix);
  }
  body.instanceMatrix.needsUpdate = true;
 }
 update({ step: 0, car: { picked: {}, lap: 1 } });
 scene.add(body, faces);
 return { update, dispose() {
  if (disposed) return;
  disposed = true;
  body.removeFromParent(); faces.removeFromParent();
  body.dispose(); faces.dispose(); model.dispose();
 } };
}
