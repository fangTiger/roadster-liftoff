import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from './rooms.js';
import { createDirectory } from './directory.js';

function fixture(options={}) {
 let time=1000,seed=1;
 const all=[],out=new Map();
 const directory=options.directory??createDirectory({now:()=>time});
 const rooms=createRooms({now:()=>time,directory,random:()=>((seed=seed*16807%2147483647)/2147483647),send:(c,m)=>{out.get(c).push(m);all.push(JSON.parse(JSON.stringify(m)));}});
 const socket=(ip='192.0.2.1')=>{const c={};out.set(c,[]);rooms.connect(c,ip);return c;};
 const send=(c,m)=>rooms.receive(c,JSON.stringify(m)),last=(c,type)=>out.get(c).filter(m=>m.type===type).at(-1);
 const hello=async(m={},ip)=>{const c=socket(ip);await send(c,{type:'hello',name:'房主',...m});return c;};
 return {rooms,all,out,socket,send,last,hello,advance(ms){time+=ms;rooms.tick();}};
}

test('列表订阅即时响应、按一秒合并变更、退订停止，默认房名与在线人数正确',async()=>{
 const f=fixture(),viewer=f.socket();await f.send(viewer,{type:'listRooms'});assert.deepEqual(f.last(viewer,'rooms'),{type:'rooms',rooms:[],online:0});
 const a=await f.hello({name:'小明',create:{name:'',locked:false}}),code=f.last(a,'room').code;
 const b=await f.hello({roomCode:code},'192.0.2.2');
 f.advance(999);assert.equal(f.out.get(viewer).length,1);f.advance(1);
 const list=f.last(viewer,'rooms');assert.equal(list.rooms[0].name,'小明的房间');assert.equal(list.rooms[0].players,2);assert.equal(list.online,2);
 await f.send(viewer,{type:'unlistRooms'});f.rooms.disconnect(b);f.advance(1000);assert.equal(f.out.get(viewer).length,2);
});

test('创建校验、按 IP 跨重连限次、不同 IP 可加入，resumeToken 无需密码',async()=>{
 const f=fixture();const invalid=await f.hello({create:{locked:true,password:'12'}});assert.equal(f.last(invalid,'error').code,'BAD_PASSWORD');
 const a=await f.hello({create:{name:'密室',locked:true,password:'2468'}}),code=f.last(a,'room').code;
 for(let i=0;i<5;i++){const c=await f.hello({roomCode:code,password:'0000'});assert.equal(f.last(c,'error').code,i===4?'LOCKED_OUT':'BAD_PASSWORD');f.rooms.disconnect(c);}
 const locked=await f.hello({roomCode:code,password:'2468'});assert.equal(f.last(locked,'error').code,'LOCKED_OUT');
 const b=await f.hello({roomCode:code,password:'2468'},'192.0.2.2'),token=f.last(b,'welcome').resumeToken;f.rooms.disconnect(b);
 const resumed=await f.hello({resumeToken:token},'192.0.2.1');assert.equal(f.last(resumed,'welcome').resumeToken,token);
});

test('并发正确加入仍受六人上限、阶段变化及断线取消保护',async()=>{
 let release;
 const gate=new Promise(resolve=>release=resolve),directory=createDirectory({hash:async()=> '测试哈希',verify:async()=>{await gate;return true;}});
 const f=fixture({directory}),a=await f.hello({create:{locked:true,password:'2468'}}),code=f.last(a,'room').code;
 const cs=Array.from({length:8},(_,i)=>f.socket('ip'+i));
 const pending=cs.map(c=>f.send(c,{type:'hello',name:'访客',roomCode:code,password:'2468'}));
 f.rooms.disconnect(cs[0]);release();await Promise.all(pending);
 assert.equal(f.last(a,'room').players.length,6);assert.equal(f.last(cs[0],'welcome'),undefined);
 assert.equal(cs.filter(c=>f.last(c,'error')?.code==='FULL').length,2);
});

test('房间销毁清理目录；所有协议出口均不含密码或哈希，满员与开赛列为不可加入',async()=>{
 let forgot;
 const directory=createDirectory(),forget=directory.forget;directory.forget=code=>{forgot=code;forget(code);};
 const f=fixture({directory}),viewer=f.socket();await f.send(viewer,{type:'listRooms'});
 const a=await f.hello({create:{name:'深夜竞速',locked:true,password:'2468'}}),code=f.last(a,'room').code;
 const b=await f.hello({roomCode:code,password:'2468'},'192.0.2.2');
 for(let i=0;i<4;i++)f.send(a,{type:'addBot',difficulty:'normal'});
 f.advance(1000);assert.equal(f.last(viewer,'rooms').rooms[0].reason,'FULL');
 const full=await f.hello({roomCode:code,password:'2468'});assert.equal(f.last(full,'error').code,'FULL');
 const bot=f.last(a,'room').players.find(p=>p.bot);f.send(a,{type:'removeBot',botId:bot.id});
 f.send(b,{type:'ready',on:true});f.send(a,{type:'start'});f.advance(1000);
 assert.equal(f.last(viewer,'rooms').rooms[0].reason,'RACING');
 const racing=await f.hello({roomCode:code,password:'2468'});assert.equal(f.last(racing,'error').code,'RACING');
 f.advance(500);f.send(a,{type:'finish',elapsed:120,bestLap:40,lapTimes:[40,40,40]});f.send(b,{type:'leave'});f.send(a,{type:'leave'});
 assert.equal(forgot,code);f.advance(1000);assert.deepEqual(f.last(viewer,'rooms').rooms,[]);
 for(const m of f.all){const raw=JSON.stringify(m);assert.doesNotMatch(raw,/password|scrypt\$|2468/i,`消息 ${m.type} 泄露密码`);}
});

test('同 IP 多连接同时猜密码不能绕过五次锁定',async()=>{
 let verifies=0;
 const directory=createDirectory({hash:async()=> '仅服务器哈希',verify:async()=>{verifies++;await new Promise(resolve=>setImmediate(resolve));return false;}});
 const f=fixture({directory}),a=await f.hello({create:{locked:true,password:'2468'}}),code=f.last(a,'room').code;
 const guests=await Promise.all(Array.from({length:12},()=>f.hello({roomCode:code,password:'0000'})));
 assert.equal(verifies,5);assert.equal(guests.filter(c=>f.last(c,'error').code==='BAD_PASSWORD').length,4);assert.equal(guests.filter(c=>f.last(c,'error').code==='LOCKED_OUT').length,8);
});

test('密码校验等待期间开赛，晚到的正确校验不能加入比赛',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const directory=createDirectory({hash:async()=> '哈希',verify:async()=>{await gate;return true;}});
 const f=fixture({directory}),a=await f.hello({create:{locked:true,password:'2468'}}),code=f.last(a,'room').code,c=f.socket();
 const pending=f.send(c,{type:'hello',name:'晚到',roomCode:code,password:'2468'});
 f.send(a,{type:'addBot',difficulty:'normal'});f.send(a,{type:'start'});release();await pending;
 assert.equal(f.last(c,'welcome'),undefined);assert.equal(f.last(c,'error').code,'RACING');
});

test('节流期间刷新没有变化的列表，仍会在一秒后回应一次',async()=>{
 const f=fixture(),viewer=f.socket();f.send(viewer,{type:'listRooms'});f.send(viewer,{type:'listRooms'});
 assert.equal(f.out.get(viewer).length,1);f.advance(999);assert.equal(f.out.get(viewer).length,1);f.advance(1);assert.equal(f.out.get(viewer).length,2);
 f.advance(1000);assert.equal(f.out.get(viewer).length,2);
});
