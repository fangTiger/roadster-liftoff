import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomClient } from './room-client.js';
class Socket {
 static all=[];
 constructor(url){this.url=url;this.readyState=0;this.sent=[];Socket.all.push(this);}
 send(raw){this.sent.push(JSON.parse(raw));}
 open(){this.readyState=1;this.onopen();}
 message(m){this.onmessage({data:JSON.stringify(m)});}
 close(){this.readyState=3;this.onclose?.();}
}
function fixture(){let time=1000;const jobs=new Map();let id=0;const client=createRoomClient({url:'https://game.example/?race&room',WebSocket:Socket,now:()=>time,setTimeout:fn=>{jobs.set(++id,fn);return id;},clearTimeout:id=>jobs.delete(id),setInterval:fn=>{jobs.set(++id,fn);return id;},clearInterval:id=>jobs.delete(id)});return {client,jobs,advance:ms=>time+=ms,socket:()=>Socket.all.at(-1)};}
test('同源 wss、订阅消息、最小 RTT 的最近八次校时，取消订阅',()=>{
 const f=fixture(),seen=[];const off=f.client.on('room',m=>seen.push(m));f.client.connect({name:'甲'});const s=f.socket();assert.equal(s.url,'wss://game.example/rooms');s.open();assert.equal(s.sent[0].type,'hello');
 s.message({type:'room',code:'ABC234'});assert.equal(seen.length,1);off();s.message({type:'room'});assert.equal(seen.length,1);
 const ping=s.sent.find(m=>m.type==='ping');f.advance(20);s.message({type:'pong',t:ping.t,serverT:1510});assert.equal(f.client.serverNow(),1520);
 for(let i=0;i<8;i++){f.advance(2000);f.client.ping();const p=s.sent.at(-1);f.advance(100);s.message({type:'pong',t:p.t,serverT:p.t+1050});}
 assert.equal(f.client.serverNow(),18820);f.client.leave();assert.equal(f.jobs.size,0);
});
test('断线自动携令牌恢复，leave 停止重连',()=>{
 const f=fixture();f.client.connect({name:'乙',roomCode:'ABC234'});const a=f.socket();a.open();a.message({type:'welcome',id:'a',resumeToken:'token'});a.close();assert.ok(f.jobs.size);const [jobId,job]=[...f.jobs.entries()][0];f.jobs.delete(jobId);job();const b=f.socket();b.open();assert.equal(b.sent[0].resumeToken,'token');assert.equal(b.sent[0].roomCode,'ABC234');f.client.leave();assert.equal(b.sent.at(-1).type,'leave');assert.equal(f.jobs.size,0);
});

test('浏览订阅不会建房，加入失败仍能重试，进入房间后退订',()=>{
 const f=fixture();f.client.browse();const s=f.socket();s.open();assert.equal(s.sent[0].type,'listRooms');assert.ok(!s.sent.some(m=>m.type==='hello'));
 f.client.connect({name:'乙',roomCode:'ABC234',password:'0000'});assert.equal(f.socket(),s);assert.equal(s.sent.at(-1).type,'hello');
 s.message({type:'error',code:'BAD_PASSWORD'});assert.equal(s.sent.at(-1).type,'listRooms');
 f.client.connect({name:'乙',roomCode:'ABC234',password:'2468'});s.message({type:'welcome',id:'b',resumeToken:'安全令牌'});
 assert.equal(s.sent.at(-1).type,'unlistRooms');f.client.leave();
});

test('断线恢复 hello 只含昵称与令牌，不重发创建参数或密码',()=>{
 const f=fixture();f.client.connect({name:'甲',create:{name:'密室',locked:true,password:'2468'}});const a=f.socket();a.open();a.message({type:'welcome',id:'a',resumeToken:'令牌'});a.close();
 const [key,job]=[...f.jobs.entries()][0];f.jobs.delete(key);job();const b=f.socket();b.open();
 assert.deepEqual(b.sent[0],{type:'hello',name:'甲',resumeToken:'令牌'});f.client.leave();
});

test('加入尚未返回时恢复浏览会取消旧连接，迟到 welcome 不影响列表和下次加入',()=>{
 const f=fixture();f.client.browse();const a=f.socket();a.open();f.client.connect({name:'甲',roomCode:'ABC234',password:'2468'});
 f.client.browse();const b=f.socket();assert.notEqual(b,a);assert.equal(a.readyState,3);b.open();
 assert.doesNotThrow(()=>a.message({type:'welcome',id:'旧连接',resumeToken:'旧令牌'}));assert.equal(f.client.id,null);assert.equal(b.sent[0].type,'listRooms');
 f.client.connect({name:'甲',roomCode:'ABC234',password:'2468'});b.message({type:'welcome',id:'新连接',resumeToken:'新令牌'});assert.equal(f.client.id,'新连接');f.client.leave();
});
