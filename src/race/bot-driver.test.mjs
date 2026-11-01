import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTrack } from './track/build.js';
import alpine from './track/data/alpine.js';
import meadow from './track/data/meadow.js';
import { createSession } from './sim/session.js';
import { autopilot } from './sim/autopilot.js';

test('autopilot 默认参数保持既有 2000 步输入序列逐位一致',()=>{
 const track=buildTrack(alpine),session=createSession(track),inputs=[];
 for(let i=0;i<2000;i++){const bits=autopilot({car:session.car,race:session.race},track);inputs.push(bits);session.step(bits);}
 assert.equal(createHash('sha256').update(Uint8Array.from(inputs)).digest('hex'),'3a363f958c1f0fc8591776f3065a63499f7c77219dcde37ed53f4b5b73de76d0');
});
test('简单地图三圈全部完赛，用时困难 < 普通 < 简单',async()=>{
 const {createRoomBots}=await import('./room-bots.js'),track=buildTrack(meadow),times={};
 for(const difficulty of ['easy','normal','hard']){const bots=createRoomBots({track,laps:3,ownerId:'host',random:()=>.5,contacts:()=>[],players:[{id:'b',seat:0,bot:true,ownerId:'host',difficulty,connected:true}]}),bot=bots.get('b'),s=bot.session;for(let step=0;step<120*600&&!s.race.finished;step++)s.step(bot.driver({car:s.car,race:s.race},track));assert.equal(s.race.finished,true,difficulty);assert.equal(s.race.lapTimes.length,3);times[difficulty]=s.race.elapsed;}
 console.log('机器人三档用时（秒）',times);assert.ok(times.hard<times.normal&&times.normal<times.easy,JSON.stringify(times));
});

test('机器人氮气仅直道 120 米或后半名次触发，弯道扫描包含远端和分支投影',async()=>{
 const m=await import('./bot-driver.js');assert.equal(typeof m.botShouldUseItem,'function');
 const straight={length:1000,at:()=>({tx:0,tz:1})},curve={...straight,at:s=>({tx:Math.sin(s*.02),tz:Math.cos(s*.02)})},actor={id:'a',car:{near:{s:0}},race:{lap:1},rank:1,count:4,time:1};
 assert.equal(m.botShouldUseItem('nitro',actor,[],straight,0,false),true);assert.equal(m.botShouldUseItem('nitro',actor,[],curve,0,false),false);assert.equal(m.botShouldUseItem('nitro',{...actor,rank:3},[],curve,0,false),true);
 assert.equal(m.botShouldUseItem('nitro',actor,[],{...curve,at:s=>s<110?straight.at(s):curve.at(s)},0,false),false);
});
test('机器人导弹有目标才发，水雷后方 30 米或超过 6 秒，护盾锁定或超过 8 秒',async()=>{
 const m=await import('./bot-driver.js');assert.equal(typeof m.botShouldUseItem,'function');const track={length:1000},actor={id:'a',car:{near:{s:100}},race:{lap:2}},front={id:'b',lap:2,s:120},back={id:'c',lap:2,s:70};
 assert.equal(m.botShouldUseItem('missile',actor,[front],track,0,false),true);assert.equal(m.botShouldUseItem('missile',actor,[back],track,9,false),false);
 assert.equal(m.botShouldUseItem('mine',actor,[back],track,0,false),true);assert.equal(m.botShouldUseItem('mine',actor,[{...back,s:69.9}],track,6,false),false);assert.equal(m.botShouldUseItem('mine',actor,[],track,6.01,false),true);assert.equal(m.botShouldUseItem('mine',actor,[{...back,ghost:true}],track,0,false),false);
 assert.equal(m.botShouldUseItem('shield',actor,[],track,0,true),true);assert.equal(m.botShouldUseItem('shield',actor,[],track,8,false),false);assert.equal(m.botShouldUseItem('shield',actor,[],track,8.01,false),true);
});
test('机器人道具反应为 0.3–0.8 秒，同一随机数下高档延迟不增，正随机数时严格递减',async()=>{
 const m=await import('./bot-driver.js');assert.equal(typeof m.botItemDelay,'function');for(const random of [()=>0,()=>.5,()=>1]){const values=['hard','normal','easy'].map(d=>m.botItemDelay(d,random));assert.ok(values[0]>=.3&&values[2]<=.8);assert.ok(values[0]<=values[1]&&values[1]<values[2]);if(random()>0)assert.ok(values[0]<values[1]);}
});

test('机器人水雷前方 200 米内有效目标立即使用，排除无效目标',async()=>{
 const {botShouldUseItem}=await import('./bot-driver.js'),track={length:1000},actor={id:'a',car:{near:{s:100}},race:{lap:1}},front={id:'b',lap:1,s:300};
 assert.equal(botShouldUseItem('mine',actor,[front],track,0,false),true);
 for(const patch of [{s:301},{ghost:true},{stale:true},{connected:false},{finished:true}])assert.equal(botShouldUseItem('mine',actor,[{...front,...patch}],track,0,false),false);
});

