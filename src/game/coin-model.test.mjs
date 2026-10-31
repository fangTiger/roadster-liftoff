import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const model=await import('./coin-model.js').catch(()=>({}));
test('共用金币保留原旋转体、浮雕尺寸与材质，全部资源仅释放一次',()=>{
 assert.equal(typeof model.createCoinModel,'function');const load=THREE.TextureLoader.prototype.load;let path;THREE.TextureLoader.prototype.load=url=>{path=url;return new THREE.Texture();};
 try{
  const coin=model.createCoinModel();assert.equal(path,'/assets/props/coin-face.webp');
  const points=[[0,.026],[.355,.026],[.372,.036],[.4,.036],[.42,.018],[.42,-.018],[.4,-.036],[.372,-.036],[.355,-.026],[0,-.026]].map(([x,y])=>new THREE.Vector2(x,y)),original=new THREE.LatheGeometry(points,40);original.rotateX(Math.PI/2);original.computeVertexNormals();
  assert.deepEqual(coin.geometry.attributes.position.array,original.attributes.position.array);assert.deepEqual(coin.geometry.attributes.normal.array,original.attributes.normal.array);original.dispose();
  assert.equal(coin.material.color.getHexString(),new THREE.Color('#ffc94a').getHexString());assert.equal(coin.material.roughness,.26);assert.equal(coin.faceMaterial.bumpScale,4);assert.equal(coin.faceMaterial.map,coin.faceMaterial.bumpMap);assert.equal(coin.faceMaterial.map,coin.faceMaterial.emissiveMap);assert.equal(coin.faceMaterial.map.colorSpace,THREE.SRGBColorSpace);assert.equal(coin.faceMaterial.map.anisotropy,8);
  const resources=[coin.geometry,coin.faceGeometry,coin.material,coin.faceMaterial,coin.faceMaterial.map],counts=resources.map(r=>{const count={n:0};r.addEventListener('dispose',()=>count.n++);return count;});coin.dispose();coin.dispose();assert.deepEqual(counts.map(c=>c.n),[1,1,1,1,1]);
 }finally{THREE.TextureLoader.prototype.load=load;}
});
