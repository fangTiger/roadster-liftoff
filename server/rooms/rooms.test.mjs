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
 const start=()=>{const a=connect(),code=last(a,'room').code,b=connect('对手',code);send(b,{type:'ready',on:true});send(a,{type:'start'});return {a,b,code,start:last(a,'start')};};
 return {rooms,out,closed,connect,send,last,start,advance(ms){time+=ms;rooms.tick();},get time(){return time;}};
}
test('建房、昵称清理、加入、六人满员与不存在的码',()=>{
 const f=fixture(),a=f.connect('\u0000赛车手😀'.repeat(8)),r=f.last(a,'room');assert.match(r.code,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);assert.equal(r.hostId,r.players[0].id);assert.equal(r.trackId,1);assert.equal([...r.players[0].name].length,16);assert.ok(!r.players[0].name.includes('\0'));
 for(let i=0;i<5;i++)f.connect('玩家',r.code);assert.equal(f.last(a,'room').players.length,6);
 assert.equal(f.last(f.connect('满员',r.code),'error').code,'ROOM_FULL');assert.equal(f.last(f.connect('不存在','ZZZZZZ'),'error').code,'NO_ROOM');
});
test('非房主拒绝选图；离开和掉线均移交给最早在场的人',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code),c=f.connect('丙',code);
 f.send(b,{type:'pickTrack',trackId:1});assert.equal(f.last(b,'error').code,'NOT_HOST');
 f.rooms.disconnect(a);assert.equal(f.last(b,'room').hostId,f.last(b,'welcome').id);assert.equal(f.last(b,'room').players.length,3);
 f.send(b,{type:'leave'});assert.equal(f.last(c,'room').hostId,f.last(c,'welcome').id);assert.equal(f.last(c,'left').id,f.last(b,'welcome').id);
});
test('房主手动 start，至少两人且其他真人准备，预留 1500ms，阶段按时切换',()=>{
 const f=fixture(),{a,b,start}=f.start();assert.equal(start.startAt,2500);assert.equal(start.laps,3);assert.deepEqual(start.grid.map(p=>p.seat),[0,1]);assert.equal(f.last(a,'room').phase,'countdown');
 f.send(b,{type:'ready',on:false});assert.equal(f.last(b,'error').code,'BAD_PHASE');f.advance(1500);assert.equal(f.last(a,'room').phase,'racing');
 const g=fixture(),solo=g.connect();g.send(solo,{type:'ready',on:true});g.send(solo,{type:'pickTrack',trackId:1});g.send(solo,{type:'start'});assert.equal(g.last(solo,'start'),undefined);
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
 const c=f.connect('丙',code);assert.equal(f.last(c,'room').players.find(p=>p.id===f.last(c,'welcome').id).seat,1);f.send(a,{type:'ready',on:true});f.send(c,{type:'ready',on:true});assert.equal(f.last(c,'room').phase,'lobby');f.send(a,{type:'start'});assert.equal(f.last(c,'room').phase,'countdown');assert.ok(f.last(c,'start').startAt>2500);
});
test('断线期间不会自动开始，恢复后需要重新准备；重复 finish 不覆盖首次成绩',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code),w=f.last(b,'welcome');
 f.send(b,{type:'ready',on:true});f.rooms.disconnect(b);f.send(a,{type:'ready',on:true});f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'start'});assert.equal(f.last(a,'start'),undefined);
 const c=f.connect('乙',code,w.resumeToken);assert.equal(f.last(c,'room').players.find(p=>p.id===w.id).ready,false);f.send(c,{type:'ready',on:true});f.send(a,{type:'start'});f.advance(1500);
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
function botsRace(){const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);for(const difficulty of ['normal','hard'])f.send(a,{type:'addBot',difficulty});const bots=f.last(a,'room').players.filter(p=>p.bot);f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'ready',on:true});f.send(b,{type:'ready',on:true});f.send(a,{type:'start'});return {...f,a,b,code,bots};}
test('机器人增删只许大厅房主，校验难度与座位，满员拒绝并可复用座位',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);
 f.send(b,{type:'addBot',difficulty:'easy'});assert.equal(f.last(b,'error').code,'NOT_HOST');
 f.send(a,{type:'addBot',difficulty:'bad'});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
 f.send(a,{type:'addBot',difficulty:'easy'});const bot=f.last(a,'room').players.find(p=>p.bot);assert.ok(bot);assert.match(bot.id,/^b\d+$/);assert.equal(bot.difficulty,'easy');assert.equal(bot.ownerId,f.last(a,'welcome').id);assert.equal(bot.ready,true);assert.equal(bot.connected,true);assert.equal(bot.seat,2);assert.equal(bot.name,undefined);
 f.send(b,{type:'removeBot',botId:bot.id});assert.equal(f.last(b,'error').code,'NOT_HOST');f.send(a,{type:'removeBot',botId:f.last(b,'welcome').id});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
 f.send(a,{type:'removeBot',botId:bot.id});assert.equal(f.last(a,'room').players.length,2);
 for(let i=0;i<4;i++)f.send(a,{type:'addBot',difficulty:'normal'});assert.equal(f.last(a,'room').players.length,6);assert.equal(f.last(a,'room').players[2].seat,2);
 f.send(a,{type:'addBot',difficulty:'hard'});assert.equal(f.last(a,'error').code,'ROOM_FULL');assert.equal(f.last(f.connect('丙',code),'error').code,'ROOM_FULL');
 f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'ready',on:true});f.send(b,{type:'ready',on:true});f.send(a,{type:'start'});
 for(const m of [{type:'addBot',difficulty:'easy'},{type:'removeBot',botId:f.last(a,'room').players[2].id}]){f.send(a,m);assert.equal(f.last(a,'error').code,'BAD_PHASE');}
});
test('一个真人和机器人可以开赛、完赛，机器人下局仍准备',()=>{
 const f=fixture(),a=f.connect();f.send(a,{type:'addBot',difficulty:'hard'});const bot=f.last(a,'room').players.find(p=>p.bot);assert.ok(bot);f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'start'});assert.equal(f.last(a,'start').grid.length,2);f.advance(1500);
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

