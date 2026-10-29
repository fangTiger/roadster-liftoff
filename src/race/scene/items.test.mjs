import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const module=await import('./items.js').catch(()=>({}));
test('箱子共享资源、刷新可见性，远端护盾和禁锢壳跟随状态，清理资源',()=>{
 assert.equal(typeof module.createItemFx,'function');const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
 try{const scene=new THREE.Scene(),items={boxes:[{id:'0-0',x:0,y:0,z:0},{id:'0-1',x:4,y:0,z:0}],mines:new Map(),visible:(id,box,time)=>box!=='0-0'||time>=4},track={heightAt:()=>0},fx=module.createItemFx(scene,items,track);const states=new Map([['a',{x:2,y:1,z:3,yaw:0,shield:true,trapped:false,boost:false}],['b',{x:5,y:0,z:6,yaw:0,shield:false,trapped:true,boost:true}]]);fx.update('a',3,states);const root=scene.getObjectByName('party-items'),boxes=root.getObjectByName('item-boxes');assert.equal(boxes.children[0].geometry,boxes.children[1].geometry);assert.equal(boxes.children[0].visible,false);assert.equal(root.getObjectByName('shield-a').visible,true);assert.equal(root.getObjectByName('trap-b').visible,true);states.get('a').shield=false;states.get('b').trapped=false;fx.update('a',4,states);assert.equal(boxes.children[0].visible,true);assert.equal(root.getObjectByName('shield-a').visible,false);assert.equal(root.getObjectByName('trap-b').visible,false);fx.burst({x:1,z:2},4);fx.update('a',5,states);assert.equal(root.getObjectByName('item-bursts').children.length,0);let disposed=0;boxes.children[0].geometry.addEventListener('dispose',()=>disposed++);fx.dispose();assert.equal(disposed,1);assert.equal(scene.children.length,0);}finally{globalThis.document=previous;}
});

test('导弹锥体尾焰追踪显示目标，到点消失，爆炸与碎盾颜色不同，打转时有火花',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
 try{const scene=new THREE.Scene(),m={itemId:'a-1',x:0,z:0,yaw:0,firedAt:3,target:'b'},items={boxes:[],mines:new Map(),missiles:new Map([[m.itemId,m]]),visible:()=>true},fx=module.createItemFx(scene,items,{heightAt:()=>0}),states=new Map([['b',{x:20,y:2,z:40,yaw:0,spinning:true}]]);
  fx.update('a',3,states);const missile=scene.getObjectByName('missile-a-1');assert.ok(missile);assert.equal(missile.position.z,0);assert.ok(missile.children.some(c=>c.geometry.type==='ConeGeometry'));assert.equal(scene.getObjectByName('sparks-b').visible,true);
  fx.update('a',4.49,states);assert.ok(Math.abs(missile.position.x-20)<.01);fx.update('a',4.5,states);assert.equal(missile.visible,false);
  fx.explode(states.get('b'),4.5,false);fx.explode(states.get('b'),4.5,true);const bursts=scene.getObjectByName('item-bursts').children;assert.equal(bursts.length,2);assert.notEqual(bursts[0].material.color.getHex(),bursts[1].material.color.getHex());items.missiles.clear();fx.update('a',5,states);assert.equal(scene.getObjectByName('missile-a-1'),undefined);assert.equal(bursts.length,0);fx.dispose();assert.equal(scene.children.length,0);
 }finally{globalThis.document=previous;}
});
