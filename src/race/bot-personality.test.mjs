import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as bots from './bot-driver.js';
import { autopilot } from './sim/autopilot.js';
import { createSession } from './sim/session.js';
import { buildTrack } from './track/build.js';
import { TRACKS } from './track/data/index.js';
import { LEFT,RIGHT } from './sim/input-bits.js';
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const tracks=TRACKS.map(({def})=>buildTrack(def));
const baseline=['8225c3ac348b6778eb531ad8fe10a75d775bf5df7c2e17c42693967f025cf4ab','09953cc1b556983c7250679aded180741f3b780c093b9219c171a41b57cb886a','77ea33079c17dc1aed42dc326ed2601444707301aef488f205eeb4337b74ba52'];

test('三图默认及显式中性选项的输入和完整物理状态与改动前逐位一致',()=>{
 for(const [index,track] of tracks.entries())for(const options of [undefined,{laneOffset:0,brakeBias:0,braking:20}]){
  const s=createSession(track),hash=createHash('sha256');
  for(let step=0;step<6000;step++){const bits=autopilot({car:s.car},track,options);s.step(bits);hash.update(JSON.stringify([bits,s.car,s.race]));}
  assert.equal(hash.digest('hex'),baseline[index]);
 }
});
test('横向目标可用数值或函数设置且在窄路、急弯均限幅',()=>{
 const track=tracks[0],p=track.at(100),car={...createSession(track).car,...p,yaw:Math.atan2(p.tx,p.tz),vx:0,vz:0,near:null};
 const snap={car},base=autopilot(snap,track);
 assert.notEqual(autopilot(snap,track,{laneOffset:2}),base);
 assert.equal(autopilot(snap,track,{laneOffset:2}),autopilot(snap,track,{laneOffset:()=>2}));
 assert.equal(autopilot(snap,track,{laneOffset:1e6}),autopilot(snap,track,{laneOffset:track.at(106).w*.3}));
});
test('同种子个性及输入可复现，不同种子走线不同，速度与反应限幅',()=>{
 assert.equal(typeof bots.createBotPersonality,'function');
 for(const difficulty of ['easy','normal','hard']){
  const a=bots.createBotPersonality(difficulty,seeded(123)),b=bots.createBotPersonality(difficulty,seeded(123)),c=bots.createBotPersonality(difficulty,seeded(124));
  assert.equal(JSON.stringify(a),JSON.stringify(b));assert.notEqual(JSON.stringify(a),JSON.stringify(c));
  const center=bots.createBotPersonality(difficulty,()=>.5);
  assert.ok(Math.abs(a.reaction-center.reaction)<=1);assert.ok(Math.abs(a.cruise/center.cruise-1)<=.03);assert.ok(Math.abs(a.cornerGrip/center.cornerGrip-1)<=.03);
  for(const track of tracks)for(let s=0;s<track.length;s+=7){assert.equal(a.laneOffset(s,track),b.laneOffset(s,track));assert.ok(Math.abs(a.laneOffset(s,track))<=track.at(s).w*.3);assert.ok(Math.abs(a.laneOffset(s+.01,track)-a.laneOffset(s,track))<.02);}
  const da=bots.createBotDriver(difficulty,{random:seeded(42)}),db=bots.createBotDriver(difficulty,{random:seeded(42)}),s=createSession(tracks[0]);
  for(let step=0;step<1200;step++){const snap={car:s.car,race:s.race};const bits=da(snap,tracks[0]);assert.equal(bits,db(snap,tracks[0]));s.step(bits);}
 }
});
test('仅转向延迟，油门刹车即时，队列互相独立',()=>{
 const track=tracks[0],car=createSession(track).car,mask=LEFT|RIGHT;
 for(const difficulty of ['easy','normal','hard']){
  const a=bots.createBotDriver(difficulty,{random:()=>.5}),p=a.personality,expected=[];
  for(let i=0;i<60;i++){const snap={car:{...car,yaw:car.yaw+(i%2?.2:-.2),vx:i%3?0:100},race:{lap:1,frozen:true}},bits=autopilot(snap,track,p);expected.push(bits&mask);const actual=a(snap,track);assert.equal(actual&~mask,bits&~mask);if(i<p.reaction)assert.equal(actual&mask,0);if(i===p.reaction)assert.equal(actual&mask,expected[0]);}
 }
});
test('超车避开被占侧，排除身后、远车和无效车辆，并平滑收回',()=>{
 const track=tracks[0],p=track.at(120),q=track.at(135),snapshot={car:{...createSession(track).car,...p,yaw:Math.atan2(p.tx,p.tz),near:{path:'main',s:120,index:120}},race:{lap:1}},front={id:'front',...q},blocked={id:'side',x:q.x-q.tz*3,z:q.z+q.tx*3};
 let cars=[front,blocked];const a=bots.createBotDriver('hard',{random:()=>.5,cars:()=>cars,id:'self'}),b=bots.createBotDriver('hard',{random:()=>.5});
 for(let i=0;i<240;i++){a(snapshot,track);b(snapshot,track);}
 assert.ok(a.laneOffset(120,track)<b.laneOffset(120,track)-1);
 const before=a.laneOffset(120,track);cars=[];a(snapshot,track);assert.ok(Math.abs(a.laneOffset(120,track)-before)<.02);
 for(const car of [{...front,ghost:true},{...front,finished:true},{...front,connected:false},{...front,air:true},{...front,stale:true},{...front,x:p.x-p.tx*10,z:p.z-p.tz*10},{...front,x:p.x+p.tx*26,z:p.z+p.tz*26}]){const d=bots.createBotDriver('hard',{random:()=>.5,cars:()=>[car]});for(let i=0;i<240;i++)d(snapshot,track);assert.equal(d.laneOffset(120,track),b.laneOffset(120,track));}
});
test('简单很少出现有限小失误、普通和困难无故意失误',()=>{
 for(const difficulty of ['easy','normal','hard']){const d=bots.createBotDriver(difficulty,{random:seeded(17)}),track=tracks[0];let count=0;for(let lap=1;lap<=100;lap++){const mistake=d.personality.mistake(lap,track);if(mistake){count++;assert.ok(mistake.s>=0&&mistake.s<track.length);assert.ok(mistake.brakeBias>=-3&&mistake.brakeBias<0);}}
  if(difficulty==='easy')assert.ok(count>0&&count<25);else assert.equal(count,0);
 }
});

