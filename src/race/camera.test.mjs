import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRaceCamera} from './camera.js';
const element=()=>({style:{},addEventListener(){},removeEventListener(){},getRootNode:()=>({addEventListener(){},removeEventListener(){}})});
test('轻碰撞镜头 kick 小于默认加速反馈，后续低强度不会盖掉已有反馈',()=>{
 const c={x:0,y:0,z:0,yaw:0,vx:0,vz:30,grounded:true};
 const measure=(strengths)=>{const view=new THREE.PerspectiveCamera(52),camera=createRaceCamera(view,element());camera.update(c,.016);for(const strength of strengths)camera.kick(strength);camera.update(c,.016);return view.fov;};
 const base=measure([]),soft=measure([.12]),full=measure([undefined]);assert.ok(soft>base&&soft<full);assert.equal(measure([undefined,.12]),full);
});
test('30 FPS 的轻接触至少反馈一帧，不会在应用前被衰减吞掉',()=>{
 const c={x:0,y:0,z:0,yaw:0,vx:0,vz:30,grounded:true},frame=1/30;
 const measure=kick=>{const view=new THREE.PerspectiveCamera(52),camera=createRaceCamera(view,element());camera.update(c,frame);if(kick)camera.kick(.07);camera.update(c,frame);return view.fov;};
 assert.ok(measure(true)>measure(false));
});
