import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from './session.js';
import T from './tuning.js';
import { THROTTLE,LEFT,DRIFT,JET,RESET } from './input-bits.js';
const track={length:10000,features:[],walls:[],heightAt:()=>0,surfaceAt:()=>0,at:s=>({x:0,y:0,z:s,tx:0,tz:1,w:100,bank:0}),nearest:(x,z)=>({path:'main',index:0,s:z,lateral:-x,y:0,w:100,bank:0,tx:0,tz:1}),checkpointGates:[{id:'finish',x:0,y:0,z:10000,s:10000,tx:0,tz:1,a:{x:-50,z:10000},b:{x:50,z:10000}}]};
const advance=(s,n,bits=0)=>{for(let i=0;i<n;i++)s.step(bits);};
const session=()=>{const s=createSession(track);advance(s,361);s.car.z=100;s.car.vz=60;return s;};
test('从未调用效果接口的车辆不新增效果字段',()=>{const s=session();advance(s,200);for(const k of ['spinTime','trapTime','shieldTime'])assert.equal(Object.hasOwn(s.car,k),false);});
test('spin 下一步减速至至多 .35，持续 1.2 秒且不转向、不漂移',()=>{
 const s=session();assert.equal(typeof s.applyEffect,'function');s.applyEffect('spin');assert.equal(s.car.vz,60);const yaw=s.car.yaw;advance(s,1,THROTTLE|LEFT|DRIFT);assert.ok(Math.hypot(s.car.vx,s.car.vz)<=60*.35);assert.equal(s.car.yaw,yaw);assert.ok(s.car.spinTime>0);
 advance(s,142,THROTTLE|LEFT|DRIFT);assert.ok(s.car.spinTime>0);s.step(THROTTLE|LEFT|DRIFT);assert.equal(s.car.spinTime,0);assert.equal(s.car.drifting,false);s.step(THROTTLE|LEFT);assert.notEqual(s.car.yaw,yaw);
});
test('trap 屏蔽所有输入、抵抗加速带与接触速度，整整一秒不移动',()=>{
 const s=session();assert.equal(typeof s.applyEffect,'function');s.car.boostTime=2;s.applyEffect('trap');const x=s.car.x,z=s.car.z;
 for(let i=0;i<120;i++){s.step(THROTTLE|LEFT|DRIFT|JET|RESET);assert.equal(s.car.vx,0);assert.equal(s.car.vz,0);assert.equal(s.car.x,x);assert.equal(s.car.z,z);assert.equal(s.car.y,0);}assert.equal(s.car.trapTime,0);s.step(THROTTLE);assert.ok(s.car.vz>0);
});
test('氮气复用 boostTime，不截短已有加速且不超过现有加速上限',()=>{
 const s=session();assert.equal(typeof s.applyEffect,'function');s.applyEffect('nitro');s.step(THROTTLE);assert.ok(Math.abs(s.car.boostTime-(T.nitroTime-T.dt))<1e-10);s.car.boostTime=3;s.applyEffect('nitro');s.step(0);assert.ok(s.car.boostTime>2.9);
 for(let i=0;i<2000;i++){if(i%100===0)s.applyEffect('nitro');s.step(THROTTLE);assert.ok(Math.hypot(s.car.vx,s.car.vz)<=T.maxSpeed+T.boostSpeed+1e-8);}
});
test('护盾五秒过期；按队列顺序抵消一次 spin / trap，只有 shieldBreak 无命中 effect',()=>{
 for(const kind of ['spin','trap']){const s=session();assert.equal(typeof s.applyEffect,'function');s.applyEffect('shield');s.applyEffect(kind);s.step(0);assert.equal(s.car.shieldTime,0);assert.deepEqual(s.snapshot.events.slice(-2).map(({type,kind})=>({type,kind})),[{type:'effect',kind:'shield'},{type:'shieldBreak',kind:undefined}]);s.applyEffect(kind);s.step(0);assert.ok(s.car[kind+'Time']>0);}
 const s=session();s.applyEffect('shield');advance(s,599);assert.ok(s.car.shieldTime>0);s.step(0);assert.equal(s.car.shieldTime,0);s.applyEffect('trap');s.step(0);assert.ok(s.car.trapTime>0);
});
test('效果接口在下一次 step 消费队列，倒数中同样记录生效事件',()=>{
 const s=createSession(track);s.applyEffect('shield');assert.equal(s.car.shieldTime,undefined);s.step(0);assert.equal(s.car.shieldTime,T.shieldTime);assert.equal(s.snapshot.events.at(-1).kind,'shield');
});