test('比赛模式默认 items，只允许大厅房主切换，room 和 start 均下发 mode',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);assert.equal(f.last(a,'room').mode,'items');
 f.send(b,{type:'pickMode',mode:'speed'});assert.equal(f.last(b,'error').code,'NOT_HOST');f.send(a,{type:'pickMode',mode:'bad'});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
 f.send(a,{type:'pickMode',mode:'speed'});assert.equal(f.last(b,'room').mode,'speed');for(const c of [a,b])f.send(c,{type:'ready',on:true});f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'start'});assert.equal(f.last(a,'start').mode,'speed');
 f.send(a,{type:'pickMode',mode:'items'});assert.equal(f.last(a,'error').code,'BAD_PHASE');f.advance(1500);f.send(a,{type:'item',kind:'mine',itemId:f.last(a,'welcome').id+'-1',x:0,z:1,placedAt:4});assert.equal(f.last(a,'error').code,'BAD_PHASE');assert.equal(f.last(b,'item'),undefined);
});
test('水雷严格校验、每车 500ms 限流、itemId 跨时段去重且首次 mineHit 广播一次',()=>{
 const f=fixture(),{a,b}=f.start(),id=f.last(a,'welcome').id,m={type:'item',kind:'mine',itemId:id+'-1',x:10,z:20,placedAt:3};
 f.send(a,m);assert.equal(f.last(a,'error').code,'BAD_PHASE');f.advance(1500);
 for(const bad of [{itemId:'other-1'},{kind:'missile'},{x:'10'},{placedAt:-1},{itemId:'x'.repeat(100)}]){f.send(a,{...m,...bad});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');}assert.equal(f.last(b,'item'),undefined);
 f.send(a,{...m,from:'伪造',extra:1});assert.deepEqual(f.last(b,'item'),{...m,from:id});assert.deepEqual(f.last(a,'item'),f.last(b,'item'));
 f.advance(499);f.send(a,{...m,itemId:id+'-2'});assert.equal(f.out.get(b).filter(m=>m.type==='item').length,1);f.advance(1);f.send(a,{...m,itemId:id+'-2'});assert.equal(f.out.get(b).filter(m=>m.type==='item').length,2);
 f.advance(500);f.send(a,m);assert.equal(f.out.get(b).filter(m=>m.type==='item').length,2);
 f.send(b,{type:'mineHit',itemId:'unknown'});assert.equal(f.last(a,'mineGone'),undefined);f.send(b,{type:'mineHit',itemId:m.itemId,by:'伪造'});assert.deepEqual(f.last(a,'mineGone'),{type:'mineGone',itemId:m.itemId,by:f.last(b,'welcome').id});f.send(a,{type:'mineHit',itemId:m.itemId});assert.equal(f.out.get(a).filter(m=>m.type==='mineGone').length,1);
});
test('shield / trapped 可选布尔校验及转发白名单，机器人道具只接受所属房主',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);f.send(a,{type:'addBot',difficulty:'normal'});const bot=f.last(a,'room').players.find(p=>p.bot);for(const c of [a,b])f.send(c,{type:'ready',on:true});f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'start'});f.advance(1500);
 for(const field of ['shield','trapped'])for(const value of [1,null,'true']){f.send(a,{...state(1),[field]:value});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');}
 f.send(a,{...state(2),shield:true,trapped:false});assert.equal(f.last(b,'peer').shield,true);assert.equal(f.last(b,'peer').trapped,false);
 const mine={type:'item',botId:bot.id,kind:'mine',itemId:bot.id+'-1',x:0,z:1,placedAt:3};f.send(b,mine);assert.equal(f.last(b,'error').code,'NOT_HOST');assert.equal(f.last(a,'item'),undefined);f.send(a,mine);assert.equal(f.last(b,'item').from,bot.id);assert.equal(f.last(b,'item').botId,undefined);
 f.send(b,{type:'mineHit',botId:bot.id,itemId:mine.itemId});assert.equal(f.last(a,'mineGone'),undefined);f.send(a,{type:'mineHit',botId:bot.id,itemId:mine.itemId});assert.equal(f.last(b,'mineGone').by,bot.id);
});
test('恢复连接重放存活水雷，已命中或到期不重放，下一局重新去重',()=>{
 const f=fixture(),{a,b,code}=f.start(),id=f.last(a,'welcome').id,token=f.last(b,'welcome').resumeToken;f.advance(1500);
 const mine=n=>({type:'item',kind:'mine',itemId:id+'-'+n,x:0,z:10,placedAt:3});f.send(a,mine(1));f.advance(500);f.send(a,mine(2));f.send(a,{type:'mineHit',itemId:id+'-2'});f.rooms.disconnect(b);const resumed=f.connect('乙',code,token);assert.deepEqual(f.out.get(resumed).filter(m=>m.type==='item'),[{...mine(1),from:id}]);f.advance(30000);f.rooms.disconnect(resumed);const again=f.connect('乙',code,token);assert.equal(f.out.get(again).filter(m=>m.type==='item').length,0);
});
test('恢复连接也重放断线期间的 mineGone，以清除客户端旧实体',()=>{
 const f=fixture(),{a,b,code}=f.start(),id=f.last(a,'welcome').id,token=f.last(b,'welcome').resumeToken;f.advance(1500);f.send(a,{type:'item',kind:'mine',itemId:id+'-1',x:0,z:10,placedAt:3});f.rooms.disconnect(b);f.send(a,{type:'mineHit',itemId:id+'-1'});const resumed=f.connect('乙',code,token);assert.deepEqual(f.last(resumed,'mineGone'),{type:'mineGone',itemId:id+'-1',by:id});
});

