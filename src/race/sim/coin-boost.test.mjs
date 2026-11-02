import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from './session.js';
import { createCarState,stepCar,SIM_VERSION } from './physics.js';
import { buildTrack } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
import { autopilot } from './autopilot.js';
import { RESET } from './input-bits.js';
import T from './tuning.js';
const track=buildTrack(TRACKS[0].def),at=track.length-12;
const coinTrack={...track,features:[{type:'coins',from:at,to:at,count:12,height:1}]};
test('金币选项默认关闭，三图显式关闭与默认每步状态、事件及录像版本逐位一致',()=>{
 assert.equal(SIM_VERSION,1);
 for(const {def} of TRACKS){const t=buildTrack(def),a=createSession(t),b=createSession(t,{coinBoost:false});
  assert.equal('coins' in a.car,false);for(let i=0;i<1000;i++){const bits=autopilot({car:a.car},t);a.step(bits);b.step(bits);assert.deepEqual(a.snapshot,b.snapshot);}
 }
});
test('道具赛金币封顶十枚，每圈拾取，重置不清空金币',()=>{
 const s=createSession(coinTrack,{coinBoost:true});assert.equal(s.car.coins,0);
 for(let i=0;i<362;i++)s.step(0);assert.equal(s.car.coins,10);assert.equal(s.snapshot.events.filter(e=>e.type==='coin'&&e.gained===1).length,10);
 s.step(RESET);assert.equal(s.car.coins,10);
});
test('追赶补给复用名次比例，最后一名双倍且燃料封顶',()=>{
 for(const rankFraction of [0,.5,1]){const s=createSession({...coinTrack,features:[{type:'coins',from:at,to:at,count:1,height:1}]},{coinBoost:true});
  for(let i=0;i<360;i++)s.step(0);s.car.fuel=.1;s.setRankFraction(rankFraction);s.step(0);assert.ok(Math.abs(s.car.fuel-(.1+T.fuelRecharge*T.dt+T.coinFuel*(1+rankFraction)))<1e-10);
 }
});
test('导弹与水雷在实际效果处减半并发 coinLoss，护盾与非道具赛不掉',()=>{
 for(const kind of ['spin','trap'])for(const shield of [false,true]){
  const s=createSession(track,{coinBoost:true});s.car.coins=7;if(shield)s.applyEffect('shield');s.applyEffect(kind);s.step(0);
  assert.equal(s.car.coins,shield?7:3);assert.equal(s.snapshot.events.find(e=>e.type==='coinLoss')?.count,shield?undefined:4);
 }
 const s=createSession(track);s.applyEffect('spin');s.step(0);assert.equal('coins' in s.car,false);assert.equal(s.snapshot.events.some(e=>e.type==='coinLoss'),false);
});
test('启用后极速上限每枚增加百分之一，关闭时忽略 coins',()=>{
 const t={nearest:(x,z)=>({path:'main',s:z,lateral:0,y:0,w:1000,bank:0}),surfaceAt:()=>0,heightAt:()=>0,walls:[],features:[]};
 for(const coinBoost of [false,true])for(const coins of [0,5,10]){const c=createCarState();c.coins=coins;c.vz=130;c.boostTime=2;stepCar(c,1,{track:t,coins:[],coinBoost});
  assert.ok(Math.abs(c.vz-(T.maxSpeed+T.boostSpeed)*(coinBoost?1+.01*coins:1))<1e-6);
 }
});

test('普通直道真实油门终速随金币提高，而非只抬高无法达到的限速',()=>{
 const t={nearest:(x,z)=>({path:'main',s:z,lateral:0,y:0,w:1000,bank:0}),surfaceAt:()=>0,heightAt:()=>0,walls:[],features:[]},speeds=[];
 for(const coins of [0,5,10]){const c=createCarState();c.coins=coins;for(let i=0;i<120*90;i++)stepCar(c,1,{track:t,coins:[],coinBoost:true});speeds.push(c.vz);}
 assert.ok(Math.abs(speeds[1]/speeds[0]-1.05)<.001);assert.ok(Math.abs(speeds[2]/speeds[0]-1.1)<.001);
});

