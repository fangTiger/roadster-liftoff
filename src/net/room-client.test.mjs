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
