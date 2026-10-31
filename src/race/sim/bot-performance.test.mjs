import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSession } from './session.js';
import { SIM_VERSION } from './physics.js';
import { autopilot } from './autopilot.js';
import { buildTrack } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
const baseline=['8225c3ac348b6778eb531ad8fe10a75d775bf5df7c2e17c42693967f025cf4ab','09953cc1b556983c7250679aded180741f3b780c093b9219c171a41b57cb886a','77ea33079c17dc1aed42dc326ed2601444707301aef488f205eeb4337b74ba52'];
test('三图真人/单人默认与显式中性性能选项保持原黄金输入及状态',()=>{
 assert.equal(SIM_VERSION,1);
 for(const [i,{def}] of TRACKS.entries())for(const botPerformance of [undefined,{engine:1,topSpeed:1,grip:1}]){
  const track=buildTrack(def),s=createSession(track,{botPerformance}),hash=createHash('sha256');
  for(let step=0;step<6000;step++){const bits=autopilot({car:s.car},track);s.step(bits);hash.update(JSON.stringify([bits,s.car,s.race]));}
  assert.equal(hash.digest('hex'),baseline[i]);
 }
});
test('性能倍率必须显式传入且会话之间隔离，参数值创建时复制',()=>{
 const track=buildTrack(TRACKS[0].def),options={engine:1.5,topSpeed:1.2,grip:1.2};
 const base=createSession(track),boosted=createSession(track,{botPerformance:options}),neutral=createSession(track,{botPerformance:{engine:1}});options.engine=1;
 for(let i=0;i<1500;i++){base.step(1);boosted.step(1);neutral.step(1);}
 assert.deepEqual(base.car,neutral.car);assert.ok(Math.hypot(boosted.car.vx,boosted.car.vz)>Math.hypot(base.car.vx,base.car.vz)+5);
});
test('性能倍率拒绝非正数、无穷与非法类型',()=>{
 const track=buildTrack(TRACKS[0].def);for(const key of ['engine','topSpeed','grip'])for(const value of [0,-1,NaN,Infinity,'1'])assert.throws(()=>createSession(track,{botPerformance:{[key]:value}}),RangeError);
});
