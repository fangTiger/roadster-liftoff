import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import def from '../track/data/alpine.js';
import { buildTrack,trackHash } from '../track/build.js';
import { createSession } from './session.js';
import { autopilot } from './autopilot.js';
import { createRecorder,decode,runReplay,stateHash } from './replay.js';
import { SIM_VERSION } from './physics.js';
test('RLE 编解码、拒绝损坏或不兼容回放',()=>{
 const r=createRecorder();for(const b of [1,1,1,8,8,0,128])r.record(b);
 const encoded=r.encode({track:'abc',laps:3});assert.deepEqual(decode(encoded),[1,1,1,8,8,0,128]);
 assert.throws(()=>decode({...encoded,steps:99}));assert.throws(()=>decode({...encoded,v:999}));assert.throws(()=>decode({...encoded,data:'!'}));
});
test('录制机器人三圈，RLE 重跑、重复运行、黄金快照逐位一致',async()=>{
 const track=buildTrack(def),s=createSession(track),r=createRecorder();
 for(let i=0;i<43200&&!s.snapshot.race.finished;i++){const b=autopilot(s.snapshot,track);r.record(b);s.step(b);}
 assert.ok(s.snapshot.race.finished);const replay=r.encode({track:trackHash(def),laps:3}),a=runReplay(def,replay),b=runReplay(def,replay);
 assert.deepEqual(a,b);assert.equal(a.hash,stateHash(s.snapshot));assert.deepEqual(a.lapTimes,s.snapshot.race.lapTimes);
 const golden=JSON.parse(await readFile(new URL('./golden.json',import.meta.url),'utf8'));
 assert.deepEqual({v:SIM_VERSION,...a},golden);
 assert.throws(()=>runReplay(def,{...replay,track:'bad'}));
});
