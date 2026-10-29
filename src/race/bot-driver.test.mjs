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
 for(const [difficulty,opts,reaction] of [['easy',{cruise:.82,cornerGrip:.8},18],['normal',{cruise:.9,cornerGrip:.9},10],['hard',{cruise:1,cornerGrip:1},4]]){
  const driver=createBotDriver(difficulty),expected=[];
  for(let i=0;i<60;i++){const car={...session.car,yaw:session.car.yaw+(i%2?.2:-.2),vx:i%3?0:100},snap={car,race:session.race},bits=autopilot(snap,track,opts);expected.push(bits&mask);assert.equal(driver(snap,track),(bits&~mask)|(i<reaction?0:expected[i-reaction]));}
 }
});
test('简单地图三圈全部完赛，用时困难 < 普通 < 简单',async()=>{
 const {createBotDriver}=await import('./bot-driver.js'),track=buildTrack(meadow),times={};
 for(const difficulty of ['easy','normal','hard']){const s=createSession(track),driver=createBotDriver(difficulty);for(let step=0;step<120*600&&!s.race.finished;step++)s.step(driver({car:s.car,race:s.race},track));assert.equal(s.race.finished,true,difficulty);assert.equal(s.race.lapTimes.length,3);times[difficulty]=s.race.elapsed;}
 console.log('机器人三档用时（秒）',times);assert.ok(times.hard<times.normal&&times.normal<times.easy,JSON.stringify(times));
});
