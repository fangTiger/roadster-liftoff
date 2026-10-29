import test from 'node:test';
import assert from 'node:assert/strict';
import { pushState, sampleState } from './interp.js';
const pose=(serverT,x,yaw=0)=>({seq:serverT,serverT,x,y:1,z:0,yaw,pitch:0,vx:20,vz:10,steer:0,drifting:false,boost:false,lap:1,s:x});
test('按服务器时间减 100ms 插值，航向走最短弧，不改动缓冲',()=>{
 const a=pushState([],pose(1000,0,3.1)),b=pushState(a,pose(1200,4,-3.1));const s=sampleState(b,1200);assert.equal(s.x,2);assert.ok(Math.abs(Math.abs(s.yaw)-Math.PI)<1e-6);assert.equal(a.length,1);assert.equal(s.stale,false);
});
test('外推只延续 250ms，超过 3 秒 stale；恢复新状态立即解除',()=>{
 const b=pushState([],pose(1000,0));assert.equal(sampleState(b,1300).x,4);assert.equal(sampleState(b,2000).x,5);assert.equal(sampleState(b,4000).stale,false);assert.equal(sampleState(b,4001).stale,true);assert.equal(sampleState(pushState(b,pose(4001,50)),4001).stale,false);assert.equal(sampleState([],10),null);
});
test('丢弃重复与乱序状态，缓冲区有界，早于首帧不倒推',()=>{
 let b=[];for(let i=1;i<=100;i++)b=pushState(b,pose(i*100, i));assert.ok(b.length<=64);assert.equal(pushState(b,pose(1,100)),b);assert.equal(sampleState(b,0).x,b[0].x);
});