test('带反应延迟的高速转向不会在连续弯累积偏差擦墙',async()=>{
 const {runSolo}=await import('../../scripts/race/benchmark-bots.mjs');
 for(const [map,seed] of [[0,29],[1,73]]){const result=runSolo(tracks[map],'hard',{seed});assert.ok(result.finished);assert.equal(result.walls,0,`地图 ${map+1} 种子 ${seed}`);assert.ok(result.maxRoadFraction<1);}
});

test('制动预测和刹车偏置确实改变入弯时机，较晚制动保持更久油门',()=>{
 const track=tracks[0],base=createSession(track).car;let biasChanges=0,lateChanges=0;
 for(let s=0;s<track.length;s+=5)for(const speed of [30,45,60,75]){const p=track.at(s),snap={car:{...base,...p,near:null,yaw:Math.atan2(p.tx,p.tz),vx:p.tx*speed,vz:p.tz*speed}};
  const early=autopilot(snap,track,{brakeBias:3})&2,late=autopilot(snap,track,{brakeBias:-3})&2;
  // 出弯时向前扫描会更早恢复油门；这里只统计确实提前刹车的入弯样本。
  if(early&&!late)biasChanges++;
  if((autopilot(snap,track)&2)!==(autopilot(snap,track,{braking:26})&2))lateChanges++;
 }
 assert.ok(biasChanges>0);assert.ok(lateChanges>0);
});

test('六车混合同场超车不在弯中持续顶墙卡死',async()=>{
 const {runPack}=await import('../../scripts/race/benchmark-bots.mjs');
 for(const track of tracks.slice(1))for(const reverse of [false]){const result=runPack(track,{seed:2026,reverse});for(const car of result.cars){assert.ok(car.finished);assert.equal(car.resets,0);assert.ok(car.maxStall<2,`地图 ${track.id} 反转 ${reverse} ${car.id} 低速 ${car.maxStall}`);}}
});


test('简单档接近水泥墩时让行近距离前车，避免并排碰撞顶墩',()=>{
 const track=tracks[2],cones=track.features.find(f=>f.type==='cones'),s=cones.items[0].s-100,p=track.at(s),q=track.at(s+5);
 const snapshot={car:{...createSession(track).car,...p,yaw:Math.atan2(p.tx,p.tz),near:null},race:{lap:1,frozen:true}};
 const driver=bots.createBotDriver('easy',{random:()=>.5,id:'self',cars:()=>[{id:'front',...q}]});
 const bits=driver(snapshot,track);assert.ok(bits&2);assert.equal(bits&1,0);
 const solo=bots.createBotDriver('easy',{random:()=>.5});assert.ok(solo(snapshot,track)&1);
});
