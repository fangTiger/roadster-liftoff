import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const module=await import('./items.js').catch(()=>({}));
test('箱子共享资源、刷新可见性，远端护盾和禁锢壳跟随状态，清理资源',()=>{
 assert.equal(typeof module.createItemFx,'function');const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){},beginPath(){},arc(){},stroke(){},moveTo(){},lineTo(){}})})};
 try{const scene=new THREE.Scene(),items={boxes:[{id:'0-0',x:0,y:0,z:0},{id:'0-1',x:4,y:0,z:0}],mines:new Map(),visible:(id,box,time)=>box!=='0-0'||time>=4},track={heightAt:()=>0},fx=module.createItemFx(scene,items,track);const states=new Map([['a',{x:2,y:1,z:3,yaw:0,shield:true,trapped:false,boost:false}],['b',{x:5,y:0,z:6,yaw:0,shield:false,trapped:true,boost:true}]]);fx.update('a',3,states);const root=scene.getObjectByName('party-items'),boxes=root.getObjectByName('item-boxes');assert.equal(boxes.children[0].children[0].geometry,boxes.children[1].children[0].geometry);assert.equal(boxes.children[0].visible,false);assert.equal(root.getObjectByName('shield-a').visible,true);assert.equal(root.getObjectByName('trap-b').visible,true);states.get('a').shield=false;states.get('b').trapped=false;fx.update('a',4,states);assert.equal(boxes.children[0].visible,true);assert.equal(root.getObjectByName('shield-a').visible,false);assert.equal(root.getObjectByName('trap-b').visible,false);fx.burst({x:1,z:2},4);fx.update('a',5,states);assert.equal(root.getObjectByName('item-bursts').children.length,0);let disposed=0;boxes.children[0].children[0].geometry.addEventListener('dispose',()=>disposed++);fx.dispose();assert.equal(disposed,1);assert.equal(scene.children.length,0);}finally{globalThis.document=previous;}
});

test('导弹与尾焰追踪显示目标，到点消失，爆炸与碎盾颜色不同，打转时有眩晕效果',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){},beginPath(){},arc(){},stroke(){},moveTo(){},lineTo(){}})})};
 try{const scene=new THREE.Scene(),m={itemId:'a-1',x:0,z:0,yaw:0,firedAt:3,target:'b'},items={boxes:[],mines:new Map(),missiles:new Map([[m.itemId,m]]),visible:()=>true},fx=module.createItemFx(scene,items,{heightAt:()=>0}),states=new Map([['b',{x:20,y:2,z:40,yaw:0,spinning:true}]]);
  fx.update('a',3,states);const missile=scene.getObjectByName('missile-a-1');assert.ok(missile);assert.equal(missile.position.z,0);assert.ok(missile.children.some(c=>c.geometry?.type==='ConeGeometry'));assert.equal(scene.getObjectByName('sparks-b').visible,true);
  fx.update('a',4.49,states);assert.ok(Math.abs(missile.position.x-20)<.01);fx.update('a',4.5,states);assert.equal(missile.visible,false);
  fx.explode(states.get('b'),4.5,false);fx.explode(states.get('b'),4.5,true);const bursts=scene.getObjectByName('item-bursts').children;assert.equal(bursts.length,2);assert.equal(bursts[0].children[0].material.type,'ShaderMaterial');assert.equal(bursts[1].children[0].material.wireframe,false);assert.notEqual(bursts[0].children[0].material.color.getHex(),bursts[1].children[0].material.color.getHex());items.missiles.clear();fx.update('a',5,states);assert.equal(scene.getObjectByName('missile-a-1'),undefined);assert.equal(bursts.length,0);fx.dispose();assert.equal(scene.children.length,0);
 }finally{globalThis.document=previous;}
});

