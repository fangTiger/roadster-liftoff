import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareRemoteCar } from './remote-car.js';
test('独立远端车按座位着色、全不透明、有名牌、轮子跟随状态、断流继续显示与恢复',()=>{
 const before=globalThis.document,text=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillText:s=>text.push(s)})})};
 try{
  const root=new THREE.Group(),chassis=new THREE.Group(),source=new THREE.MeshStandardMaterial({name:'car_main_paint',color:'white'}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),source);root.add(chassis);chassis.add(mesh);
  let freedGeometry=0,freedTexture=0;mesh.geometry.addEventListener('dispose',()=>freedGeometry++);source.map=new THREE.Texture();source.map.addEventListener('dispose',()=>freedTexture++);
  const wheels=[{front:true,spin:new THREE.Group(),steer:new THREE.Group()}],car=prepareRemoteCar({root,chassis,wheels,setSteer(){}},{name:'甲',color:'#42b9ff'});
  assert.notEqual(mesh.material,source);assert.equal(source.color.getHexString(),'ffffff');assert.equal(mesh.material.color.getHexString(),'42b9ff');assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);assert.ok(root.children.some(c=>c.isSprite));assert.deepEqual(text,['甲']);const label=root.children.find(c=>c.isSprite);assert.equal(label.material.depthTest,false);assert.equal(label.material.fog,false);assert.equal(label.material.sizeAttenuation,false);assert.ok(label.renderOrder>=999);const pixelWidth=label.scale.x/(2*Math.tan(26*Math.PI/180))*900;assert.ok(Math.abs(pixelWidth-110)<1);label.onBeforeRender(null,null,new THREE.PerspectiveCamera(66));assert.ok(Math.abs(label.scale.x/(2*Math.tan(33*Math.PI/180))*900-110)<1);assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(label.matrixWorld).x-label.scale.x)<1e-8);
  const state={x:1,y:2,z:3,yaw:.5,pitch:.1,steer:.8,vx:10,vz:0,stale:false};car.update(state,.1);assert.equal(root.position.x,1);assert.equal(chassis.rotation.x,.1);assert.ok(wheels[0].spin.rotation.x<0);assert.equal(wheels[0].steer.rotation.y,.8*.35);
  car.update({...state,ghost:true},.1);assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);assert.equal(source.opacity,1);
  car.update(state,.1);assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);
  car.update({...state,spinning:true},.1);assert.ok(root.rotation.y>state.yaw+Math.PI);assert.equal(state.yaw,.5);car.update({...state,spinning:true},1.4);assert.ok(root.rotation.y>state.yaw+Math.PI,'连续命中延长打转时应继续旋转');car.update({...state,spinning:false},.1);assert.equal(root.rotation.y,state.yaw+Math.PI);car.update({...state,stale:true},1);assert.equal(root.visible,true);assert.equal(root.position.x,state.x);car.update(null,1);assert.equal(root.visible,false);car.update(state,1);assert.equal(root.visible,true);assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);car.dispose();assert.equal(freedGeometry,1);assert.equal(freedTexture,1);
 }finally{globalThis.document=before;}
});

test('机器人名牌按难度本地化，切换语言重绘，销毁取消监听',async()=>{
 const {setLang}=await import('../i18n/i18n.js'),before=globalThis.document,text=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillText:s=>text.push(s)})})};
 try{const root=new THREE.Group(),remote=prepareRemoteCar({root,chassis:new THREE.Group(),wheels:[],setSteer(){}},{bot:true,difficulty:'easy'});assert.equal(text.at(-1),'机器人·简单');setLang('en');assert.equal(text.at(-1),'Bot · Easy');remote.dispose();const count=text.length;setLang('zh');assert.equal(text.length,count);
 }finally{setLang('zh');globalThis.document=before;}
});
