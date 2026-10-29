import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from './session.js';
import {DT} from './physics.js';
import {RESET,JET} from './input-bits.js';
const track={length:1000,features:[],walls:[],heightAt:()=>0,surfaceAt:()=>0,
 at:s=>({x:0,y:0,z:s,tx:0,tz:1,w:100,bank:0}),
 nearest:(x,z)=>({path:'main',index:0,s:z,lateral:-x,y:0,w:100,bank:0,tx:0,tz:1}),
 checkpointGates:[{id:'finish',x:0,y:0,z:1000,s:1000,tx:0,tz:1,a:{x:-50,z:1000},b:{x:50,z:1000}}]};
function fixture(){const calls=[];let session;session=createSession(track,{laps:1,contacts:step=>{calls.push(step);return [{id:'b',x:session.car.x+1.8,z:session.car.z,yaw:0,vx:0,vz:0}];}});return {session,calls};}
const advance=(s,n,bits=0)=>{for(let i=0;i<n;i++)s.step(bits);};
test('倒计时及发车后 3 秒内不调用 contacts，允许后在物理推进后解析并记录 step',()=>{
 const {session:s,calls}=fixture();advance(s,360);assert.equal(calls.length,0);assert.equal(s.ghost,false);
 advance(s,361);assert.equal(calls.length,0);s.car.vx=6;s.car.vz=10;s.step(0);
 assert.deepEqual(calls,[722]);assert.equal(s.snapshot.events.at(-1).type,'contact');assert.equal(s.snapshot.events.at(-1).step,722);assert.ok(s.car.x<0);
 const descriptor=Object.getOwnPropertyDescriptor(s,'ghost');assert.equal(descriptor.set,undefined);
});
test('重置保护以模拟时间计而不受 3 秒罚时影响，手动及自动重置都触发',()=>{
 const {session:s,calls}=fixture();advance(s,800);s.step(RESET);const before=calls.length;assert.equal(s.ghost,true);assert.equal(s.race.penalty,3);
 advance(s,239);assert.equal(s.ghost,true);assert.equal(calls.length,before);s.step(0);assert.equal(s.ghost,false);assert.equal(calls.length,before);s.step(0);assert.equal(calls.length,before+1);
 const gap={...track,surfaceAt:()=>6,heightAt:()=>-100};const falling=createSession(gap,{contacts:()=>assert.fail('坠落时不应接触')});advance(falling,800);falling.car.grounded=false;falling.car.y=-10;falling.step(0);assert.ok(falling.snapshot.events.some(e=>e.type==='reset'&&e.reason==='fell'));assert.equal(falling.ghost,true);
});
test('离地的物理步与完赛后的物理步都不调用 contacts，完赛立即 ghost',()=>{
 const {session:s,calls}=fixture();advance(s,800);const before=calls.length;s.step(JET);assert.equal(s.car.grounded,false);assert.equal(calls.length,before);
 s.car.grounded=true;s.car.y=0;s.car.vy=0;s.car.x=0;s.car.z=999.99;s.car.vz=10;s.step(0);assert.equal(s.race.finished,true);assert.equal(s.ghost,true);
 const done=calls.length;advance(s,300);assert.equal(calls.length,done);assert.equal(s.ghost,true);
});
test('未传 contacts 与返回空数组的会话逐步一致（快照不增加字段）',()=>{
 const a=createSession(track),b=createSession(track,{contacts:()=>[]});
 for(let i=0;i<1000;i++){const bits=i===800?RESET:0;a.step(bits);b.step(bits);assert.deepEqual(a.snapshot,b.snapshot);}
 assert.equal(DT,1/120);
});
test('会话的接触身份在重置后保留，重合静止车仍反向推出且不改变快照形状',()=>{
 const s=createSession(track,{contactId:'a',contacts:()=>[{id:'b',x:s.car.x,z:s.car.z,yaw:s.car.yaw,vx:s.car.vx,vz:s.car.vz}]});
 advance(s,722);assert.equal(s.car.x,-.25);assert.equal(s.car.id,undefined);s.step(RESET);advance(s,241);assert.equal(s.car.x,-.25);
});