test('导弹校验 target、朝向和模拟时间，与水雷共享限流和整局去重',()=>{
 const f=fixture(),{a,b}=f.start(),id=f.last(a,'welcome').id,target=f.last(b,'welcome').id,m={type:'item',kind:'missile',itemId:id+'-1',target,x:0,z:0,yaw:1,firedAt:3};
 f.send(a,m);assert.equal(f.last(a,'error').code,'BAD_PHASE');f.advance(1500);
 for(const patch of [{target:1},{target:'unknown'},{target:undefined},{yaw:null},{firedAt:-1}]){f.send(a,{...m,...patch});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');}assert.equal(f.last(b,'item'),undefined);
 f.send(a,{...m,from:'伪造'});assert.deepEqual(f.last(b,'item'),{...m,from:id});f.advance(500);f.send(a,m);assert.equal(f.out.get(b).filter(m=>m.type==='item').length,1);
 f.send(a,{type:'item',kind:'mine',itemId:id+'-2',x:0,z:0,placedAt:3});f.send(a,{...m,itemId:id+'-3',target:null});assert.equal(f.out.get(b).filter(m=>m.type==='item').length,2);f.advance(500);f.send(a,{...m,itemId:id+'-3',target:null});assert.equal(f.last(b,'item').target,null);
 f.send(b,{type:'finish',elapsed:10,bestLap:3,lapTimes:[3,3,4]});f.advance(500);f.send(a,{...m,itemId:id+'-4'});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
});
test('只有导弹目标可报 hit，首次广播 hitAt 并保留护盾判定，不能以 mineHit 命中导弹',()=>{
 const f=fixture(),{a,b}=f.start(),id=f.last(a,'welcome').id,target=f.last(b,'welcome').id,m={type:'item',kind:'missile',itemId:id+'-1',target,x:0,z:0,yaw:0,firedAt:0};f.advance(1500);f.send(a,m);
 f.send(a,{type:'hit',itemId:m.itemId,shielded:false});f.send(b,{type:'mineHit',itemId:m.itemId});assert.equal(f.last(a,'hitAt'),undefined);assert.equal(f.last(a,'mineGone'),undefined);
 f.send(b,{type:'hit',itemId:m.itemId,shielded:'true'});assert.equal(f.last(b,'error').code,'BAD_MESSAGE');f.advance(1500);f.send(b,{type:'hit',itemId:m.itemId,shielded:true,by:id});assert.deepEqual(f.last(a,'hitAt'),{type:'hitAt',itemId:m.itemId,by:target,shielded:true});f.send(b,{type:'hit',itemId:m.itemId,shielded:false});assert.equal(f.out.get(a).filter(m=>m.type==='hitAt').length,1);
});
test('导弹不能锁定离线车，目标掉线或完赛后不接受命中，机器人只能由所属房主报 hit',()=>{
 const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code);f.send(a,{type:'addBot',difficulty:'hard'});const bot=f.last(a,'room').players.find(p=>p.bot),id=f.last(a,'welcome').id;for(const c of [a,b])f.send(c,{type:'ready',on:true});f.send(a,{type:'pickTrack',trackId:1});f.send(a,{type:'start'});f.advance(1500);
 const m={type:'item',kind:'missile',itemId:id+'-1',target:bot.id,x:0,z:0,yaw:0,firedAt:0};f.send(a,m);f.send(b,{type:'hit',botId:bot.id,itemId:m.itemId});assert.equal(f.last(b,'error').code,'NOT_HOST');f.advance(1500);f.send(a,{type:'hit',botId:bot.id,itemId:m.itemId,shielded:false});assert.equal(f.last(b,'hitAt').by,bot.id);
 f.advance(500);f.send(a,{...m,itemId:id+'-2',target:f.last(b,'welcome').id});f.rooms.disconnect(b);f.advance(500);f.send(a,{...m,itemId:id+'-3',target:f.last(b,'welcome').id});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');
});
test('spinning 和 finished 为可选布尔状态并经过白名单转发',()=>{
 const f=fixture(),{a,b}=f.start();f.advance(1500);for(const key of ['spinning','finished']){f.send(a,{...state(1),[key]:1});assert.equal(f.last(a,'error').code,'BAD_MESSAGE');}f.send(a,{...state(2),spinning:true,finished:false});assert.equal(f.last(b,'peer').spinning,true);assert.equal(f.last(b,'peer').finished,false);
});

