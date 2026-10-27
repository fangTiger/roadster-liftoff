import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../track/build.js';
import def from '../track/data/alpine.js';
import { createSession } from './session.js';
import { autopilot } from './autopilot.js';
import { THROTTLE,RESET } from './input-bits.js';
const track=buildTrack(def);
test('终点后出生、倒数冻结、快照隔离、重置按下沿',()=>{
 const s=createSession(track);const p=s.snapshot.car;assert.ok(track.nearest(p.x,p.z).s>5);
 for(let i=0;i<360;i++)s.step(THROTTLE);assert.equal(s.snapshot.car.z,p.z);assert.equal(s.snapshot.race.elapsed,0);
 const copy=s.snapshot;copy.car.x=999;assert.notEqual(s.snapshot.car.x,999);
 s.step(RESET);const penalty=s.snapshot.race.penalty;s.step(RESET);assert.equal(s.snapshot.race.penalty,penalty);assert.equal(penalty,3);
});
test('机器人六分钟内完成三圈，每圈十一道检查点',()=>{
 const s=createSession(track);for(let i=0;i<120*360&&!s.snapshot.race.finished;i++)s.step(autopilot(s.snapshot,track));
 const snap=s.snapshot;console.log('机器人各圈用时（秒）',snap.race.lapTimes,'最终位置',snap.car.near.s,'罚时',snap.race.penalty);
 assert.equal(snap.race.finished,true);assert.equal(snap.race.missed,null);assert.deepEqual(snap.race.sectorTimes.map(x=>x.length),[11,11,11]);
});
test('盘山碰撞修正不会把车弹射到高空',()=>{
 const s=createSession(track);let highest=0;for(let i=0;i<4800;i++){s.step(autopilot(s.snapshot,track));highest=Math.max(highest,s.snapshot.car.y);}assert.ok(highest<50,`异常高度 ${highest}`);
});
test('同一圈重置不刷新已拾取金币和已撞锥桶',()=>{
 const t={...track,features:[{type:'coins',from:6,to:6,count:1,height:1,lateral:0},{type:'cones',items:[{x:0,z:6,kind:'cone',radius:.35}]}]};
 const s=createSession(t);for(let i=0;i<361;i++)s.step(0);assert.equal(s.snapshot.events.filter(e=>e.type==='coin').length,1);
 s.step(RESET);for(let i=0;i<120;i++)s.step(THROTTLE);
 assert.equal(s.snapshot.events.filter(e=>e.type==='coin').length,1);assert.equal(s.snapshot.events.filter(e=>e.type==='cone').length,1);
});
test('穿越统计排除原岸落地与从窄道外侧绕过',async()=>{
 const {advanceTraversal}=await import('./session.js');const t={features:[{type:'gap',from:0,to:10},{type:'slot',x:0,z:30,tx:0,tz:1,width:1.35,rockRadius:4}],at:s=>({x:0,z:s,w:10,tx:0,tz:1})};
 const stats={canyonJump:false,slotPass:false},state={},car=(z,extra={})=>({x:0,z,grounded:false,rollTime:1,roll:Math.PI/2,...extra});
 advanceTraversal(state,car(-1),car(1),[],t,stats);advanceTraversal(state,car(1),car(-1,{grounded:true}),[{type:'land'}],t,stats);assert.equal(stats.canyonJump,false);
 advanceTraversal(state,car(-1),car(1),[],t,stats);advanceTraversal(state,car(1),car(11,{grounded:true}),[{type:'land'}],t,stats);assert.equal(stats.canyonJump,true);
 advanceTraversal(state,car(24),car(27,{x:3}),[],t,stats);advanceTraversal(state,car(27,{x:3}),car(35,{x:3}),[],t,stats);assert.equal(stats.slotPass,false);
 advanceTraversal(state,car(24),car(27),[],t,stats);advanceTraversal(state,car(27),car(35),[],t,stats);assert.equal(stats.slotPass,true);
});
test('远端自定义出生与远端检查点重置使用正确投影提示',()=>{
 const p=track.at(2100),s=createSession(track,{spawn:{x:p.x,y:p.y,z:p.z,yaw:Math.atan2(p.tx,p.tz)}});
 for(let i=0;i<361;i++)s.step(0);assert.ok(Math.abs(s.snapshot.car.near.s-2100)<1);assert.ok(Math.abs(s.snapshot.car.y-p.y)<1);
 const normal=createSession(track);for(let i=0;i<3000;i++)normal.step(autopilot(normal.snapshot,track));normal.step(RESET);normal.step(0);
 const c=normal.snapshot.car,n=track.nearest(c.x,c.z);assert.ok(Math.abs(n.s-c.near.s)<1);assert.ok(Math.abs(c.y-n.y)<1);
});

test('分支接口与重叠路幅的高度断层不会把车弹起（只有断桥和台地跳台允许重落地）',()=>{
 const track=buildTrack(def),session=createSession(track,{laps:1}),sec=s=>track.sections.findIndex(q=>s>=q.from&&s<q.to)+1;
 let snap=session.snapshot,seen=0,steps=0;const hard=[];
 while(!snap.race.finished&&steps<120*200){session.step(autopilot(snap,track));snap=session.snapshot;steps++;
  for(;seen<snap.events.length;seen++){const e=snap.events[seen];if(e.type!=='land'||e.impact<=6)continue;const n=track.nearest(snap.car.x,snap.car.z,snap.car.near),k=n.path==='main'?sec(n.s):n.path;if(k!==4&&k!==7)hard.push([k,e.impact]);}
 }
 assert.ok(snap.race.finished);assert.deepEqual(hard,[]);
});
