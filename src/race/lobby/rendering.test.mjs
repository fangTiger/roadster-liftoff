import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { seatPosition, fitGarageCamera } from './garage.js';
import { cloneGarageCar, createSeatLoader } from './garage-cars.js';

test('桌面和手机展区完整容纳六个台、车和台前名牌，投影左右不重叠',()=>{
 for(const [width,height] of [[1016,860],[1050,520],[1050,390],[900,800]]){
  const camera=new THREE.PerspectiveCamera(38,1,.1,160);fitGarageCamera(camera,width,height);camera.updateMatrixWorld();
  const xs=[];
  for(let i=0;i<6;i++){
   const {x,z}=seatPosition(i);
   for(const dx of [-2.5,2.5])for(const y of [-.5,3.5])for(const dz of [-2.5,2.5]){
    const p=new THREE.Vector3(x+dx,y,z+dz).project(camera);
    assert.ok(Math.abs(p.x)<.98&&Math.abs(p.y)<.95,`展台 ${i} 被裁切：${p.toArray()}`);
   }
   const p=new THREE.Vector3(x,-.2,z+2.5).project(camera);xs.push((p.x*.5+.5)*width);
  }
  xs.sort((a,b)=>a-b);assert.ok(xs.slice(1).every((x,i)=>x-xs[i]>105),'名牌需要独立宽度');
 }
});

test('车库克隆独立车漆、几何与纹理，释放一个座位不影响源车或其他座位',()=>{
 const source=new THREE.Group(),map=new THREE.Texture(),material=new THREE.MeshStandardMaterial({name:'car_main_paint',color:'white',map});source.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 const red=cloneGarageCar(source,'#ef5350'),blue=cloneGarageCar(source,'#42b9ff');
 assert.equal(red.children[0].material.color.getHexString(),'ef5350');assert.equal(blue.children[0].material.color.getHexString(),'42b9ff');assert.equal(material.color.getHexString(),'ffffff');
 assert.notEqual(red.children[0].geometry,source.children[0].geometry);assert.notEqual(red.children[0].material.map,map);
 let disposed=0;red.children[0].material.addEventListener('dispose',()=>disposed++);red.userData.dispose();red.userData.dispose();assert.equal(disposed,1);assert.equal(blue.children[0].material.color.getHexString(),'42b9ff');blue.userData.dispose();
});

test('席位异步乱序、同 id 换色、准备状态更新和销毁后返回均不挂旧车或泄漏',async()=>{
 const pending=[],attached=[],removed=[];let disposed=0;
 const loader=createSeatLoader(()=>new Promise(resolve=>pending.push(resolve)),(car,i,data)=>attached.push({car,i,data}),(car)=>{removed.push(car);car.userData.dispose();});
 const player={id:'a',color:'red',ready:false};const layout=p=>[p,null,null,null,null,null];
 const car=()=>({userData:{dispose(){disposed++;}}});
 loader.update(layout(player));loader.update(layout({...player,color:'blue'}));pending[0](car());await Promise.resolve();assert.equal(attached.length,0);assert.equal(disposed,1);
 loader.update(layout({...player,color:'blue',ready:true}));pending[1](car());await Promise.resolve();assert.equal(attached.length,1);assert.equal(attached[0].data.ready,true);
 loader.update(layout(null));assert.equal(removed.length,1);
 loader.update(layout(player));loader.dispose();loader.dispose();pending[2](car());await Promise.resolve();assert.equal(attached.length,1);assert.equal(disposed,3);
});

test('源车位图仅在最后关闭一次，单席释放不能关闭其他座位共用的位图',async()=>{
 const {createGarageCarLoader}=await import('./garage-cars.js');let closed=0;
 const bitmap={width:16,height:16,close(){closed++;}},texture=new THREE.Texture(bitmap),root=new THREE.Group();
 const material=new THREE.MeshStandardMaterial({map:texture,normalMap:texture});root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 const loader=createGarageCarLoader(async()=>({root})),car=await loader.load('#ef5350');
 car.userData.dispose();assert.equal(closed,0);loader.dispose();loader.dispose();assert.equal(closed,1);
 let resolve;const lateRoot=new THREE.Group();lateRoot.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:new THREE.Texture(bitmap)})));
 const late=createGarageCarLoader(()=>new Promise(r=>resolve=r)),pending=late.load('red');late.dispose();resolve({root:lateRoot});await assert.rejects(pending,/展厅已释放/);assert.equal(closed,2);
});

test('普通车型和自定义释放器均从场景移除且只释放一次',async()=>{
 const {disposeGarageCar}=await import('./garage-cars.js');assert.equal(typeof disposeGarageCar,'function');
 const parent=new THREE.Group(),car=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());car.add(mesh);parent.add(car);let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);
 disposeGarageCar(car);disposeGarageCar(car);assert.equal(disposed,1);assert.equal(parent.children.length,0);assert.equal(car.userData.garageDisposed,true);
 const custom=new THREE.Group();parent.add(custom);custom.userData.dispose=()=>disposed++;disposeGarageCar(custom);disposeGarageCar(custom);assert.equal(disposed,2);assert.equal(parent.children.length,0);assert.equal(custom.userData.garageDisposed,true);
});