test('目标飞行中断线后恢复也不能补命中，已完赛目标不能报命中',()=>{
 for(const finish of [false,true]){const f=fixture(),{a,b,code}=f.start(),id=f.last(a,'welcome').id,target=f.last(b,'welcome').id,token=f.last(b,'welcome').resumeToken;f.advance(1500);f.send(a,{type:'item',kind:'missile',itemId:id+'-1',target,x:0,z:0,yaw:0,firedAt:0});let connection=b;
  if(finish)f.send(b,{type:'finish',elapsed:10,bestLap:3,lapTimes:[3,3,4]});else{f.rooms.disconnect(b);connection=f.connect('乙',code,token);assert.equal(f.last(connection,'item'),undefined);}
  f.advance(1500);f.send(connection,{type:'hit',itemId:id+'-1',shielded:false});assert.equal(f.last(a,'hitAt'),undefined);
 }
});

test('水雷出手点为可选有限坐标，白名单转发及重连保留，旧消息仍接受',()=>{
 const f=fixture(),{a,b,code}=f.start(),id=f.last(a,'welcome').id,token=f.last(b,'welcome').resumeToken;f.advance(1500);const m={type:'item',kind:'mine',itemId:id+'-1',x:10,z:20,placedAt:3,ox:1,oz:2};
 f.send(a,{...m,extra:7});assert.deepEqual(f.last(b,'item'),{...m,from:id});f.rooms.disconnect(b);const resumed=f.connect('乙',code,token);assert.deepEqual(f.last(resumed,'item'),{...m,from:id});
 f.advance(500);const {ox,oz,...old}=m;f.send(a,{...old,itemId:id+'-2'});assert.deepEqual(f.last(resumed,'item'),{...old,itemId:id+'-2',from:id});
});
test('水雷拒绝非法出手坐标（含非有限 JSON 数值）',()=>{
 for(const field of ['ox','oz'])for(const raw of ['null','"1"','true','1e999','-1e999']){
  const f=fixture(),{a,b}=f.start(),id=f.last(a,'welcome').id;f.advance(1500);const m={type:'item',kind:'mine',itemId:id+'-1',x:10,z:20,placedAt:3};f.rooms.receive(a,JSON.stringify(m).slice(0,-1)+`,"${field}":${raw}}`);assert.equal(f.last(a,'error')?.code,'BAD_MESSAGE');assert.equal(f.last(b,'item'),undefined);
 }
});


