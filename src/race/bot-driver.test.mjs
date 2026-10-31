import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTrack } from './track/build.js';
import alpine from './track/data/alpine.js';
import meadow from './track/data/meadow.js';
import { createSession } from './sim/session.js';
import { autopilot } from './sim/autopilot.js';
import { LEFT,RIGHT } from './sim/input-bits.js';

test('autopilot 默认参数保持既有 2000 步输入序列逐位一致',()=>{
 const track=buildTrack(alpine),session=createSession(track),inputs=[];
 for(let i=0;i<2000;i++){const bits=autopilot({car:session.car,race:session.race},track);inputs.push(bits);session.step(bits);}
 assert.equal(createHash('sha256').update(Uint8Array.from(inputs)).digest('hex'),'3a363f958c1f0fc8591776f3065a63499f7c77219dcde37ed53f4b5b73de76d0');
});
test('机器人仅转向延迟指定步数，油门刹车即时生效，驱动队列互相独立',async()=>{
 const {createBotDriver}=await import('./bot-driver.js');
 const track=buildTrack(meadow),session=createSession(track),mask=LEFT|RIGHT;
 for(const [difficulty,opts,reaction] of [['easy',{cruise:1,cornerGrip:1},8],['normal',{cruise:1.15,cornerGrip:1.15},4],['hard',{cruise:1.3,cornerGrip:1.3},2]]){
  const driver=createBotDriver(difficulty),expected=[];
  for(let i=0;i<60;i++){const car={...session.car,yaw:session.car.yaw+(i%2?.2:-.2),vx:i%3?0:100},snap={car,race:session.race},bits=autopilot(snap,track,opts);expected.push(bits&mask);assert.equal(driver(snap,track),(bits&~mask)|(i<reaction?0:expected[i-reaction]));}
 }
});
test('简单地图三圈全部完赛，用时困难 < 普通 < 简单',async()=>{
 const {createBotDriver}=await import('./bot-driver.js'),track=buildTrack(meadow),times={};
 for(const difficulty of ['easy','normal','hard']){const s=createSession(track),driver=createBotDriver(difficulty);for(let step=0;step<120*600&&!s.race.finished;step++)s.step(driver({car:s.car,race:s.race},track));assert.equal(s.race.finished,true,difficulty);assert.equal(s.race.lapTimes.length,3);times[difficulty]=s.race.elapsed;}
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
test('机器人道具反应为 0.3–1.2 秒，同一随机数下难度越高越短',async()=>{
 const m=await import('./bot-driver.js');assert.equal(typeof m.botItemDelay,'function');for(const random of [()=>0,()=>.5,()=>1]){const values=['hard','normal','easy'].map(d=>m.botItemDelay(d,random));assert.ok(values[0]>=.3&&values[2]<=1.2);assert.ok(values[0]<values[1]&&values[1]<values[2]);}
});

test('机器人水雷前方 200 米内有效目标立即使用，排除无效目标',async()=>{
 const {botShouldUseItem}=await import('./bot-driver.js'),track={length:1000},actor={id:'a',car:{near:{s:100}},race:{lap:1}},front={id:'b',lap:1,s:300};
 assert.equal(botShouldUseItem('mine',actor,[front],track,0,false),true);
 for(const patch of [{s:301},{ghost:true},{stale:true},{connected:false},{finished:true}])assert.equal(botShouldUseItem('mine',actor,[{...front,...patch}],track,0,false),false);
});
