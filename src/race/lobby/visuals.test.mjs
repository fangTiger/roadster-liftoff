import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { seatPosition, fitGarageCamera } from './garage.js';
import { readyEnvelope, cameraProgress } from './garage-motion.js';
import { trackPreview } from './track-previews.js';

test('任意本机席位居中，其余五席互不重叠且保留协议顺序',()=>{
 for(let self=0;self<6;self++){
  assert.equal(seatPosition(self,self).x,0);assert.equal(seatPosition(self,self).z,0);
  const others=Array.from({length:6},(_,i)=>i).filter(i=>i!==self).map(i=>seatPosition(i,self));
  assert.equal(new Set(others.map(p=>p.x)).size,5);
  assert.ok(others.every(p=>p.z<0&&Math.abs(p.x)>5));
 }
});
test('桌面主车实际包围盒投影高度达到视口的三成',()=>{
 const camera=new THREE.PerspectiveCamera(40,1,.1,160);fitGarageCamera(camera,1054,900);
 const points=[];for(const x of [-1.1,1.1])for(const y of [0,1.3])for(const z of [-2.4,2.4])points.push(new THREE.Vector3(x*2.1,y*2.1+.28,z*2.1).project(camera));
 const ys=points.map(p=>p.y);assert.ok((Math.max(...ys)-Math.min(...ys))*.5>=.3);
});
test('准备反馈有两次灯闪和一次短尾焰，结束回归静态',()=>{
 assert.equal(readyEnvelope(.04).headlights,5);assert.equal(readyEnvelope(.15).headlights,.2);assert.equal(readyEnvelope(.25).headlights,5);
 assert.equal(readyEnvelope(.25).boost,false);assert.ok(readyEnvelope(.9).boost);assert.equal(readyEnvelope(2.4).boost,false);assert.equal(readyEnvelope(2.4).headlights,1.2);
});
test('入场和开赛镜头到达边界，减少运动立即到位',()=>{
 assert.equal(cameraProgress(0,1.2,false),0);assert.equal(cameraProgress(1.2,1.2,false),1);assert.equal(cameraProgress(0,1.2,true),1);
});
test('三张实景具有真实长度、中心线和仅困难图开放的推进器',()=>{
 for(const id of [1,2,3]){const p=trackPreview(id);assert.ok(p.length>100);assert.match(p.image,/\/assets\/race\/previews\/.+\.webp$/);assert.match(p.path,/^M.+Z$/);assert.equal(p.jet,id===3);}
});

test('所有座位连同车身与展台后沿都在实体背景墙前，满员不会藏车',async()=>{
 const {GARAGE_WALL_DEPTH}=await import('./garage.js');
 assert.ok(Number.isFinite(GARAGE_WALL_DEPTH));
 for(let self=0;self<6;self++)for(let i=0;i<6;i++)assert.ok(seatPosition(i,self).z-4>GARAGE_WALL_DEPTH);
});
