import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarState, stepCar, DT } from './physics.js';
import { THROTTLE, BRAKE, JET, DRIFT, RIGHT } from './input-bits.js';
const straight=(surface=0)=>({nearest:(x,z)=>({path:'main',index:0,s:z,lateral:-x,y:0,w:1000,bank:0,tx:0,tz:1}),surfaceAt:()=>surface,heightAt:()=>0,walls:[],features:[],at:s=>({x:0,z:s,y:0,tx:0,tz:1,w:1000,bank:0})});
function run(car,bits,n,track=straight()) {const events=[];for(let i=0;i<n;i++)events.push(...stepCar(car,bits,{track,step:i}));return events;}
test('直线起步、恒功率极速、刹车与倒车',()=>{
 const c=createCarState({});run(c,THROTTLE,150);assert.ok(c.vz>27.78);run(c,THROTTLE,120*40);assert.ok(c.vz>80&&c.vz<85);
 c.vz=27.78;const z=c.z;run(c,BRAKE,110);assert.ok(c.z-z<18);run(c,BRAKE,600);assert.ok(c.vz<0&&c.vz>=-12.01);
});
test('沙地极速显著低于柏油',()=>{const c=createCarState({});run(c,THROTTLE,5000,straight(2));assert.ok(c.vz>25&&c.vz<35);});
test('正撞墙推出且大幅减速，擦墙损失较小',()=>{
 const t=straight();t.walls=[{a:{x:-50,z:10},b:{x:50,z:10}}];const c=createCarState({});c.vz=60;const ev=run(c,0,30,t);assert.ok(ev.some(e=>e.type==='wall'));assert.ok(c.z<9);assert.ok(Math.abs(c.vz)<10);
 const d=createCarState({x:0,z:7.7});d.vx=40;d.vz=2;run(d,0,10,t);assert.ok(d.vx>30);
});
test('推进器消耗燃料、离地后受重力并落地',()=>{const c=createCarState({});const e=run(c,JET,120);assert.ok(c.y>1&&!c.grounded);assert.ok(c.fuel<.65);const ev=run(c,0,600);assert.ok(ev.some(e=>e.type==='land'));assert.equal(c.grounded,true);assert.equal(c.y,0);});
test('加速带触发且增加动力',()=>{const t=straight();t.features=[{type:'boost',x:0,z:0,tx:0,tz:1,length:16,width:9}];const c=createCarState({});assert.ok(run(c,THROTTLE,1,t).some(e=>e.type==='boost'));assert.ok(c.boostTime>1);});
test('漂移按横滑时长积攒三档并在释放时加速',()=>{
 for(const [seconds,tier] of [[.8,1],[1.5,2],[2.2,3]]) {const c=createCarState({});c.vz=50;c.vx=3;c.steer=1;run(c,THROTTLE|DRIFT|RIGHT,Math.ceil(seconds/DT));const ev=run(c,THROTTLE,1);assert.equal(ev.find(e=>e.type==='driftBoost')?.tier,tier);}
});
test('金币补燃料，每圈重新出现',()=>{const t=straight();t.features=[{type:'coins',from:0,to:0,count:1,lateral:0,height:1}];const c=createCarState({});c.fuel=.2;assert.ok(run(c,0,1,t).some(e=>e.type==='coin'));assert.ok(c.fuel>.27);assert.equal(run(c,0,1,t).filter(e=>e.type==='coin').length,0);c.lap=2;assert.ok(run(c,0,1,t).some(e=>e.type==='coin'));});
test('碰撞推离斜坡时不把水平位置修正变成向上弹射',()=>{
 const t=straight();t.nearest=(x,z)=>({path:'main',index:0,s:z,lateral:-x,y:x*.5,w:100,bank:0,tx:0,tz:1});t.walls=[{a:{x:0,z:-50},b:{x:0,z:50}}];
 const c=createCarState({x:.3,y:.15});c.vx=-5;run(c,THROTTLE,120,t);assert.ok(c.y<5);assert.ok(Math.abs(c.vy)<15);
});
test('翻滚窄缝平放不能穿过、侧立姿态可以通过',()=>{
 const t=straight();t.walls=[-1,1].map(side=>({type:'slot',a:{x:side*.675,z:0},b:{x:side*.675,z:8}}));
 const flat=createCarState({z:-4}),side=createCarState({z:-4});side.roll=Math.PI/2;
 run(flat,THROTTLE,240,t);run(side,THROTTLE,240,t);assert.ok(flat.z<0);assert.ok(side.z>8);
});
test('翻滚按下沿触发，持续按住只转一次',async()=>{
 const {ROLL}=await import('./input-bits.js');const c=createCarState({});run(c,ROLL|RIGHT,60);assert.ok(c.roll<0);run(c,ROLL|RIGHT,180);assert.equal(c.rollTime,0);assert.equal(c.roll,0);
});
test('路面下降形成自然腾空并重新落地',()=>{
 const t=straight();t.nearest=(x,z)=>({path:'main',index:Math.floor(z),s:z,lateral:-x,y:z<3?z*.2:0,w:1000,bank:0,tx:0,tz:1});
 const c=createCarState({});c.vz=20;const ev=run(c,THROTTLE,240,t);assert.ok(ev.some(e=>e.type==='land'&&e.impact>1));
});
test('落石命中减速偏航，同块石头一秒内不重复',()=>{
 const c=createCarState({});c.vz=30;const hazards={positions:()=>[{id:0,x:0,z:.1,y:.5,radius:1,direction:-1}]},t=straight();
 const ev=stepCar(c,0,{track:t,hazards,step:0});assert.ok(ev.some(e=>e.type==='rock'));assert.ok(c.vz<19);assert.ok(c.yawKick<0);
 assert.ok(!stepCar(c,0,{track:t,hazards,step:1}).some(e=>e.type==='rock'));
});
test('七米高翻滚巨石在低空也阻挡平放车身',()=>{
 const t=straight();t.walls=[{type:'slot',a:{x:-50,z:0},b:{x:50,z:0}}];const c=createCarState({z:-4,y:2});c.grounded=false;c.vz=40;
 const e=run(c,0,20,t);assert.ok(e.some(x=>x.type==='wall'));assert.ok(c.z<0);
});
test('真实翻滚能侧立通过窄缝，错误时机不得由两侧推挤穿透',async()=>{
 const {ROLL}=await import('./input-bits.js');const t=straight();t.features=[{type:'slot',x:0,z:0,y:0,tx:0,tz:1,width:1.35,rockRadius:4,height:7}];t.walls=[-1,1].map(side=>({type:'slot',a:{x:side*.675,z:-4},b:{x:side*.675,z:4}}));
 const good=createCarState({z:-25});good.vz=83;run(good,THROTTLE|ROLL,55,t);assert.ok(good.z>7);
 const bad=createCarState({z:-25});bad.vz=83;const ev=run(bad,THROTTLE,55,t);assert.ok(bad.z<-4);assert.ok(ev.some(e=>e.type==='wall'));
});
test('翻滚过早结束时阻挡入口，不能被两侧墙挤过去',async()=>{
 const {ROLL}=await import('./input-bits.js');const t=straight();t.features=[{type:'slot',x:0,z:0,y:0,tx:0,tz:1,width:1.35,rockRadius:4,height:7}];t.walls=[-1,1].map(side=>({type:'slot',a:{x:side*.675,z:-4},b:{x:side*.675,z:4}}));
 const c=createCarState({z:-50});c.vz=83;run(c,THROTTLE,25,t);const e=run(c,THROTTLE|ROLL,65,t);assert.ok(c.z<0);assert.ok(e.some(x=>x.type==='wall'));
});
test('反向接近窄缝出口时只在出口外阻挡，不瞬移到另一端',()=>{
 const t=straight();t.features=[{type:'slot',x:0,z:0,y:0,tx:0,tz:1,width:1.35,rockRadius:4,height:7}];const c=createCarState({z:6.2});c.vz=-12;
 const ev=run(c,0,1,t);assert.ok(c.z>4&&c.z<7);assert.ok(Math.abs(c.vz)<1);assert.ok(ev.some(e=>e.type==='wall'));
});
