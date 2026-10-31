import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frontThreeQuarterYaw, readyTurn } from './garage-motion.js';
import { measureCarBounds, measureCarCorners, projectCarBounds, placePlate, intersects } from './garage-layout.js';
import { createScreenGeometry, configureScreenTexture } from './garage-screen.js';

test('主车及两侧车辆始终以相对镜头 40 度的左前脸待机',()=>{
 for(const x of [-10.5,-6.8,0,6.8,10.5]){
  const z=x===0?0:-8,camera=new THREE.Vector3(0,7.2,16.4);
  const yaw=frontThreeQuarterYaw(x,z,camera);
  const front=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const view=new THREE.Vector3(-x,0,camera.z-z).normalize();
  assert.ok(Math.abs(front.angleTo(view)-THREE.MathUtils.degToRad(40))<1e-6);
  assert.ok(front.x*view.z-front.z*view.x<0,'车头朝镜头左前方');
 }
});
test('准备先闪前灯，再转身展示尾焰，最后准确回到前脸',()=>{
 assert.equal(readyTurn(0),0);assert.equal(readyTurn(.25),0);
 assert.ok(readyTurn(.9)<-1.5);assert.equal(readyTurn(2.4),0);
 assert.equal(readyTurn(.9,true),0);
});
test('名牌优先在展台前沿横向避让所有车辆，避免堆到主车脚下',()=>{
 const boxes=[{left:100,right:240,top:80,bottom:220},{left:170,right:330,top:230,bottom:310}];
 const plate=placePlate({x:200,y:180,width:128,height:48},boxes,500);
 assert.equal(plate.top,180);
 for(const box of boxes)assert.equal(intersects(plate,box),false);
 assert.equal(intersects({left:0,right:10,top:0,bottom:10},{left:10,right:20,top:0,bottom:10}),false);
});
test('联合布局避让已放置的名牌，且保留屏幕底部空间',()=>{
 const cars=[{left:125,right:820,top:350,bottom:765},{left:47,right:311,top:350,bottom:478}];
 const rear=placePlate({x:92,y:418,width:112,height:46},cars,1054,900);
 const front=placePlate({x:147,y:528,width:112,height:46},[...cars,rear],1054,900);
 assert.equal(intersects(rear,front),false);assert.ok(rear.bottom<600&&front.bottom<650);
});
test('车身投影跟随缩放旋转及相机，包住实际八角点',()=>{
 const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,7,16);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 const car=new THREE.Group();car.rotation.y=2.4;car.scale.setScalar(2.1);car.updateMatrixWorld();
 const box=new THREE.Box3(new THREE.Vector3(-1,0,-2.4),new THREE.Vector3(1,1.3,2.4));
 const result=projectCarBounds(box,car.matrixWorld,camera,900,900);
 assert.ok(result.right>result.left&&result.bottom>result.top);
 for(const x of [-1,1])for(const y of [0,1.3])for(const z of [-2.4,2.4]){
  const p=new THREE.Vector3(x,y,z).applyMatrix4(car.matrixWorld).project(camera),px=(p.x*.5+.5)*900,py=(-p.y*.5+.5)*900;
  assert.ok(px>=result.left&&px<=result.right&&py>=result.top&&py<=result.bottom);
 }
});
test('弧形屏有曲率，实景纹理开启色彩空间、mipmap 和各向异性',()=>{
 const geometry=createScreenGeometry();const position=geometry.getAttribute('position');
 const zs=Array.from({length:position.count},(_,i)=>position.getZ(i));assert.ok(Math.max(...zs)-Math.min(...zs)>2);
 const texture=new THREE.Texture();configureScreenTexture(texture,16);
 assert.equal(texture.colorSpace,THREE.SRGBColorSpace);assert.equal(texture.generateMipmaps,true);
 assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(texture.anisotropy,16);geometry.dispose();texture.dispose();
});
test('车身包围盒忽略隐藏的原车推进器，且保持局部坐标',()=>{
 const car=new THREE.Group();car.position.x=20;car.scale.setScalar(2);
 const body=new THREE.Mesh(new THREE.BoxGeometry(2,1,4),new THREE.MeshBasicMaterial());car.add(body);
 const hidden=new THREE.Mesh(new THREE.BoxGeometry(50,50,50),body.material);hidden.visible=false;car.add(hidden);
 const box=measureCarBounds(car);assert.deepEqual(box.min.toArray(),[-1,-.5,-2]);assert.deepEqual(box.max.toArray(),[1,.5,2]);body.geometry.dispose();hidden.geometry.dispose();body.material.dispose();
});
test('投影逐个车身零件取角点，避免整体包围盒旋转后的空角挤走名牌',()=>{
 const car=new THREE.Group(),material=new THREE.MeshBasicMaterial();
 for(const x of [-2,2]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),material);mesh.position.set(x,0,x);car.add(mesh);}
 const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,4,16);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const corners=measureCarCorners(car);assert.equal(corners.length,16);
 car.rotation.y=Math.PI/4;car.updateMatrixWorld();
 const tight=projectCarBounds(corners,car.matrixWorld,camera,900,900),loose=projectCarBounds(measureCarBounds(car),car.matrixWorld,camera,900,900);
 assert.ok(tight.bottom-tight.top<loose.bottom-loose.top);
 for(const mesh of car.children)mesh.geometry.dispose();material.dispose();
});
