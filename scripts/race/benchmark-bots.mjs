import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { buildTrack } from '../../src/race/track/build.js';
import { TRACKS } from '../../src/race/track/data/index.js';
import { createRoomBots,carState } from '../../src/race/room-bots.js';
import { createSession } from '../../src/race/sim/session.js';
import { autopilot } from '../../src/race/sim/autopilot.js';
import { DT } from '../../src/race/sim/physics.js';

export const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function metrics(session,extra={}){
 const snap=session.snapshot,count=type=>snap.events.filter(e=>e.type===type).length;
 return {finished:session.race.finished,lapTimes:[...session.race.lapTimes],penalty:session.race.penalty,walls:count('wall'),resets:count('reset'),falls:count('fell'),...extra};
}
export function runSolo(track,difficulty,{seed=1,laps=2}={}){
 const players=[{id:'bot',seat:0,bot:true,ownerId:'host',difficulty,connected:true}],bot=createRoomBots({players,ownerId:'host',track,laps,random:seeded(seed),contacts:()=>[]}).get('bot');
 let stall=0,maxStall=0,branchProjectionSteps=0,branchInteriorSteps=0,maxLateral=0;
 for(let step=0;step<120*(180*laps+30)&&!bot.session.race.finished;step++){
  const s=bot.session;s.step(bot.driver({car:s.car,race:s.race},track));bot.step++;
  if(s.race.frozen)continue;
  stall=Math.hypot(s.car.vx,s.car.vz)<1?stall+DT:0;maxStall=Math.max(maxStall,stall);maxLateral=Math.max(maxLateral,Math.abs(s.car.near.lateral));
  if(s.car.near.path!=='main'){branchProjectionSteps++;const b=track.branches.find(b=>b.id===s.car.near.path);if(s.car.near.s>20&&s.car.near.s<b.length-20)branchInteriorSteps++;}
 }
 return metrics(bot.session,{maxStall,maxLateral,branchProjectionSteps,branchInteriorSteps});
}
export function runPack(track,{seed=2026,reverse=false}={}){
 const difficulties=['easy','normal','hard','easy','normal'],players=difficulties.map((difficulty,i)=>({id:`bot${i}`,seat:reverse?4-i:i,bot:true,ownerId:'host',difficulty,connected:true}));
 let bots;
 const traffic=id=>[...bots].filter(([other])=>other!==id).map(([id,b])=>({id,...carState(b.session.car,b.session.race,b.session.ghost),air:!b.session.car.grounded}));
 bots=createRoomBots({players,ownerId:'host',track,laps:3,random:seeded(seed),contacts:id=>traffic(id).filter(c=>!c.ghost&&!c.air),traffic});
 const samples=new Map(players.map(p=>[p.id,new Map()])),stalls=new Map(players.map(p=>[p.id,{now:0,max:0}]));
 for(let step=0;step<120*600&&[...bots.values()].some(b=>!b.session.race.finished);step++)for(const [id,bot] of bots){
  const s=bot.session;if(s.race.finished)continue;s.step(bot.driver({car:s.car,race:s.race},track));bot.step++;
  const stall=stalls.get(id);stall.now=!s.race.frozen&&Math.hypot(s.car.vx,s.car.vz)<1?stall.now+DT:0;stall.max=Math.max(stall.max,stall.now);
  // 在同一距离桶比较实际走线，避免把不同弯道的横向偏移误算为个性差异。
  if(!s.race.frozen&&s.race.lap>=2&&step%12===0){const bin=Math.floor(s.car.near.s/10),bins=samples.get(id),value=bins.get(bin)??{sum:0,count:0};value.sum+=s.car.near.lateral;value.count++;bins.set(bin,value);}
 }
 const cars=players.map(p=>({...p,...metrics(bots.get(p.id).session,{maxStall:stalls.get(p.id).max}),elapsed:bots.get(p.id).session.race.elapsed})),order=[...cars].sort((a,b)=>a.elapsed-b.elapsed).map(c=>c.id);
 let total=0,count=0;const pairDifferences=[];
 for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
  let sum=0,n=0;for(const [bin,a] of samples.get(players[i].id)){const b=samples.get(players[j].id).get(bin);if(b){sum+=Math.abs(a.sum/a.count-b.sum/b.count);n++;}}
  pairDifferences.push({pair:[players[i].id,players[j].id],mean:n?sum/n:0});total+=sum;count+=n;
 }
 return {seed,reverse,order,seats:order.map(id=>cars.find(c=>c.id===id).seat),meanLateralDifference:count?total/count:0,pairDifferences,cars};
}
function verify(result){assert.ok(result.finished,'机器人必须完赛');assert.equal(result.resets,0);assert.equal(result.falls,0);assert.ok(result.maxStall<2,'机器人不能卡死');}
async function main(){
 const tracks=TRACKS.map(({def})=>({name:def.name.zh,track:buildTrack(def)}));
 if(process.argv.includes('--probe')){
  for(const {name,track} of tracks)for(const [grip,braking] of [[1.3,20],[1.8,24],[2.1,26],[2.2,20],[2.2,26],[2.5,20]]){
   const s=createSession(track,{laps:2});for(let step=0;step<120*400&&!s.race.finished;step++)s.step(autopilot({car:s.car},track,{cruise:1.8,cornerGrip:grip,braking}));
   console.log(JSON.stringify({地图:name,弯速倍率:grip,制动预测:braking,...metrics(s)}));
  }return;
 }
 const timing=[],endurance=[],packs=[];
 for(const {name,track} of tracks)for(const difficulty of ['easy','normal','hard']){
  const runs=[11,29,47].map(seed=>runSolo(track,difficulty,{seed}));for(const r of runs)verify(r);
  const laps=runs.map(r=>r.lapTimes[1]);timing.push({地图:name,难度:difficulty,三次单圈:laps,平均:laps.reduce((a,b)=>a+b,0)/3,最快:Math.min(...laps),runs});
 }
 // 三图按相同比例提速，容许赛道机关和起伏带来 2.5 个百分点的差异。
 const baseLaps=[52.5,55.8,98.6],ranges={easy:[47.5,49.5],normal:[44,45],hard:[40,42]};
 for(const difficulty of ['easy','normal','hard']){const rows=timing.filter(t=>t.难度===difficulty),[min,max]=ranges[difficulty];assert.ok(rows[0].平均>=min&&rows[0].平均<=max,'草甸圈速必须达到目标');for(let i=1;i<rows.length;i++)assert.ok(Math.abs(rows[i].平均/baseLaps[i]-rows[0].平均/baseLaps[0])<.025,'三图应同比例提速');}
 for(const {name,track} of tracks){const result=runSolo(track,'hard',{seed:73,laps:10});verify(result);assert.equal(result.branchInteriorSteps,0);endurance.push({地图:name,...result});}
 for(const seed of [2026,2027,2028])for(const reverse of [false,true]){const result=runPack(tracks[0].track,{seed,reverse});for(const car of result.cars)verify(car);assert.ok(result.meanLateralDifference>.15);assert.notDeepEqual(result.seats,[0,1,2,3,4]);packs.push(result);}
 console.log(JSON.stringify({测速口径:'每个种子独立发车跑两圈，取第二圈；三次平均与最快。耐久另跑十圈。同场启用软碰撞和尾流，无道具。',timing,endurance,packs},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
