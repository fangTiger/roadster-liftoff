import test from 'node:test';
import assert from 'node:assert/strict';
import { pushState, sampleState } from './interp.js';
const pose=(serverT,x,yaw=0)=>({seq:serverT,serverT,simT:serverT,x,y:1,z:0,yaw,pitch:0,vx:20,vz:10,steer:0,drifting:false,boost:false,ghost:false,air:false,lap:1,s:x});
test('按服务器时间减 100ms 插值，航向走最短弧，不改动缓冲',()=>{
 const a=pushState([],pose(1000,0,3.1)),b=pushState(a,pose(1200,4,-3.1));const s=sampleState(b,1200);assert.equal(s.x,2);assert.ok(Math.abs(Math.abs(s.yaw)-Math.PI)<1e-6);assert.equal(a.length,1);assert.equal(s.stale,false);
});
test('外推只延续 250ms，超过 3 秒 stale；恢复新状态立即解除',()=>{
 const b=pushState([],pose(1000,0));assert.equal(sampleState(b,1300).x,4);assert.equal(sampleState(b,2000).x,5);assert.equal(sampleState(b,4000).stale,false);assert.equal(sampleState(b,4001).stale,true);assert.equal(sampleState(pushState(b,pose(4001,50)),4001).stale,false);assert.equal(sampleState([],10),null);
});
test('丢弃重复与乱序状态，缓冲区有界，早于首帧不倒推',()=>{
 let b=[];for(let i=1;i<=100;i++)b=pushState(b,pose(i*100, i));assert.ok(b.length<=64);assert.equal(pushState(b,pose(1,100)),b);assert.equal(sampleState(b,0).x,b[0].x);
});
test('插值按 simT 排列，上传抖动不影响位置；serverT 仅决定 stale',()=>{
 const a={...pose(1100,0),simT:1000},b={...pose(1450,4),simT:1200,ghost:true,air:true},buffer=pushState(pushState([],a),b);
 assert.equal(sampleState(buffer,1200).x,2);assert.equal(sampleState(buffer,1400).x,6);
 assert.equal(sampleState(buffer,4450).stale,false);assert.equal(sampleState(buffer,4451).stale,true);
 assert.equal(sampleState(buffer,1300).ghost,true);assert.equal(sampleState(buffer,1300).air,true);
 assert.equal(pushState(buffer,{...pose(1500,5),simT:1190}),buffer);
});
test('接触采样指定当前步模拟时间，不减 100ms，外推上限 250ms 且独立判断 stale',()=>{
 const buffer=pushState([],{...pose(1300,0),simT:1000});
 assert.equal(sampleState(buffer,1300,1100).x,2);assert.equal(sampleState(buffer,1300,2000).x,5);
 assert.equal(sampleState(buffer,4301,1000).stale,true);
});
