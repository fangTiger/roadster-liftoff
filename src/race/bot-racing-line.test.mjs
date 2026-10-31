import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track/build.js';
import meadow from './track/data/meadow.js';
import alpine from './track/data/alpine.js';
import T from './sim/tuning.js';
import * as racing from './bot-racing-line.js';

const track=buildTrack(meadow);
test('赛车线是缓存的闭合路径，横向安全且可连续采样',()=>{
 const line=racing.createRacingLine(track);assert.equal(line,racing.createRacingLine(track));
 for(let s=0;s<track.length;s+=3){const p=line.at(s),n=track.at(s);const lateral=(p.x-n.x)*-n.tz+(p.z-n.z)*n.tx;
  assert.ok(Math.abs(lateral)<=n.w*.3+1e-6);assert.ok(Number.isFinite(p.curve));assert.ok(Math.abs(Math.hypot(p.tx,p.tz)-1)<1e-6);assert.ok(Math.hypot(p.x-line.at(s+.01).x,p.z-line.at(s+.01).z)<.1);
 }
 assert.deepEqual(line.at(0),line.at(track.length));
});
test('完整赛车线从弯外进入、掠过弯心、向弯外展开',()=>{
 const line=racing.createRacingLine(track),side=s=>{const p=line.at(s),n=track.at(s);return (p.x-n.x)*-n.tz+(p.z-n.z)*n.tx;};
 // 首个左弯：路面坐标的正横向为弯外，弯中负横向为内侧。
 assert.ok(side(390)>1,`入弯 ${side(390)}`);assert.ok(side(475)<-1,`弯心 ${side(475)}`);assert.ok(side(555)>1,`出弯 ${side(555)}`);
});

test('赛车线驾驶在直道加速、提前制动，出弯重新给油',()=>{
 const line=racing.createRacingLine(track),at=(s,speed)=>{const p=line.at(s);return {car:{...p,yaw:Math.atan2(p.tx,p.tz),vx:p.tx*speed,vz:p.tz*speed,steer:0,near:{path:'main',s,index:Math.floor(s)},grounded:true}};};
 assert.ok(racing.racingInput(at(150,40),track,{line})&1);
 assert.ok(racing.racingInput(at(400,80),track,{line})&2);
 assert.ok(racing.racingInput(at(550,35),track,{line})&1);
});

test('草甸赛车线不出现局部折点导致虚假急刹车',()=>{
 const line=racing.createRacingLine(track);assert.ok(Math.max(...line.nodes.map(p=>p.curve))<.035);
});

test('阿尔卑斯赛车线为水泥墩保留车身宽度及安全余量',()=>{
 const track=buildTrack(alpine),line=racing.createRacingLine(track);
 for(const obstacle of track.features.filter(f=>f.type==='cones').flatMap(f=>f.items).filter(p=>p.kind==='concrete')){
  for(let s=obstacle.s-4;s<=obstacle.s+4;s+=.5){
   const p=line.at(s),distance=Math.hypot(p.x-obstacle.x,p.z-obstacle.z);
   assert.ok(distance>=obstacle.radius+T.width/2+.25,`水泥墩 ${obstacle.s.toFixed(1)}，赛车线 ${s.toFixed(1)} 中心距离 ${distance.toFixed(2)}`);
  }
 }
});

test('断桥归中约束也限制额外超车偏移',async()=>{
 const alpine=(await import('./track/data/alpine.js')).default,road=buildTrack(alpine),gap=road.features.find(f=>f.type==='gap'),s=gap.from-40,p=road.at(s),snapshot={car:{...p,yaw:Math.atan2(p.tx,p.tz),vx:0,vz:0,steer:0,near:{path:'main',s,index:Math.floor(s)},grounded:true}};
 assert.equal(racing.racingInput(snapshot,road,{laneOffset:100}),racing.racingInput(snapshot,road,{laneOffset:0}));
});
