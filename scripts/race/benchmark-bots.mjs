import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { buildTrack } from '../../src/race/track/build.js';
import { TRACKS } from '../../src/race/track/data/index.js';
import { createRoomBots,carState } from '../../src/race/room-bots.js';
import { createSession } from '../../src/race/sim/session.js';
import { autopilot } from '../../src/race/sim/autopilot.js';
import { createRacingLine,racingInput } from '../../src/race/bot-racing-line.js';
import { botPerformance } from '../../src/race/bot-driver.js';
import { createRoomItems } from '../../src/race/room-items.js';
import { DT } from '../../src/race/sim/physics.js';

export const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function metrics(session,extra={}){
 const snap=session.snapshot,count=type=>snap.events.filter(e=>e.type===type).length;
 return {finished:session.race.finished,lapTimes:[...session.race.lapTimes],penalty:session.race.penalty,walls:count('wall'),resets:count('reset'),falls:count('fell'),...extra};
}
export function runSolo(track,difficulty,{seed=1,laps=2,items=false}={}){
 const players=[{id:'bot',seat:0,bot:true,ownerId:'host',difficulty,connected:true}],bot=createRoomBots({players,ownerId:'host',track,laps,random:seeded(seed),contacts:()=>[]}).get('bot');
 let stall=0,maxStall=0,branchProjectionSteps=0,branchInteriorSteps=0,maxLateral=0,maxRoadFraction=0,nitroUses=0;
 const itemSystem=items?createRoomItems({track,random:seeded(seed+100),send:m=>itemSystem.receive({...m,from:'bot'}),onEvent:e=>{if(e.type==='itemUsed'&&e.kind==='nitro')nitroUses++;}}):null;
 for(let step=0;step<120*(180*laps+30)&&!bot.session.race.finished;step++){
  const s=bot.session;
  if(itemSystem)itemSystem.step({id:'bot',bot:true,difficulty,car:s.car,race:s.race,time:s.race.elapsed,rankFraction:0,rank:1,count:1,cars:[],applyEffect:kind=>s.applyEffect(kind)});
  s.step(bot.driver({car:s.car,race:s.race},track));bot.step++;
  if(s.race.frozen)continue;
  stall=Math.hypot(s.car.vx,s.car.vz)<1?stall+DT:0;maxStall=Math.max(maxStall,stall);maxLateral=Math.max(maxLateral,Math.abs(s.car.near.lateral));maxRoadFraction=Math.max(maxRoadFraction,Math.abs(s.car.near.lateral)/Math.max(1,s.car.near.w/2));
  if(s.car.near.path!=='main'){branchProjectionSteps++;const b=track.branches.find(b=>b.id===s.car.near.path);if(s.car.near.s>20&&s.car.near.s<b.length-20)branchInteriorSteps++;}
 }
 return metrics(bot.session,{maxStall,maxLateral,maxRoadFraction,branchProjectionSteps,branchInteriorSteps,nitroUses});
}
export function runPack(track,{seed=2026,reverse=false,items=false}={}){
 const difficulties=['easy','normal','hard','easy','normal','hard'],players=difficulties.map((difficulty,i)=>({id:`bot${i}`,seat:reverse?5-i:i,bot:true,ownerId:'host',difficulty,connected:true}));
 let bots;
 const traffic=id=>[...bots].filter(([other])=>other!==id).map(([id,b])=>({id,...carState(b.session.car,b.session.race,b.session.ghost),air:!b.session.car.grounded}));
 bots=createRoomBots({players,ownerId:'host',track,laps:3,random:seeded(seed),contacts:id=>traffic(id).filter(c=>!c.ghost&&!c.air),traffic});
 const itemStats={pickups:0,uses:{missile:0,mine:0,nitro:0,shield:0},accepted:{missile:0,mine:0},hits:0,mineHits:0,byCar:Object.fromEntries(players.map(p=>[p.id,{pickups:0,uses:{missile:0,mine:0,nitro:0,shield:0}}]))};
 const itemMessages=new Map(),lastItem=new Map();let itemTime=0,itemSystem;
 if(items)itemSystem=createRoomItems({track,random:seeded(seed+100),send:message=>{
  const from=message.botId;if(!bots.has(from)||bots.get(from).session.race.finished)return;
  // 全车由同一房主模拟：消息先过相同的去重和 500 毫秒限流，再同步回显实体。
  if(message.type==='item'){
   if(itemMessages.has(message.itemId)||itemTime-(lastItem.get(from)??-Infinity)<.5)return;
   if(message.kind==='missile'&&message.target!==null&&(!bots.has(message.target)||bots.get(message.target).session.race.finished))return;
   lastItem.set(from,itemTime);itemMessages.set(message.itemId,{...message,from,gone:false});itemStats.accepted[message.kind]++;itemSystem.receive({...message,from});
  }else{
   const stored=itemMessages.get(message.itemId);if(!stored||stored.gone)return;
   if(message.type==='hit'&&stored.kind==='missile'&&stored.target===from){stored.gone=true;itemStats.hits++;itemSystem.hit({itemId:message.itemId,by:from,shielded:message.shielded});}
   if(message.type==='mineHit'&&stored.kind==='mine'){stored.gone=true;itemStats.mineHits++;itemSystem.gone({itemId:message.itemId,by:from});}
  }
 },onEvent:event=>{
  if(event.type==='pickup'){itemStats.pickups++;itemStats.byCar[event.id].pickups++;}
  if(event.type==='itemUsed'){itemStats.uses[event.kind]++;itemStats.byCar[event.id].uses[event.kind]++;}
 }});
 const samples=new Map(players.map(p=>[p.id,new Map()])),stalls=new Map(players.map(p=>[p.id,{now:0,max:0,controlNow:0,controlMax:0,branchInteriorSteps:0}]));
 for(let step=0;step<120*600&&[...bots.values()].some(b=>!b.session.race.finished);step++){
  itemTime=step*DT;
  for(const [id,bot] of bots){
  const s=bot.session;if(s.race.finished)continue;
  if(itemSystem){
   const cars=[...bots].map(([carId,b])=>({id:carId,connected:true,...carState(b.session.car,b.session.race,b.session.ghost)}));
   const ranked=[...cars].sort((a,b)=>(b.lap*track.length+b.s)-(a.lap*track.length+a.s)),rank=ranked.findIndex(car=>car.id===id)+1;
   itemSystem.step({id,bot:true,difficulty:players.find(p=>p.id===id).difficulty,car:s.car,race:s.race,ghost:s.ghost,time:itemTime,cars,rank,count:players.length,rankFraction:(rank-1)/(players.length-1),applyEffect:kind=>s.applyEffect(kind)});
  }
  s.step(bot.driver({car:s.car,race:s.race},track));bot.step++;
  const stall=stalls.get(id);stall.now=!s.race.frozen&&Math.hypot(s.car.vx,s.car.vz)<1?stall.now+DT:0;
  if(stall.now>stall.max){stall.max=stall.now;stall.at={time:itemTime,lap:s.race.lap,s:s.car.near.s,path:s.car.near.path,trapTime:s.car.trapTime??0,spinTime:s.car.spinTime??0,steer:s.car.steer,x:s.car.x,z:s.car.z};}
  if(items){
   // 强制禁锢和打转保留在原始低速指标中；只在可以控制车辆时判断驾驶是否卡死。
   const controlled=!(s.car.trapTime>0)&&!(s.car.spinTime>0);
   stall.controlNow=controlled&&stall.now>0?stall.controlNow+DT:0;
   if(stall.controlNow>stall.controlMax){stall.controlMax=stall.controlNow;stall.controlAt={time:itemTime,lap:s.race.lap,s:s.car.near.s,path:s.car.near.path,trapTime:s.car.trapTime??0,spinTime:s.car.spinTime??0,steer:s.car.steer,x:s.car.x,z:s.car.z};}
  }
  if(s.car.near.path!=='main'){const branch=track.branches.find(b=>b.id===s.car.near.path);if(s.car.near.s>20&&s.car.near.s<branch.length-20)stall.branchInteriorSteps++;}
  // 在同一距离桶比较实际走线，避免把不同弯道的横向偏移误算为个性差异。
  if(!s.race.frozen&&s.race.lap>=2&&step%12===0){const bin=Math.floor(s.car.near.s/10),bins=samples.get(id),value=bins.get(bin)??{sum:0,count:0};value.sum+=s.car.near.lateral;value.count++;bins.set(bin,value);}
  }
  if(itemSystem)itemSystem.tick(itemTime,[...bots].map(([id,b])=>({id,connected:true,...carState(b.session.car,b.session.race,b.session.ghost)})));
 }
 const cars=players.map(p=>({...p,...metrics(bots.get(p.id).session,{maxStall:stalls.get(p.id).max,maxStallAt:stalls.get(p.id).at,branchInteriorSteps:stalls.get(p.id).branchInteriorSteps,...(items?{maxControlStall:stalls.get(p.id).controlMax,maxControlStallAt:stalls.get(p.id).controlAt}: {})}),elapsed:bots.get(p.id).session.race.elapsed})),order=[...cars].sort((a,b)=>a.elapsed-b.elapsed).map(c=>c.id);
 let total=0,count=0;const pairDifferences=[];
 for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
  let sum=0,n=0;for(const [bin,a] of samples.get(players[i].id)){const b=samples.get(players[j].id).get(bin);if(b){sum+=Math.abs(a.sum/a.count-b.sum/b.count);n++;}}
  pairDifferences.push({pair:[players[i].id,players[j].id],mean:n?sum/n:0});total+=sum;count+=n;
 }
 return {seed,reverse,order,seats:order.map(id=>cars.find(c=>c.id===id).seat),meanLateralDifference:count?total/count:0,pairDifferences,cars,...(items?{items:itemStats}:{})};
}
function verify(result){assert.ok(result.finished,'机器人必须完赛');assert.equal(result.resets,0);assert.equal(result.falls,0);assert.equal(result.penalty,0);assert.equal(result.branchInteriorSteps,0);assert.ok((result.maxControlStall??result.maxStall)<2,'机器人不能卡死');}
async function main(){
 const tracks=TRACKS.map(({def})=>({name:def.name.zh,track:buildTrack(def)}));
 if(process.argv.includes('--items-pack')){
  const packs=tracks.map(({name,track})=>({地图:name,...runPack(track,{seed:2027,items:true})}));
  console.log(JSON.stringify({口径:'三图六车混合难度，seed 2027，真实道具箱随机抽取、共享道具实体、三圈，逐车决策和效果进入物理步。',packs},null,2));
  for(const pack of packs)for(const car of pack.cars)verify(car);
  return;
 }
 if(process.argv.includes('--probe')){
  // 上限探测完全使用原车；氮气比较只使用真实箱子与真实道具效果，固定有利抽取。
  for(const {name,track} of tracks){const line=createRacingLine(track);for(const cornerGrip of [1.7,2.1,2.3])for(const mode of ['grip','drift','nitro']){
   const session=createSession(track,{laps:2});let nitroUses=0;
   const items=mode==='nitro'?createRoomItems({track,random:()=>.5,send:()=>{},onEvent:e=>{if(e.type==='itemUsed'&&e.kind==='nitro')nitroUses++;}}):null;
   for(let step=0;step<120*400&&!session.race.finished;step++){
    if(items)items.step({id:'probe',bot:true,difficulty:'hard',car:session.car,race:session.race,time:session.race.elapsed,rankFraction:0,rank:1,count:1,cars:[],applyEffect:kind=>session.applyEffect(kind)});
    session.step(racingInput({car:session.car},track,{line,cruise:1.8,cornerGrip,braking:27,lookahead:.3,drift:mode==='drift'}));
   }
   console.log(JSON.stringify({地图:name,弯速倍率:cornerGrip,模式:mode,性能:{engine:1,topSpeed:1,grip:1},nitroUses,...metrics(session)}));
  }}return;
 }
 const timing=[],endurance=[],packs=[],itemRuns=[];
 for(const {name,track} of tracks)for(const difficulty of ['easy','normal','hard']){
  const runs=[11,29,47].map(seed=>runSolo(track,difficulty,{seed}));for(const r of runs)verify(r);
  const laps=runs.map(r=>r.lapTimes[1]);timing.push({地图:name,难度:difficulty,性能:botPerformance(difficulty,track),三次单圈:laps,平均:laps.reduce((a,b)=>a+b,0)/3,最快:Math.min(...laps),runs});
 }
 for(const {name,track} of tracks){const result=runSolo(track,'hard',{seed:73,laps:10});verify(result);endurance.push({地图:name,...result});}
 for(const {name,track} of tracks)for(const reverse of [false,true]){const result=runPack(track,{seed:2026,reverse});for(const car of result.cars)verify(car);assert.ok(result.meanLateralDifference>.15);assert.notDeepEqual(result.seats,[0,1,2,3,4,5]);packs.push({地图:name,...result});}
 for(const {name,track} of tracks)for(const difficulty of ['normal','hard']){const result=runSolo(track,difficulty,{seed:91,laps:3,items:true});verify(result);itemRuns.push({地图:name,难度:difficulty,...result});}
 console.log(JSON.stringify({测速口径:'每种子独立两圈取第二圈；三次平均与最快。困难每图十圈；六车三图正反出生位，软碰撞和尾流；道具单独验证。',timing,endurance,packs,itemRuns},null,2));
 // 按旧普通三图比值检查进阶速度，容许机关、起伏和动态落石造成 3 个百分点差异。
 const baseLaps=[44.236,46.761,83.103],ranges={easy:[40.5,42],normal:[37,38],hard:[34,35]};
 for(const difficulty of ['easy','normal','hard']){const rows=timing.filter(t=>t.难度===difficulty),[min,max]=ranges[difficulty];assert.ok(rows[0].平均>=min&&rows[0].平均<=max,`草甸 ${difficulty} 圈速必须达到目标：${rows[0].平均}`);for(let i=1;i<rows.length;i++)assert.ok(Math.abs(rows[i].平均/baseLaps[i]-rows[0].平均/baseLaps[0])<.03,`三图 ${difficulty} 应同比例提速`);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
