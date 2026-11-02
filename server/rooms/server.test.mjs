import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { WebSocket } from 'ws';
import { createRoomServer } from './server.js';
import { readConfig } from './config.js';

async function fixture(t,options={}){
 const app=createRoomServer({config:{...readConfig({}),port:0,host:'127.0.0.1',...options},log:()=>{}});
 t.after(async()=>{const closed=once(app.wss,'close');for(const socket of app.wss.clients)socket.terminate();app.wss.close();app.server.close();await closed;});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const http=(path,method='GET')=>new Promise((resolve,reject)=>{const req=request(base+path,{method,agent:false},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
 const socket=(path='/rooms',headers={})=>{const ws=new WebSocket(base.replace('http:','ws:')+path,{headers});ws.on('error',()=>{});return ws;};
 const reject=async(path,headers,status)=>{const ws=socket(path,headers);const [,response]=await once(ws,'unexpected-response');response.resume();assert.equal(response.statusCode,status);ws.terminate();};
 return {...app,http,socket,reject};
}
test('健康检查仅暴露数量，包含浏览者与房间玩家，其他 HTTP 请求为 404',async t=>{
 const f=await fixture(t),empty=await f.http('/healthz');assert.equal(empty.status,200);assert.match(empty.headers['content-type'],/application\/json/);assert.deepEqual(JSON.parse(empty.body),{ok:true,rooms:0,connections:0});
 const viewer=f.socket();await once(viewer,'open');const player=f.socket();await once(player,'open');const room=once(player,'message');player.send(JSON.stringify({type:'hello',name:'私密车手'}));await room;
 assert.deepEqual(JSON.parse((await f.http('/healthz')).body),{ok:true,rooms:1,connections:2});
 assert.equal((await f.http('/rooms')).status,404);assert.equal((await f.http('/healthz','POST')).status,404);assert.equal((await f.http('/unknown')).status,404);
});
test('握手先检查路径和来源，拒绝不占连接名额',async t=>{
 const f=await fixture(t,{allowedOrigins:['https://mars-roadster-*.vercel.app'],maxConnections:1});
 await f.reject('/other',{},404);await f.reject('/rooms-extra',{},404);await f.reject('/rooms',{},403);await f.reject('/rooms',{Origin:'https://evil.example'},403);
 const ws=f.socket('/rooms?list=1',{Origin:'https://mars-roadster-preview.vercel.app'});await once(ws,'open');assert.equal(JSON.parse((await f.http('/healthz')).body).connections,1);
 await f.reject('/rooms',{Origin:'https://evil.example'},403);await f.reject('/rooms',{Origin:'https://mars-roadster-preview.vercel.app'},503);
});
test('代理 IP 准入、全服上限与 close 归还名额',async t=>{
 const f=await fixture(t,{trustProxy:true,maxPerIP:1,maxConnections:2}),a=f.socket('/rooms',{'X-Forwarded-For':'192.0.2.1'});await once(a,'open');
 await f.reject('/rooms',{'X-Forwarded-For':'192.0.2.1'},503);
 const b=f.socket('/rooms',{'X-Forwarded-For':'192.0.2.2'});await once(b,'open');await f.reject('/rooms',{'X-Forwarded-For':'192.0.2.3'},503);
 const closed=once(f.wss.clients.values().next().value,'close');a.close();await closed;
 const c=f.socket('/rooms',{'X-Forwarded-For':'192.0.2.1'});await once(c,'open');assert.equal(JSON.parse((await f.http('/healthz')).body).connections,2);
});
test('默认忽略转发头，不能通过更换代理 IP 绕过单 IP 上限',async t=>{
 const f=await fixture(t,{maxPerIP:1}),ws=f.socket('/rooms',{'X-Forwarded-For':'192.0.2.1'});await once(ws,'open');await f.reject('/rooms',{'X-Forwarded-For':'192.0.2.2'},503);
});
test('无效 WebSocket 握手释放预占连接数',async t=>{
 const f=await fixture(t,{maxConnections:1});
 const status=await new Promise((resolve,reject)=>{const req=request(`http://127.0.0.1:${f.server.address().port}/rooms`,{headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'invalid'},agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 assert.equal(status,400);await new Promise(resolve=>setImmediate(resolve));const ws=f.socket();await once(ws,'open');
});
