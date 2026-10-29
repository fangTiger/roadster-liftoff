import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceAudio } from './race.js';
import { qualifyTime } from '../race/config.js';
test('倒数三短一长、过线和完赛各播一次；墙声节流、加速事件不漏播', () => {
 const sounds = [], frames = [], a = createRaceAudio({ event: n => sounds.push(n), update: (_, s) => frames.push(s) });
 const s = { step: 0, car: { vx: 30, vz: 0, yaw: 0, grounded: true, drifting: true, fuel: 1 }, race: { frozen: true, countdown: 3 }, events: [] };
 for (const count of [3,3,2,1,0]) { s.race.countdown = count; s.race.frozen = count > 0; a.update(s, 1, .01); }
 s.events = [{type:'wall',step:1},{type:'wall',step:2},{type:'boost',step:3},{type:'counterBoost',step:4},{type:'lap',step:5}];
 s.race.finished = true; a.update(s, 1, .01); a.update(s,1,.01);
 assert.deepEqual(sounds, ['raceBeep','raceBeep','raceBeep','raceGo','raceWall','raceBoost','raceBoost','raceLap','raceFinish']);
 assert.ok(frames[0].tireSlip > 0); assert.equal(frames.at(-1).throttle, 0);
});
test('资格线读取优先级：链上零值不回退，赛道值优先于离线默认', () => {
 const e = { difficulty:'easy',def:{} };
 assert.equal(qualifyTime(e), 60000);
 assert.equal(qualifyTime({...e,qualifyMs:59000}),59000);
 assert.equal(qualifyTime(e,{qualifyMs:0n}),0);
 assert.equal(qualifyTime(e,{qualifyMs:55000n}),55000);
});
test('contact 闷响随 impact 传入强度，同一事件只播放一次，持续接触节流',()=>{
 const sounds=[],a=createRaceAudio({event:(name,opts)=>sounds.push({name,...opts}),update(){}}),s={car:{vx:0,vz:20,yaw:0,grounded:true,fuel:1},race:{frozen:false},events:[{type:'contact',impact:2,step:800},{type:'contact',impact:20,step:801},{type:'contact',impact:20,step:824}]};
 a.update(s,0,.01);a.update(s,0,.01);assert.deepEqual(sounds,[{name:'raceContact',impact:2},{name:'raceContact',impact:20}]);
});
test('新一局重置音效游标与接触节流，倒计时、接触和完赛都能再次播放',()=>{
 const sounds=[],a=createRaceAudio({event:name=>sounds.push(name),update(){}}),s={car:{vx:0,vz:0,yaw:0,grounded:true,fuel:1},race:{frozen:true,countdown:3,finished:false},events:[]};
 a.update(s,0,.01);s.race={frozen:false,finished:true};s.events=[{type:'contact',impact:5,step:15000}];a.update(s,0,.01);
 a.reset();s.race={frozen:true,countdown:3,finished:false};s.events=[];a.update(s,0,.01);s.race={frozen:false,finished:true};s.events=[{type:'contact',impact:5,step:800}];a.update(s,0,.01);
 assert.deepEqual(sounds,['raceBeep','raceGo','raceContact','raceFinish','raceBeep','raceGo','raceContact','raceFinish']);
});
test('尾流事件单独播放上扬音效，重复快照不重播，新局可重播',()=>{
 const sounds=[],audio=createRaceAudio({event:name=>sounds.push(name),update(){}}),s={car:{vx:0,vz:30,yaw:0,grounded:true,fuel:1},race:{frozen:false},events:[{type:'draft',step:900}]};
 audio.update(s,0,.01);audio.update(s,0,.01);assert.deepEqual(sounds,['raceDraft']);audio.reset();audio.update(s,0,.01);assert.deepEqual(sounds,['raceDraft','raceDraft']);
});
