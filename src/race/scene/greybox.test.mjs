import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGreybox } from './greybox.js';
import { buildTrack } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
import { coinPositions } from '../sim/physics.js';
import { createSession } from '../sim/session.js';
test('草甸和湖畔浮雕金币共享实例矩阵，直立旋转、拾取隐藏，下一圈恢复',()=>{
 const previous=globalThis.document,load=THREE.TextureLoader.prototype.load;globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 try{for(const {def} of TRACKS.slice(0,2)){
  const track=buildTrack(def),scene=new THREE.Scene(),road=createGreybox(scene,track,{scenery:false}),positions=coinPositions(track),session=createSession(track),snapshot=session.snapshot;
  const body=scene.getObjectByName('race-coins'),faces=scene.getObjectByName('race-coin-faces');assert.ok(body?.isInstancedMesh);assert.equal(body.geometry.type,'LatheGeometry');assert.equal(body.count,positions.length);assert.equal(faces.instanceMatrix,body.instanceMatrix);assert.equal(faces.material.map.source.data,null);
  road.update(snapshot);const a=new THREE.Matrix4();body.getMatrixAt(0,a);const p=new THREE.Vector3().setFromMatrixPosition(a);assert.ok(p.distanceTo(new THREE.Vector3(positions[0].x,positions[0].y,positions[0].z))<.001);body.geometry.computeBoundingBox();assert.ok(body.geometry.boundingBox.max.y>.4);assert.ok(body.geometry.boundingBox.max.z<.04);
  road.update({...snapshot,step:60});const b=new THREE.Matrix4();body.getMatrixAt(0,b);assert.notDeepEqual(a.elements,b.elements);
  // 使用真实会话验证两张图仍照常拾取金币。
  Object.assign(session.car,{x:positions[0].x,y:positions[0].y-.6,z:positions[0].z,grounded:false});session.race.frozen=false;session.step(0);assert.equal(session.car.picked[positions[0].id],session.car.lap);
  road.update(session.snapshot);body.getMatrixAt(0,a);assert.equal(a.determinant(),0);session.car.lap++;road.update(session.snapshot);body.getMatrixAt(0,a);assert.ok(a.determinant()>0);
  road.dispose();assert.equal(scene.getObjectByName('race-coins'),undefined);
 }}finally{globalThis.document=previous;THREE.TextureLoader.prototype.load=load;}
});
