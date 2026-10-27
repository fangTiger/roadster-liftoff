import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace } from './race.js';
import { buildTrack } from '../track/build.js';
import def from '../track/data/alpine.js';
const track=buildTrack(def),dt=1/120;
function start(race) {for(let i=0;i<360;i++)race.step({x:0,z:0},{x:0,z:0},{vx:0,vz:0});}
function drive(race, laps=1, skip=-1) {
  const step=.5;
  for(let lap=0;lap<laps;lap++) for(let s=0;s<track.length;s+=step) {
    const a=track.at(s),b=track.at(Math.min(s+step,track.length));
    const gate=track.checkpointGates[skip];
    if(gate&&s<gate.s+3&&s+step>gate.s-3) continue;
    race.step(a,b,{vx:b.tx*60,vz:b.tz*60});
  }
}
test('倒数三秒冻结，不计时、不接受检查点',()=>{
  const race=createRace(track);
  for(let i=0;i<359;i++){race.step(track.at(0),track.at(600),{vx:0,vz:60});assert.equal(race.state.frozen,true);}
  assert.equal(race.state.elapsed,0); assert.equal(race.state.nextCheckpoint,0);
  race.step(track.at(0),track.at(0),{vx:0,vz:0}); assert.equal(race.state.frozen,false);
});
test('匀速假车完成三圈，圈速与分段总和合理',()=>{
  const race=createRace(track);start(race);drive(race,3);
  assert.equal(race.state.finished,true);assert.equal(race.state.lapTimes.length,3);
  for(let i=0;i<3;i++) {
    assert.ok(Math.abs(race.state.lapTimes[i]-track.length/60)<.02);
    assert.equal(race.state.sectorTimes[i].length,11);
    assert.ok(Math.abs(race.state.sectorTimes[i].reduce((a,b)=>a+b,0)-race.state.lapTimes[i])<1e-9);
  }
  assert.equal(race.state.bestLap,Math.min(...race.state.lapTimes));
  const time=race.state.elapsed;drive(race);assert.equal(race.state.elapsed,time);
});
test('漏检越过终点不记圈，反向越线也不记圈',()=>{
  const race=createRace(track);start(race);drive(race,1,3);
  assert.equal(race.state.lapTimes.length,0);assert.equal(race.state.missed,4);
  const gate=track.checkpointGates[0];
  race.step(track.at(gate.s+1),track.at(gate.s-1),{vx:0,vz:-60});assert.equal(race.state.nextCheckpoint,3);
});
test('反向持续两秒，恢复正向立即清除提示',()=>{
  const race=createRace(track);start(race);const p=track.at(50);
  for(let i=0;i<239;i++)race.step(p,p,{vx:-p.tx*10,vz:-p.tz*10});
  assert.equal(race.state.wrongWay,false);race.step(p,p,{vx:-p.tx*10,vz:-p.tz*10});assert.equal(race.state.wrongWay,true);
  race.step(p,p,{vx:p.tx*10,vz:p.tz*10});assert.equal(race.state.wrongWay,false);
});
test('重置返回上一道检查点，当前圈罚时恰为三秒',()=>{
  const race=createRace(track);start(race);const gate=track.checkpointGates[0];
  race.step(track.at(gate.s-1),track.at(gate.s+1),{vx:0,vz:60});
  const before=race.state.lapTime,p=race.requestReset();
  assert.ok(Math.hypot(p.x-gate.x,p.z-gate.z)<.001);assert.ok(Number.isFinite(p.yaw));
  assert.equal(race.state.lapTime-before,3);
});
test('实际行经河床慢道与翻滚捷径，仍按顺序计圈',()=>{
  const race=createRace(track,{laps:1});start(race);
  let s=0;
  for(const branch of track.branches) {
    while(s<branch.from) {const next=Math.min(s+.5,branch.from);race.step(track.at(s),track.at(next),{vx:0,vz:60});s=next;}
    for(let b=0;b<branch.length;b+=.5) {const a=branch.at(b),p=branch.at(Math.min(b+.5,branch.length));race.step(a,p,{vx:p.tx*60,vz:p.tz*60});}
    s=branch.to;
  }
  while(s<track.length) {const next=Math.min(s+.5,track.length);race.step(track.at(s),track.at(next),{vx:0,vz:60});s=next;}
  assert.equal(race.state.finished,true);assert.equal(race.state.missed,null);
});
test('重置罚时计入最终圈速与所属分段；模拟重复结果逐位相同',()=>{
  function run(reset) {
    const race=createRace(track,{laps:1});start(race);if(reset)race.requestReset();drive(race);return race.state;
  }
  const clean=run(false),penalized=run(true);
  assert.ok(Math.abs(penalized.lapTimes[0]-clean.lapTimes[0]-3)<1e-9);
  assert.ok(Math.abs(penalized.sectorTimes[0][0]-clean.sectorTimes[0][0]-3)<1e-9);
  assert.deepEqual(penalized,run(true));
});
test('终点之后六米出生，正常发车不会误报漏检',()=>{
 const race=createRace(track);start(race);let prev=track.at(6);
 for(let s=6.5;s<40;s+=.5){const p=track.at(s);race.step(prev,p,{vx:p.tx*30,vz:p.tz*30});prev=p;}
 assert.equal(race.state.missed,null);assert.equal(race.state.nextCheckpoint,0);assert.equal(race.state.lapTimes.length,0);
});
