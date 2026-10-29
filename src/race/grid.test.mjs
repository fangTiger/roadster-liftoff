import test from 'node:test';
import assert from 'node:assert/strict';
import { gridSpawn, targetSteps } from './grid.js';
import { buildTrack } from './track/build.js';
import { TRACKS } from './track/data/index.js';
import { createSession } from './sim/session.js';
import { DT } from './sim/physics.js';
for(const {def} of TRACKS)test(`赛道 ${def.id} 六个座位相隔至少五米且位于路面`,()=>{
 const track=buildTrack(def),positions=Array.from({length:6},(_,i)=>gridSpawn(track,i));
 for(let i=0;i<6;i++){
  const p=positions[i],near=track.nearest(p.x,p.z);assert.ok(near.distance<near.w/2-1);assert.ok(Math.abs(p.y-near.y)<.2);
  for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-positions[j].x,p.z-positions[j].z)>4.9);
  const s=createSession(track,{spawn:p});assert.equal(s.car.x,p.x);assert.equal(s.car.z,p.z);
 }
 const solo=createSession(track),start=track.at(track.length-12);assert.equal(solo.car.x,start.x);assert.equal(solo.car.z,start.z);
});
test('服务器发车之前冻结，时间单位转换正确，每帧最多追 240 步',()=>{
 assert.equal(targetSteps(999,1000,0),0);assert.equal(targetSteps(2000,1000,0),120);assert.equal(targetSteps(10000,1000,0),240);assert.equal(targetSteps(2000,1000,121),121);assert.ok(DT===1/120);
});