test('水雷从出手点沿抛物线飞行 0.6 秒，旧消息原地浮动',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){},beginPath(){},arc(){},stroke(){},moveTo(){},lineTo(){}})})};
 try{const scene=new THREE.Scene(),mine={itemId:'a-1',x:40,z:20,ox:0,oz:0,placedAt:3},items={boxes:[],mines:new Map([['a-1',mine],['b-1',{itemId:'b-1',x:10,z:10,placedAt:3}]]),visible:()=>true},fx=module.createItemFx(scene,items,{heightAt:()=>0}),states=new Map();
  fx.update('a',3,states);const mesh=scene.getObjectByName('mine-a-1'),old=scene.getObjectByName('mine-b-1');assert.ok(mesh);assert.equal(mesh.position.x,0);assert.equal(mesh.position.z,0);assert.equal(old.position.x,10);
  fx.update('a',3.3,states);assert.ok(Math.abs(mesh.position.x-20)<1e-8);assert.ok(Math.abs(mesh.position.z-10)<1e-8);assert.ok(mesh.position.y>4.5&&mesh.position.y<4.8);assert.ok(old.position.y<1);
  fx.update('a',3.6,states);assert.equal(mesh.position.x,40);assert.equal(mesh.position.z,20);assert.ok(mesh.position.y<1);fx.dispose();assert.equal(scene.children.length,0);
 }finally{globalThis.document=previous;}
});
test('红色准星跟随目标，轮盘、无目标、后放水雷与无效目标均隐藏',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){},beginPath(){},arc(){},stroke(){},moveTo(){},lineTo(){}})})};
 try{const scene=new THREE.Scene(),slot={kind:'mine',readyAt:4},items={boxes:[],mines:new Map(),visible:()=>true,slot:()=>slot},track={length:1000,heightAt:()=>0},fx=module.createItemFx(scene,items,track),states=new Map([['a',{x:0,y:0,z:10,lap:1,s:10}],['b',{x:2,y:1,z:30,lap:1,s:30}]]),aim={self:{id:'a',lap:1,s:10},back:false,cars:[...states].map(([id,c])=>({id,...c}))};
  fx.update('a',3,states,aim);const marker=scene.getObjectByName('item-aim');assert.ok(marker);assert.equal(marker.visible,false);
  fx.update('a',4,states,aim);assert.equal(marker.visible,true);assert.equal(marker.position.x,2);assert.equal(marker.position.y,4.2);assert.equal(marker.material.depthTest,false);assert.equal(marker.material.fog,false);marker.onBeforeRender(null,null,new THREE.PerspectiveCamera(66));assert.ok(Math.abs(marker.scale.x/(2*Math.tan(33*Math.PI/180))*900-38)<1);assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(marker.matrixWorld).x-marker.scale.x)<1e-8);assert.equal(marker.material.sizeAttenuation,false);assert.ok(marker.renderOrder>=999);const rotation=marker.material.rotation;fx.update('a',4.1,states,aim);assert.notEqual(marker.material.rotation,rotation);
  fx.update('a',4.2,states,{...aim,back:true});assert.equal(marker.visible,false);slot.kind='missile';fx.update('a',4.2,states,{...aim,back:true});assert.equal(marker.visible,true);
  for(const kind of [null,'nitro','shield']){slot.kind=kind;fx.update('a',4.2,states,aim);assert.equal(marker.visible,false);}slot.kind='mine';
  for(const patch of [{ghost:true},{stale:true},{connected:false},{finished:true},{s:211}]){fx.update('a',4.2,states,{...aim,cars:[{id:'b',lap:1,s:30,...patch}]});assert.equal(marker.visible,false);}
  fx.update('a',4.2,states,{...aim,cars:[]});assert.equal(marker.visible,false);let freed=0;marker.material.map.addEventListener('dispose',()=>freed++);fx.dispose();assert.equal(freed,1);
 }finally{globalThis.document=previous;}
});

test('能量舱、导弹组件、共享波纹水体、六边形护盾、双尾焰与固定粒子池',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
 try{
  const scene=new THREE.Scene(),mine={x:3,z:3,placedAt:0},m={x:0,z:0,yaw:0,firedAt:0,target:'a'},items={boxes:[{id:'b',x:0,y:0,z:4},{id:'c',x:3,y:0,z:4}],mines:new Map([['m',mine]]),missiles:new Map([['r',m]]),visible:()=>true},fx=module.createItemFx(scene,items,{heightAt:()=>0}),states=new Map([['a',{x:8,y:0,z:20,yaw:0,shield:true,trapped:true,boost:true,spinning:true}]]);
  fx.update('a',.1,states);const root=scene.getObjectByName('party-items'),box=root.getObjectByName('item-boxes').children[0];assert.ok(box.isGroup);assert.equal(box.children[0].geometry.parameters.radialSegments,6);assert.equal(box.children[0].material.type,'ShaderMaterial');assert.ok(box.getObjectByName('capsule-core'));
  const missile=root.getObjectByName('missile-r');assert.ok(missile.children.some(c=>c.geometry?.type==='CylinderGeometry'));assert.equal(missile.children.filter(c=>c.name==='missile-fin').length,4);
  const water=root.getObjectByName('mine-m').children[0].material,trap=root.getObjectByName('trap-a');assert.equal(water.type,'ShaderMaterial');assert.equal(trap.children[0].material,water);assert.match(water.vertexShader,/sin\(/);assert.ok(trap.children.length>1);assert.match(root.getObjectByName('shield-a').material.fragmentShader,/hex/);assert.equal(root.getObjectByName('nitro-a').children.length,4);
  const pools=['item-smoke','item-sparks','item-water'].map(n=>root.getObjectByName(n));assert.ok(pools.every(p=>p?.isPoints));const buffers=pools.map(p=>p.geometry.attributes.position.array);
  for(let i=0;i<100;i++){const time=.1+i*.01;fx.explode(states.get('a'),time,i%2===0);fx.burst(mine,time);fx.update('a',time,states);assert.ok(root.getObjectByName('item-bursts').children.length<=16);}
  pools.forEach((p,i)=>assert.equal(p.geometry.attributes.position.array,buffers[i]));assert.ok(pools.some(p=>p.geometry.attributes.alpha.array.some(a=>a>0)));
  fx.update('a',4,states);assert.equal(root.getObjectByName('item-bursts').children.length,0);
  const resources=new Set();root.traverse(o=>{if(o.geometry&&!o.isSprite)resources.add(o.geometry);for(const mat of [].concat(o.material||[])){resources.add(mat);for(const v of Object.values(mat))if(v?.isTexture)resources.add(v);}});const counts=new Map([...resources].map(r=>{const count={n:0};r.addEventListener('dispose',()=>count.n++);return [r,count];}));
  // 被移除的动态物体与已归还池的爆炸材质也必须释放。
  const retired=missile.children[0].material;let retiredCount=0;retired.addEventListener('dispose',()=>retiredCount++);items.missiles.clear();items.mines.clear();fx.update('a',5,new Map());fx.dispose();fx.dispose();assert.deepEqual([...counts].filter(([,c])=>c.n!==1).map(([r,c])=>[r.type,c.n]),[]);assert.equal(retiredCount,1);assert.equal(scene.children.length,0);
 }finally{globalThis.document=previous;}
});
