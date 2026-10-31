import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const cleanup=await import('./dispose.js').catch(()=>({}));
test('房间清场释放实例缓冲，几何、材质和重复引用的贴图各释放一次',()=>{
 assert.equal(typeof cleanup.disposeRaceObjects,'function');const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture,bumpMap:texture}),a=new THREE.InstancedMesh(geometry,material,3),b=new THREE.InstancedMesh(geometry,material,3);scene.add(a,b);
 const resources=[a,b,geometry,texture,material],counts=resources.map(r=>{const c={n:0};r.addEventListener('dispose',()=>c.n++);return c;});cleanup.disposeRaceObjects([a,b]);assert.deepEqual(counts.map(c=>c.n),[1,1,1,1,1]);assert.equal(scene.children.length,0);
});
