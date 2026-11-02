import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBoostFx } from './boostfx.js';
test('金币小冲刺复用尾焰与速度线，强度为氮气一半，停止后渐隐',()=>{
 const measure=strength=>{const scene=new THREE.Scene(),body=new THREE.Group(),fx=createBoostFx(scene,{body});fx.update(.1,1,strength,true);const flame=body.children[0].children[0],lines=body.getObjectByName('boost-lines');assert.ok(lines?.visible);return {fx,flame,lines};};
 const full=measure(1),dash=measure(.5);assert.ok(Math.abs(dash.flame.material.uniforms.k.value/full.flame.material.uniforms.k.value-.5)<1e-9);assert.ok(dash.lines.material.opacity<full.lines.material.opacity);
 for(let i=0;i<100;i++)dash.fx.update(.1,2,0);assert.equal(dash.lines.visible,false);assert.equal(dash.flame.visible,false);
});
test('半强度触发不延长为完整氮气冲击，也不盖掉已有全强度表现',()=>{
 const scene=new THREE.Scene(),body=new THREE.Group(),fx=createBoostFx(scene,{body}),c={x:0,y:0,z:0,yaw:0};
 fx.trigger(c,.5);fx.update(.1,1,.5);assert.equal(body.children[0].children[0].material.uniforms.k.value,.5);
 fx.update(.3,1.3,0);assert.ok(body.children[0].children[0].material.uniforms.k.value<.5);
 fx.trigger(c);fx.trigger(c,.5);fx.update(.1,1.4,1);assert.equal(body.children[0].children[0].material.uniforms.k.value,1);
});
