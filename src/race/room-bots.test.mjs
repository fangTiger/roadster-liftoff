import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomBots } from './room-bots.js';
import { buildTrack } from './track/build.js';
import meadow from './track/data/meadow.js';
import { gridSpawn } from './grid.js';

test('机器人各自拥有 session 与发车位，逐步不读取快照，接触回调带机器人身份',()=>{
 const track=buildTrack(meadow),calls=[],bots=createRoomBots({track,laps:3,ownerId:'host',players:[{id:'b1',seat:1,bot:true,ownerId:'host',difficulty:'normal',connected:true},{id:'b2',seat:2,bot:true,ownerId:'host',difficulty:'hard',connected:true},{id:'other',seat:3,bot:true,ownerId:'other',difficulty:'hard',connected:true}],contacts:(id,step)=>{calls.push({id,step});return [];}});
 assert.equal(bots.size,2);assert.notEqual(bots.get('b1').session,bots.get('b2').session);
 for(const [id,bot] of bots){const spawn=gridSpawn(track,id==='b1'?1:2);assert.equal(bot.session.car.x,spawn.x);assert.equal(bot.session.car.z,spawn.z);Object.defineProperty(bot.session,'snapshot',{get(){assert.fail('物理步不应读取快照');}});}
 for(let step=0;step<1000;step++)for(const bot of bots.values()){bot.session.step(bot.driver({car:bot.session.car,race:bot.session.race},track));bot.step++;}
 assert.deepEqual(new Set(calls.map(c=>c.id)),new Set(['b1','b2']));assert.ok(calls.every(c=>c.step>720));assert.ok([...bots.values()].every(b=>b.step===1000&&b.session.car.draft===0));
});

test('房主机器人注入随机源并从实际交通回调读取前车',()=>{
 const track=buildTrack(meadow),players=[{id:'bot',seat:0,bot:true,ownerId:'host',difficulty:'hard',connected:true}],calls=[];
 const options={track,players,ownerId:'host',laps:1,random:()=>.5,contacts:()=>[],traffic:(id,step)=>{calls.push({id,step});return [];}};
 const a=createRoomBots(options).get('bot'),b=createRoomBots(options).get('bot');
 assert.equal(JSON.stringify(a.driver.personality),JSON.stringify(b.driver.personality));
 a.driver({car:a.session.car,race:a.session.race},track);
 assert.deepEqual(calls,[{id:'bot',step:1}]);
});
