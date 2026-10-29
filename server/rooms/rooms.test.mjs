import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from './rooms.js';
const state = seq => ({ type:'state',seq,step:seq,x:1,y:0,z:2,yaw:0,pitch:0,vx:10,vz:0,steer:0,drifting:false,boost:false,ghost:false,air:false,lap:1,s:2 });
function fixture() {
 let time=1000,seed=1;
 const out=new Map(),closed=[];
 const rooms=createRooms({now:()=>time,random:()=>((seed=seed*16807%2147483647)/2147483647),send:(c,m)=>out.get(c).push(m),close:c=>closed.push(c)});
 const connect=(name='玩家',code,resumeToken)=>{const c={};out.set(c,[]);rooms.receive(c,JSON.stringify({type:'hello',name,roomCode:code,resumeToken}));return c;};
 const send=(c,m)=>rooms.receive(c,JSON.stringify(m)),last=(c,type)=>out.get(c).filter(m=>m.type===type).at(-1);
 const start=()=>{const a=connect(),code=last(a,'room').code,b=connect('对手',code);send(a,{type:'ready',on:true});send(b,{type:'ready',on:true});send(a,{type:'pickTrack',trackId:1});return {a,b,code,start:last(a,'start')};};
 return {rooms,out,closed,connect,send,last,start,advance(ms){time+=ms;rooms.tick();},get time(){return time;}};
}
test('建房、昵称清理、加入、六人满员与不存在的码',()=>{
 const f=fixture(),a=f.connect('\u0000赛车手😀'.repeat(8)),r=f.last(a,'room');assert.match(r.code,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);assert.equal(r.hostId,r.players[0].id);assert.equal([...r.players[0].name].length,16);assert.ok(!r.players[0].name.includes('\0'));
 for(let i=0;i<5;i++)f.connect('玩家',r.code);assert.equal(f.last(a,'room').players.length,6);
 assert.equal(f.last(f.connect('满员',r.code),'error').code,'ROOM_FULL');assert.equal(f.last(f.connect('不存在','ZZZZZZ'),'error').code,'NO_ROOM');
});
test('非房主拒绝选图；离开和掉线均移交给最早在场的人',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code),c=f.connect('丙',code);
 f.send(b,{type:'pickTrack',trackId:1});assert.equal(f.last(b,'error').code,'NOT_HOST');
 f.rooms.disconnect(a);assert.equal(f.last(b,'room').hostId,f.last(b,'welcome').id);assert.equal(f.last(b,'room').players.length,3);
 f.send(b,{type:'leave'});assert.equal(f.last(c,'room').hostId,f.last(c,'welcome').id);assert.equal(f.last(c,'left').id,f.last(b,'welcome').id);
});
test('至少两人、全部准备且选图才 start，预留 1500ms，阶段按时切换',()=>{
 const f=fixture(),{a,b,start}=f.start();assert.equal(start.startAt,2500);assert.equal(start.laps,3);assert.deepEqual(start.grid.map(p=>p.seat),[0,1]);assert.equal(f.last(a,'room').phase,'countdown');
 f.send(b,{type:'ready',on:false});assert.equal(f.last(b,'error').code,'BAD_PHASE');f.advance(1500);assert.equal(f.last(a,'room').phase,'racing');
 const g=fixture(),solo=g.connect();g.send(solo,{type:'ready',on:true});g.send(solo,{type:'pickTrack',trackId:1});assert.equal(g.last(solo,'start'),undefined);
});
test('只同房转发合法状态，每连接每秒最多 30 条',()=>{
 const f=fixture(),{a,b}=f.start(),other=f.connect();f.send(a,state(0));assert.equal(f.last(b,'peer'),undefined);f.advance(1500);
 for(let i=0;i<40;i++)f.send(a,state(i));assert.equal(f.out.get(b).filter(m=>m.type==='peer').length,30);assert.equal(f.last(other,'peer'),undefined);assert.equal(f.last(a,'peer'),undefined);
 f.advance(1000);f.send(a,state(40));assert.equal(f.last(b,'peer').seq,40);assert.equal(f.last(b,'peer').serverT,f.time);
});
test('30 秒内恢复同一席位与令牌，过期移除不可恢复',()=>{
 const f=fixture(),{a,b,code}=f.start(),w=f.last(a,'welcome');f.advance(1500);f.rooms.disconnect(a);f.advance(29999);
 const again=f.connect('新昵称',code,w.resumeToken);assert.equal(f.last(again,'welcome').id,w.id);assert.equal(f.last(again,'room').players.find(p=>p.id===w.id).seat,0);assert.equal(f.last(again,'start').startAt,2500);
 f.rooms.disconnect(again);f.advance(30000);assert.equal(f.last(b,'room').players.length,1);assert.equal(f.last(f.connect('过期',code,w.resumeToken),'error').code,'NO_ROOM');
});
test('结算按 elapsed 排序、清空准备并回大厅',()=>{
 const f=fixture(),{a,b}=f.start();f.advance(1500);
 f.send(a,{type:'finish',elapsed:120,bestLap:39,lapTimes:[40,39,41]});assert.equal(f.last(a,'results'),undefined);
 f.send(b,{type:'finish',elapsed:117,bestLap:38,lapTimes:[38,39,40]});const r=f.last(a,'results').results;assert.deepEqual(r.map(p=>p.elapsed),[117,120]);assert.deepEqual(r.map(p=>p.rank),[1,2]);assert.deepEqual(f.last(b,'results').results,r);assert.equal(f.last(a,'room').phase,'lobby');assert.ok(f.last(a,'room').players.every(p=>!p.ready));
});
test('首次冲线 60 秒后未完成者 DNF，退出者仍在结算',()=>{
 const f=fixture(),{a,b}=f.start();f.advance(1500);f.send(a,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});f.advance(59999);assert.equal(f.last(a,'results'),undefined);f.advance(1);assert.equal(f.last(a,'results').results[1].dnf,true);
 const g=fixture(),race=g.start();g.advance(1500);g.send(race.b,{type:'leave'});g.send(race.a,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});assert.equal(g.last(race.a,'results').results[1].dnf,true);
});
test('非法 JSON、字段、阶段、二进制和过大消息均不崩溃',()=>{
 const f=fixture(),{a}=f.start();f.advance(1500);
 for(const raw of ['{','null','[]','42',JSON.stringify({type:'state',x:'坏'}),JSON.stringify({...state(1),x:null}),JSON.stringify({...state(1),ghost:'坏'}),JSON.stringify({type:'finish',elapsed:-1}),JSON.stringify({type:'ready',on:'是'}),JSON.stringify({type:'pickTrack',trackId:4}),JSON.stringify({type:'unknown'})]){assert.doesNotThrow(()=>f.rooms.receive(a,raw));assert.equal(f.last(a,'error').code,'BAD_MESSAGE');}
 f.rooms.receive(a,'x'.repeat(2049));assert.ok(f.closed.includes(a));
});
test('ping 接受真实 epoch 毫秒时间戳并回显服务器时钟',()=>{
 const messages=[],epoch=Date.UTC(2026,9,30),rooms=createRooms({now:()=>epoch+25,send:(_,m)=>messages.push(m)});
 rooms.receive({},JSON.stringify({type:'ping',t:epoch}));assert.deepEqual(messages.at(-1),{type:'pong',t:epoch,serverT:epoch+25});
});
test('超时移除的参赛者仍列为 DNF，下一局可复用空出的座位',()=>{
 const f=fixture(),{a,b,code}=f.start(),bid=f.last(b,'welcome').id;f.advance(1500);f.rooms.disconnect(b);f.advance(30000);
 f.send(a,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});assert.equal(f.last(a,'results').results.find(p=>p.id===bid).dnf,true);
 const c=f.connect('丙',code);assert.equal(f.last(c,'room').players.find(p=>p.id===f.last(c,'welcome').id).seat,1);f.send(a,{type:'ready',on:true});f.send(c,{type:'ready',on:true});assert.equal(f.last(c,'room').phase,'countdown');assert.ok(f.last(c,'start').startAt>2500);
});
test('断线期间不会自动开始，恢复后需要重新准备；重复 finish 不覆盖首次成绩',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code),w=f.last(b,'welcome');
 f.send(b,{type:'ready',on:true});f.rooms.disconnect(b);f.send(a,{type:'ready',on:true});f.send(a,{type:'pickTrack',trackId:1});assert.equal(f.last(a,'start'),undefined);
 const c=f.connect('乙',code,w.resumeToken);assert.equal(f.last(c,'room').players.find(p=>p.id===w.id).ready,false);f.send(c,{type:'ready',on:true});f.advance(1500);
 f.send(a,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});f.send(a,{type:'finish',elapsed:100,bestLap:30,lapTimes:[30,30,40]});f.send(c,{type:'finish',elapsed:117,bestLap:38,lapTimes:[38,39,40]});assert.equal(f.last(a,'results').results.find(p=>p.id===f.last(a,'welcome').id).elapsed,120);
});
test('air 与 ghost 必须是布尔值，白名单转发与恢复保留真实值',()=>{
 const f=fixture(),{a,b,code}=f.start();f.advance(1500);
 for(const patch of [{air:undefined},{air:1},{air:'true'},{air:null},{ghost:undefined},{ghost:0}]){
  f.send(a,{...state(1),...patch});assert.equal(f.last(a,'error')?.code,'BAD_MESSAGE');assert.equal(f.last(b,'peer'),undefined);
 }
 f.send(a,{...state(2),air:true,ghost:true,simT:123,extra:'丢弃'});const peer=f.last(b,'peer');assert.equal(peer.air,true);assert.equal(peer.ghost,true);assert.equal(peer.simT,undefined);assert.equal(peer.extra,undefined);
 const token=f.last(b,'welcome').resumeToken;f.rooms.disconnect(b);const resumed=f.connect('乙',code,token);assert.deepEqual(f.last(resumed,'peer'),peer);
 f.send(a,state(3));assert.equal(f.last(resumed,'peer').air,false);assert.equal(f.last(resumed,'peer').ghost,false);
});
test('表情只在 racing 接受，向同房全员回显并按玩家限流 1500ms，超限静默丢弃',()=>{
 const f=fixture(),{a,b}=f.start(),outside=f.connect(),id=f.last(a,'welcome').id;
 f.send(a,{type:'emote',id:1});assert.equal(f.last(a,'error')?.code,'BAD_PHASE');assert.equal(f.last(b,'emote'),undefined);
 f.advance(1500);const errors=f.out.get(a).filter(m=>m.type==='error').length;
 f.send(a,{type:'emote',id:1,from:'伪造'});assert.deepEqual(f.last(a,'emote'),{type:'emote',from:id,id:1});assert.deepEqual(f.last(b,'emote'),f.last(a,'emote'));assert.equal(f.last(outside,'emote'),undefined);
 f.advance(1499);f.send(a,{type:'emote',id:2});assert.equal(f.out.get(b).filter(m=>m.type==='emote').length,1);assert.equal(f.out.get(a).filter(m=>m.type==='error').length,errors);
 f.send(b,{type:'emote',id:6});assert.equal(f.last(a,'emote').id,6);
 f.advance(1);f.send(a,{type:'emote',id:2});assert.equal(f.last(b,'emote').id,2);
 f.send(a,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});f.send(b,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});
 f.send(a,{type:'emote',id:3});assert.equal(f.last(a,'error').code,'BAD_PHASE');
});
test('表情非法 id 先于阶段检查返回 BAD_MESSAGE',()=>{
 for(const id of [undefined,null,0,7,1.5,'1',true]){const f=fixture(),a=f.connect();f.send(a,{type:'emote',id});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');}
});

const finish={type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]};
function botsRace(){const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);for(const difficulty of ['normal','hard'])f.send(a,{type:'addBot',difficulty});const bots=f.last(a,'room').players.filter(p=>p.bot);f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'ready',on:true});f.send(b,{type:'ready',on:true});return {...f,a,b,code,bots};}
test('机器人增删只许大厅房主，校验难度与座位，满员拒绝并可复用座位',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);
 f.send(b,{type:'addBot',difficulty:'easy'});assert.equal(f.last(b,'error').code,'NOT_HOST');
 f.send(a,{type:'addBot',difficulty:'bad'});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
 f.send(a,{type:'addBot',difficulty:'easy'});const bot=f.last(a,'room').players.find(p=>p.bot);assert.ok(bot);assert.match(bot.id,/^b\d+$/);assert.equal(bot.difficulty,'easy');assert.equal(bot.ownerId,f.last(a,'welcome').id);assert.equal(bot.ready,true);assert.equal(bot.connected,true);assert.equal(bot.seat,2);assert.equal(bot.name,undefined);
 f.send(b,{type:'removeBot',botId:bot.id});assert.equal(f.last(b,'error').code,'NOT_HOST');f.send(a,{type:'removeBot',botId:f.last(b,'welcome').id});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
 f.send(a,{type:'removeBot',botId:bot.id});assert.equal(f.last(a,'room').players.length,2);
 for(let i=0;i<4;i++)f.send(a,{type:'addBot',difficulty:'normal'});assert.equal(f.last(a,'room').players.length,6);assert.equal(f.last(a,'room').players[2].seat,2);
 f.send(a,{type:'addBot',difficulty:'hard'});assert.equal(f.last(a,'error').code,'ROOM_FULL');assert.equal(f.last(f.connect('丙',code),'error').code,'ROOM_FULL');
 f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'ready',on:true});f.send(b,{type:'ready',on:true});
 for(const m of [{type:'addBot',difficulty:'easy'},{type:'removeBot',botId:f.last(a,'room').players[2].id}]){f.send(a,m);assert.equal(f.last(a,'error').code,'BAD_PHASE');}
});
test('一个真人和机器人可以开赛、完赛，机器人下局仍准备',()=>{
 const f=fixture(),a=f.connect();f.send(a,{type:'addBot',difficulty:'hard'});const bot=f.last(a,'room').players.find(p=>p.bot);assert.ok(bot);f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'ready',on:true});assert.equal(f.last(a,'start').grid.length,2);f.advance(1500);
 f.send(a,{...finish,type:'botFinish',botId:bot.id});f.send(a,finish);assert.equal(f.last(a,'results').results.length,2);assert.ok(f.last(a,'results').results.every(p=>!p.dnf));assert.equal(f.last(a,'room').players.find(p=>p.bot).ready,true);
});
test('botState 校验和授权复用真人规则，每个机器人独立限流且不回送所属房主',()=>{
 const f=botsRace();assert.equal(f.bots.length,2);const [x,y]=f.bots;const send=(c,botId,seq,extra={})=>f.send(c,{...state(seq),type:'botState',botId,...extra});
 send(f.a,x.id,0);assert.equal(f.last(f.b,'peer'),undefined);f.advance(1500);
 send(f.b,x.id,1);assert.equal(f.last(f.a,'peer'),undefined);assert.equal(f.last(f.b,'peer'),undefined);
 send(f.a,x.id,1,{air:'错'});assert.equal(f.last(f.a,'error').code,'BAD_MESSAGE');
 for(let i=0;i<40;i++)send(f.a,x.id,i,{extra:'丢弃'});for(let i=0;i<40;i++)send(f.a,y.id,i);for(let i=0;i<40;i++)f.send(f.a,state(i));
 const peers=f.out.get(f.b).filter(m=>m.type==='peer');for(const id of [x.id,y.id,f.last(f.a,'welcome').id])assert.equal(peers.filter(p=>p.id===id).length,30);assert.equal(peers[0].extra,undefined);assert.equal(f.last(f.a,'peer'),undefined);
 f.advance(1000);send(f.a,x.id,30);send(f.a,x.id,29);assert.equal(f.last(f.b,'peer').seq,30);
 f.send(f.b,{...finish,type:'botFinish',botId:x.id});f.send(f.a,finish);f.send(f.b,finish);assert.equal(f.last(f.b,'results'),undefined);
 f.send(f.a,{...finish,type:'botFinish',botId:x.id});f.send(f.a,{...finish,type:'botFinish',botId:y.id});assert.ok(f.last(f.b,'results').results.every(p=>!p.dnf));
});
test('房主掉线或离开使未完赛机器人 DNF，已完赛保留；新房主不接管',()=>{
 for(const leave of [false,true]){const f=botsRace();assert.equal(f.bots.length,2);f.advance(1500);f.send(f.a,{...finish,type:'botFinish',botId:f.bots[0].id});
 if(leave)f.send(f.a,{type:'leave'});else f.rooms.disconnect(f.a);
 assert.equal(f.last(f.b,'room').hostId,f.last(f.b,'welcome').id);f.send(f.b,{...finish,type:'botFinish',botId:f.bots[1].id});f.send(f.b,finish);if(!leave)f.advance(30000);
 const rows=f.last(f.b,'results').results;assert.equal(rows.find(p=>p.id===f.bots[0].id).dnf,false);assert.equal(rows.find(p=>p.id===f.bots[1].id).dnf,true);assert.ok(f.last(f.b,'room').players.every(p=>!p.bot));}
});
test('大厅房主离开或断线移交时移除机器人，恢复旧房主不会带回机器人',()=>{
 for(const leave of [true,false]){const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code),w=f.last(a,'welcome');f.send(a,{type:'addBot',difficulty:'normal'});assert.equal(f.last(a,'room').players.length,3);if(leave)f.send(a,{type:'leave'});else f.rooms.disconnect(a);assert.ok(f.last(b,'room').players.every(p=>!p.bot));assert.equal(f.last(b,'room').hostId,f.last(b,'welcome').id);if(!leave){const c=f.connect('甲',code,w.resumeToken);assert.ok(f.last(c,'room').players.every(p=>!p.bot));}}
});

test('所有真人已完赛时房主断线立即结算机器人 DNF，重连不能补报覆盖',()=>{
 const f=botsRace();assert.equal(f.bots.length,2);f.advance(1500);f.send(f.a,finish);f.send(f.b,finish);const token=f.last(f.a,'welcome').resumeToken;
 f.rooms.disconnect(f.a);const rows=f.last(f.b,'results').results;assert.equal(rows.filter(p=>p.dnf).length,2);assert.ok(rows.filter(p=>p.dnf).every(p=>p.bot));
 const resumed=f.connect('甲',f.code,token);f.send(resumed,{...finish,type:'botFinish',botId:f.bots[0].id});assert.deepEqual(f.last(resumed,'results').results,rows);assert.ok(f.last(resumed,'room').players.every(p=>!p.bot));
});