test('三档提升驾驶预算，旧最高档无效',async()=>{
 const {createBotDriver,createBotPersonality,botItemDelay}=await import('./bot-driver.js');
 const expected={easy:[1.8,2.3,27,1,.65],normal:[1.8,2.3,27,1,.4],hard:[1.8,2.3,27,1,.36]};
 for(const [difficulty,[cruise,cornerGrip,braking,reaction,delay]] of Object.entries(expected)){
  const p=createBotPersonality(difficulty,()=>.5);assert.deepEqual([p.cruise,p.cornerGrip,p.braking,p.reaction],[cruise,cornerGrip,braking,reaction]);assert.equal(botItemDelay(difficulty,()=>.5),delay);
 }
 assert.throws(()=>createBotDriver('extreme'),RangeError);
});

test('简单继承旧困难倍率，普通困难三图均有专属加成',async()=>{
 const {botPerformance}=await import('./bot-driver.js');const {TRACKS}=await import('./track/data/index.js');
 const expected=[[1,1,1],[1.25,1.12,1.3],[1.5,1.15,1.6]];
 for(const [i,{def}] of TRACKS.entries()){
  const track=buildTrack(def),[engine,topSpeed,grip]=expected[i];assert.deepEqual(botPerformance('easy',track),{engine,topSpeed,grip});
  for(const key of ['engine','topSpeed','grip']){assert.ok(botPerformance('normal',track)[key]>1);assert.ok(botPerformance('hard',track)[key]>botPerformance('normal',track)[key]);}
 }
});

test('困难零反应延迟仍即时转向，不产生空队列死循环',async()=>{
 const {createBotDriver}=await import('./bot-driver.js'),track=buildTrack(meadow),driver=createBotDriver('hard',{random:()=>0}),p=track.at(400),car={...createSession(track).car,...p,yaw:Math.atan2(p.tx,p.tz)-.5,near:null};
 assert.equal(driver.personality.reaction,0);
 for(let i=0;i<4;i++)assert.ok(driver({car,race:{frozen:true,lap:1}},track)&12);
});
test('简单继承旧困难草甸安全上限，高档仍能安全过弯',async()=>{
 const {runSolo}=await import('../../scripts/race/benchmark-bots.mjs'),track=buildTrack(meadow);
 for(const seed of [29,73]){const r=runSolo(track,'hard',{seed});assert.ok(r.finished);assert.equal(r.walls,0,`种子 ${seed}`);assert.equal(r.resets,0);}
});

// 首圈含静止起步，目标沿用上一轮飞驰圈口径；三圈全部用于稳定性验收。
test('再提升两档：三图每档三种子三圈稳定完赛并达到目标',async()=>{
 const {runSolo}=await import('../../scripts/race/benchmark-bots.mjs'),{TRACKS}=await import('./track/data/index.js');
 const targets=[[34.8,32,29.5],[36.1,33.2,30.5],[63.7,58.5,54]];
 for(const [i,{def}] of TRACKS.entries()){
  const track=buildTrack(def),means=[];
  for(const [j,difficulty] of ['easy','normal','hard'].entries()){
   const runs=[11,29,47].map(seed=>runSolo(track,difficulty,{seed,laps:3}));
   for(const r of runs){assert.ok(r.finished,`${def.id} ${difficulty} 完赛`);assert.equal(r.lapTimes.length,3);assert.equal(r.resets,0);assert.equal(r.falls,0);assert.equal(r.penalty,0);assert.equal(r.branchInteriorSteps,0);assert.ok(r.maxStall<2);assert.ok(r.maxWallContactDuration<1,`${def.id} ${difficulty} 连续贴墙 ${r.maxWallContactDuration}`);assert.ok(r.wallEpisodes<=3,`${def.id} ${difficulty} 擦墙段数 ${r.wallEpisodes}`);}
   const laps=runs.flatMap(r=>r.lapTimes.slice(1)),mean=laps.reduce((a,b)=>a+b,0)/laps.length;means.push(mean);
   assert.ok(Math.abs(mean-targets[i][j])<=(i===2?1.5:.8),`${def.id} ${difficulty} 平均 ${mean}，目标 ${targets[i][j]}`);
  }
  assert.ok(means[0]>means[1]&&means[1]>means[2],JSON.stringify(means));
 }
});

test('高档障碍区高速循迹不切弯碰到固定水泥墩',async()=>{
 const {runSolo}=await import('../../scripts/race/benchmark-bots.mjs'),{TRACKS}=await import('./track/data/index.js');
 for(const {def} of TRACKS.slice(1))for(const difficulty of ['normal','hard']){
  const r=runSolo(buildTrack(def),difficulty,{seed:11,laps:3});assert.equal(r.walls,0,`${def.id} ${difficulty} 固定水泥墩`);
 }
});
