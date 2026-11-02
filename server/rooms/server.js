import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { randomInt } from 'node:crypto';
import { createRooms } from './rooms.js';
import { clientIP } from './connection-ip.js';
import { readConfig } from './config.js';
import { originAllowed,createAdmission } from './admission.js';
import { createShutdown } from './shutdown.js';
export function createRoomServer({config=readConfig(),log=message=>console.log(message),exit}={}) {
 const counts=new Map(),admission=createAdmission(config);
 const rooms=createRooms({
  random:()=>randomInt(0,0x100000000)/0x100000000,
  send:(socket,message)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));},
  close:socket=>socket.close(1009),
  onRoom:(code,count)=>{if(counts.get(code)!==count){if(count)counts.set(code,count);else counts.delete(code);log(`房间 ${code}，人数 ${count}`);}},
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:2048});
 const server=createServer((request,response)=>{
  if(request.method==='GET'&&request.url?.split('?')[0]==='/healthz'){
   response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({ok:true,rooms:rooms.size,connections:wss.clients.size}));return;
  }
  response.writeHead(404);response.end();
 });
 let stopping=false;
 const reject=(socket,status)=>socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
 server.on('upgrade',(request,socket,head)=>{
  socket.on('error',()=>{});
  if(request.url?.split('?')[0]!=='/rooms')return reject(socket,'404 Not Found');
  if(!originAllowed(request.headers.origin,config.allowedOrigins))return reject(socket,'403 Forbidden');
  const ip=clientIP(request,config.trustProxy);
  if(stopping||!admission.tryAcquire(ip))return reject(socket,'503 Service Unavailable');
  // 无效握手可能不会产生 WebSocket，底层连接关闭也必须归还名额。
  let released=false;const release=()=>{if(!released){released=true;admission.release(ip);}};
  socket.once('close',release);
  try{wss.handleUpgrade(request,socket,head,ws=>{ws.once('close',release);wss.emit('connection',ws,request);});}
  catch{release();socket.destroy();}
 });
 wss.on('connection',(socket,request)=>{
  rooms.connect(socket,clientIP(request,config.trustProxy));
  socket.alive=true;
  socket.on('pong',()=>{socket.alive=true;});
  socket.on('message',(data,binary)=>{if(!stopping)rooms.receive(socket,binary?null:data.toString());});
  socket.on('close',()=>rooms.disconnect(socket));
  socket.on('error',()=>{});
 });
 const timer=setInterval(()=>rooms.tick(),100);
 const heartbeat=setInterval(()=>{for(const socket of wss.clients){if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();}},10000);
 const cleanup=()=>{clearInterval(timer);clearInterval(heartbeat);};
 wss.on('close',cleanup);
 server.on('error',()=>{console.error('房间服务启动失败');process.exitCode=1;cleanup();});
 server.on('listening',()=>log('房间服务已启动'));
 const stop=createShutdown({server,wss,cleanup,exit});
 return {server,wss,shutdown(){stopping=true;stop();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=readConfig(),app=createRoomServer({config});
 process.on('SIGTERM',app.shutdown);process.on('SIGINT',app.shutdown);
 app.server.listen(config.port,config.host);
}