const straight={nearest:(x,z)=>({path:'main',s:z,lateral:0,y:0,w:1000,bank:0}),surfaceAt:()=>0,heightAt:()=>0,walls:[],features:[]};
test('每次拾取刷新独立四百毫秒冲刺，满层仍触发且不缩短已有冲刺',()=>{
 const c=createCarState();c.coins=10;c.coinDash=0;c.boostTime=1;
 const pickup=id=>stepCar(c,0,{track:straight,coinBoost:true,coins:[{id,x:c.x,y:c.y+T.height/2,z:c.z}]});
 assert.equal(pickup('a')[0].gained,0);assert.equal(c.coinDash,.4);assert.ok(Math.abs(c.boostTime-(1-T.dt))<1e-12);
 for(let i=0;i<24;i++)stepCar(c,0,{track:straight,coinBoost:true,coins:[]});assert.ok(Math.abs(c.coinDash-.2)<1e-12);
 pickup('b');assert.equal(c.coinDash,.4);c.coinDash=.8;pickup('c');assert.ok(Math.abs(c.coinDash-(.8-T.dt))<1e-12);
 c.coinDash=.4;for(let i=0;i<48;i++)stepCar(c,0,{track:straight,coinBoost:true,coins:[]});assert.equal(c.coinDash,0);
});
test('金币冲刺直行与漂移均额外增加四成加速推力，时长不改氮气',()=>{
 for(const drifting of [false,true]){
  const a=createCarState(),b=createCarState();for(const c of [a,b]){c.coins=3;c.vz=30;c.boostTime=1;if(drifting){c.driftDir=1;c.driftBlend=1;c.steer=.5;}}
  a.coinDash=.4;b.coinDash=0;const bits=drifting?1|4|64:1;
  stepCar(a,bits,{track:straight,coinBoost:true,coins:[]});stepCar(b,bits,{track:straight,coinBoost:true,coins:[]});
  assert.ok(Math.abs(Math.hypot(a.vx,a.vz)-Math.hypot(b.vx,b.vz)-.4*T.boostAcceleration*T.dt)<1e-9);assert.equal(a.boostTime,b.boostTime);assert.ok(Math.abs(a.coinDash-(.4-T.dt))<1e-12);
 }
});
test('金币冲刺额外极速在金币倍率之后相加，可与氮气叠加',()=>{
 for(const coins of [0,7,10])for(const boostTime of [0,1]){const c=createCarState();Object.assign(c,{coins,coinDash:.4,boostTime,vz:200});stepCar(c,1,{track:straight,coinBoost:true,coins:[]});assert.ok(Math.abs(c.vz-((T.maxSpeed+(boostTime?T.boostSpeed:0))*(1+.01*coins)+.4*T.boostSpeed))<1e-9);}
});
test('关闭金币增益完全忽略冲刺字段，拾取不创建状态，默认会话与 SIM_VERSION 不变',()=>{
 const a=createCarState(),b=createCarState();b.coinDash=.4;b.coins=10;
 for(let i=0;i<120;i++){const options={track:straight,coins:[{id:'x',x:0,y:T.height/2,z:0}]};assert.deepEqual(stepCar(a,1,options),stepCar(b,1,{...options,coinBoost:false}));const {coinDash,coins,...rest}=b;assert.deepEqual(a,rest);assert.equal(coinDash,.4);}
 assert.equal('coinDash' in a,false);assert.equal('coinDash' in createSession(track).car,false);assert.equal(SIM_VERSION,1);
});
test('仅道具赛初始化冲刺，车辆重置清除短冲刺但保留金币',()=>{
 const s=createSession(coinTrack,{coinBoost:true});assert.equal(s.car.coinDash,0);for(let i=0;i<361;i++)s.step(0);assert.equal(s.car.coinDash,.4);s.step(RESET);assert.equal(s.car.coinDash,0);assert.equal(s.car.coins,10);
});
