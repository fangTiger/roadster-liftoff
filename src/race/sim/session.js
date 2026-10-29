import { createCarState,stepCar,coinPositions,effectiveHalfWidth,DT } from './physics.js';
import { createRace } from './race.js';
import { resolveContacts } from './contact.js';
import { updateDraft } from './draft.js';
import { createHazards } from './hazards.js';
import { atan2 } from './fmath.js';
import { THROTTLE,BRAKE,RESET } from './input-bits.js';
import { ROCK,SALT,GAP } from '../track/build.js';
import T from './tuning.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const lapStats=()=>({clean:true,driftBoost3:0,driftBoostCounts:{1:0,2:0,3:0},canyonJump:false,slotPass:false,saltTopKmh:0});
export function createSession(track,{laps=3,spawn,contacts,contactId}={}) {
 // 发车位在终点线后 12 米：发车时能看见起终点龙门架和发车灯，冲过线开始第一圈
 const startS=track.length-12,start=track.at(startS),race=createRace(track,{laps,dt:DT}),hazards=createHazards(track),coins=coinPositions(track);
 let car=createCarState(spawn||{...start,yaw:atan2(start.tx,start.tz),s:startS}),stepCount=0,previousBits=0,stuck=0,traversal={},stats=lapStats();
 car.near=track.nearest(car.x,car.z);
 const events=[],completedStats=[];
 let resetStep=-Infinity;
 const ghost=()=>race.state.finished||(race.state.steps-resetStep)*DT<=T.contactGraceReset;
 function reset(reason){const pose=race.requestReset(),old=car;resetStep=race.state.steps;car=createCarState(pose);car.near=track.nearest(car.x,car.z);car.picked=old.picked;car.cones=old.cones;car.rockHits=old.rockHits;car.lap=old.lap;car.fuel=old.fuel;car.previousBits=previousBits;stats.clean=false;traversal={};stuck=0;events.push({type:'reset',reason,step:stepCount});}
 function step(bits) {
  if(!Number.isInteger(bits)||bits<0||bits>255)throw new RangeError('输入必须是 0 到 255 的整数');
  // 完赛后车按物理自动刹停（不再接受操作，也不再计时）
  if(race.state.finished){stepCount++;const moving=car.vx*car.vx+car.vz*car.vz>.25;stepCar(car,moving?BRAKE:0,{track,hazards,step:race.state.steps,coins});return;}   // 停稳后松开刹车，否则会倒车
  const edge=bits&~previousBits;previousBits=bits;stepCount++;
  if(race.state.frozen){race.step(car,car,car);return;}
  if(edge&RESET){reset('manual');race.step(car,car,car);return;}
  const prev={x:car.x,z:car.z,grounded:car.grounded,rollTime:car.rollTime},lapBefore=race.state.lapTimes.length;
  car.lap=race.state.lap;const current=stepCar(car,bits,{track,hazards,step:race.state.steps,coins});
  for(const event of current){events.push({...event,step:stepCount});if(event.type==='wall')stats.clean=false;if(event.type==='driftBoost'){stats.driftBoostCounts[event.tier]++;if(event.tier===3)stats.driftBoost3++;}}
  advanceTraversal(traversal,prev,car,current,track,stats);
  if(car.surface===SALT)stats.saltTopKmh=Math.max(stats.saltTopKmh,Math.sqrt(car.vx*car.vx+car.vz*car.vz)*3.6);
  stuck=car.vx*car.vx+car.vz*car.vz<1&&(bits&THROTTLE)&&car.surface===ROCK?stuck+DT:0;
  if(current.some(e=>e.type==='fell')||stuck>=T.stuckDuration){reset(stuck>=T.stuckDuration?'stuck':'fell');race.step(car,car,car);return;}
  if(contacts&&car.grounded&&race.state.steps*DT>T.contactGraceStart&&!ghost()){
   const x=car.x,z=car.z,others=contacts(stepCount);
   for(const event of resolveContacts(car,others,{id:contactId,step:stepCount}))events.push({...event,step:stepCount});
   if(car.x!==x||car.z!==z){
    // 接触推出不计入下一步坡面速度，投影和地面高度随修正后的位置更新。
    const n=track.nearest(car.x,car.z,car.near);car.near=n;car.surface=track.surfaceAt(car.x,car.z);
    const ground=Math.abs(n.lateral)<=n.w/2+.8&&car.surface!==GAP?n.y+n.lateral*n.bank:track.heightAt(car.x,car.z);
    car.y=ground;car.groundY=ground;
   }
   for(const event of updateDraft(car,others,DT))events.push({...event,step:stepCount});
  }
  race.step(prev,car,car);
  if(race.state.lapTimes.length>lapBefore){completedStats.push(copy(stats));events.push({type:'lap',lap:lapBefore+1,time:race.state.lapTimes[lapBefore],step:stepCount});stats=lapStats();traversal={};}
 }
 // race / car：直接返回内部状态（只读约定，不复制），供影子预演等每步读取；snapshot 会深拷贝整局事件，逐步调用很慢
 return {step,get ghost(){return ghost();},get race(){return race.state;},get car(){return car;},get snapshot(){return {step:stepCount,car:copy(car),race:copy(race.state),events:copy(events),stats:copy(stats),completedStats:copy(completedStats),hazards:hazards.positions(race.state.steps)};}};
}

// 用有方向的入口/出口穿越记成就，排除触碰缺口后落回原岸或只在槽边翻滚。
export function advanceTraversal(state,prev,car,events,track,stats) {
 const gap=track.features.find(f=>f.type==='gap');
 if(gap){
  const a=track.at(gap.from),b=track.at(gap.to),length=(b.x-a.x)*a.tx+(b.z-a.z)*a.tz;
  const along=p=>(p.x-a.x)*a.tx+(p.z-a.z)*a.tz,side=-(car.x-a.x)*a.tz+(car.z-a.z)*a.tx;
  const before=along(prev),now=along(car);
  if(before<0&&now>=0&&!car.grounded&&Math.abs(side)<a.w/2)state.canyonArmed=true;
  if(state.canyonArmed&&now>=length)state.canyonCrossed=true;
  if(events.some(e=>e.type==='land')){if(state.canyonArmed&&state.canyonCrossed&&now>=length&&Math.abs(side)<b.w/2)stats.canyonJump=true;state.canyonArmed=false;state.canyonCrossed=false;}
  if(now<0)state.canyonArmed=false;
 }
 const slot=track.features.find(f=>f.type==='slot');
 if(slot){
  const along=p=>(p.x-slot.x)*slot.tx+(p.z-slot.z)*slot.tz,side=-(car.x-slot.x)*slot.tz+(car.z-slot.z)*slot.tx;
  const before=along(prev),now=along(car);
  if(before<-slot.rockRadius&&now>=-slot.rockRadius&&Math.abs(side)<slot.width/2)state.slotArmed=true;
  if(state.slotArmed&&Math.abs(side)>=slot.width/2)state.slotArmed=false;
  if(state.slotArmed&&before<slot.rockRadius&&now>=slot.rockRadius){stats.slotPass=true;state.slotArmed=false;}
 }
}
