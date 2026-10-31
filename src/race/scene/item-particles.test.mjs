import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createItemParticles } from './item-particles.js';
test('粒子过期淡出，池溢出不扩容，未出生与极大时间不产生非有限矩阵',()=>{
 const root=new THREE.Group(),owned=new Set(),pool=createItemParticles(root,r=>{owned.add(r);return r;}),smoke=root.getObjectByName('item-smoke'),shards=root.getObjectByName('item-debris'),buffers=root.children.map(o=>o.isPoints?o.geometry.attributes.position.array:o.instanceMatrix.array);
 pool.update(0);for(const a of buffers)assert.ok(a.every(Number.isFinite));pool.emit('smoke',0,0,0,0);pool.update(.1);const alpha=smoke.geometry.attributes.alpha.array[0];assert.ok(alpha>0);pool.update(.3);assert.ok(smoke.geometry.attributes.alpha.array[0]<alpha);
 for(const kind of ['smoke','water','sparks','debris'])pool.emit(kind,1,0,0,0,1000,2);
 for(const time of [1,1.2,3,1e9]){pool.update(time);root.children.forEach((o,i)=>{const a=o.isPoints?o.geometry.attributes.position.array:o.instanceMatrix.array;assert.equal(a,buffers[i]);assert.ok(a.every(Number.isFinite));});}
 assert.equal(shards.count,64);assert.ok(smoke.geometry.attributes.alpha.array.every(a=>a===0));for(const resource of owned)resource.dispose();
});