test('准备、选图、模式均不自动开赛，非房主 start 拒绝，房主无需准备',()=>{
 const f=fixture(),a=f.connect(),b=f.connect('乙',f.last(a,'room').code);
 f.send(a,{type:'start'});assert.equal(f.last(a,'start'),undefined);
 f.send(b,{type:'start'});assert.equal(f.last(b,'error').code,'NOT_HOST');
 f.send(a,{type:'ready',on:true});f.send(b,{type:'ready',on:true});
 for(const message of [{type:'pickTrack',trackId:2},{type:'pickMode',mode:'speed'},{type:'ready',on:false}]){
  f.send(a,message);assert.equal(f.last(a,'room').phase,'lobby');assert.equal(f.last(a,'start'),undefined);
 }
 f.send(a,{type:'start'});assert.equal(f.last(a,'start').trackId,2);assert.equal(f.last(a,'start').mode,'speed');
 assert.equal(f.last(a,'room').players.find(p=>p.id===f.last(a,'welcome').id).ready,false);
 assert.deepEqual(f.last(a,'start'),f.last(b,'start'));
 f.send(a,{type:'start'});assert.equal(f.last(a,'error').code,'BAD_PHASE');assert.equal(f.out.get(a).filter(m=>m.type==='start').length,1);
 f.send(b,{type:'start'});assert.equal(f.last(b,'error').code,'NOT_HOST');
});

test('断线宽限期即使另有已准备真人和机器人也阻止开赛，恢复或超时移除后由房主开赛',()=>{
 for(const resume of [true,false]){
  const f=fixture(),a=f.connect(),code=f.last(a,'room').code,b=f.connect('乙',code),c=f.connect('丙',code),token=f.last(b,'welcome').resumeToken;
  f.send(a,{type:'addBot',difficulty:'normal'});f.send(b,{type:'ready',on:true});f.send(c,{type:'ready',on:true});f.rooms.disconnect(b);
  f.send(a,{type:'start'});assert.equal(f.last(a,'start'),undefined);assert.equal(f.last(a,'room').phase,'lobby');
  if(resume){const again=f.connect('乙',code,token);f.send(a,{type:'start'});assert.equal(f.last(a,'start'),undefined);f.send(again,{type:'ready',on:true});}
  else f.advance(30000);
  assert.equal(f.last(a,'start'),undefined);f.send(a,{type:'start'});assert.equal(f.last(a,'room').phase,'countdown');
 }
});

test('房主加两个机器人默认图直接开赛，结算后仍须再次手动开赛',()=>{
 const f=fixture(),a=f.connect();for(const difficulty of ['normal','hard'])f.send(a,{type:'addBot',difficulty});
 assert.equal(f.last(a,'start'),undefined);f.send(a,{type:'start'});assert.equal(f.last(a,'start').trackId,1);assert.equal(f.last(a,'start').grid.length,3);
 const first=f.last(a,'start');f.advance(1500);for(const bot of f.last(a,'room').players.filter(p=>p.bot))f.send(a,{...finish,type:'botFinish',botId:bot.id});f.send(a,finish);
 assert.equal(f.last(a,'room').phase,'lobby');f.send(a,{type:'pickTrack',trackId:3});f.send(a,{type:'pickMode',mode:'speed'});assert.equal(f.last(a,'start'),first);
 f.send(a,{type:'start'});assert.equal(f.last(a,'start').trackId,3);assert.equal(f.last(a,'room').phase,'countdown');
});
