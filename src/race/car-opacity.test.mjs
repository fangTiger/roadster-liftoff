import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const {createCarOpacity}=await import('./car-opacity.js').catch(()=>({}));
test('自己的车与多材质车身半透明后恢复原始玻璃、透明标志和深度写入',()=>{
 assert.equal(typeof createCarOpacity,'function');
 const root=new THREE.Group(),paint=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({opacity:.6,transparent:true,depthWrite:false});
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),[paint,glass]));const setOpacity=createCarOpacity(root);
 setOpacity(.35);assert.equal(paint.opacity,.35);assert.equal(paint.transparent,true);assert.equal(paint.depthWrite,false);assert.equal(glass.opacity,.6*.35);
 setOpacity(1);assert.equal(paint.opacity,1);assert.equal(paint.transparent,false);assert.equal(paint.depthWrite,true);assert.equal(glass.opacity,.6);assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);
});
