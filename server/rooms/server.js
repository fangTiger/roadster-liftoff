import { WebSocketServer, WebSocket } from 'ws';
import { randomInt } from 'node:crypto';
import { createRooms } from './rooms.js';
import { clientIP } from './connection-ip.js';
const port=Number(process.env.ROOMS_PORT||8933);
const counts=new Map();
const rooms=createRooms({
 random:()=>randomInt(0,0x100000000)/0x100000000,
 send:(socket,message)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));},
 close:socket=>socket.close(1009),
 onRoom:(code,count)=>{if(counts.get(code)!==count){if(count)counts.set(code,count);else counts.delete(code);console.log(`房间 ${code}，人数 ${count}`);}},
});
const server=new WebSocketServer({port,path:'/rooms',maxPayload:2048});
server.on('connection',(socket,request)=>{
 rooms.connect(socket,clientIP(request,process.env.ROOMS_TRUST_PROXY==='true'));
 socket.alive=true;
 socket.on('pong',()=>{socket.alive=true;});
 socket.on('message',(data,binary)=>rooms.receive(socket,binary?null:data.toString()));
 socket.on('close',()=>rooms.disconnect(socket));
 socket.on('error',()=>{});
});
const timer=setInterval(()=>rooms.tick(),100);
const heartbeat=setInterval(()=>{for(const socket of server.clients){if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();}},10000);
server.on('close',()=>{clearInterval(timer);clearInterval(heartbeat);});
server.on('error',()=>{console.error('房间服务启动失败');process.exitCode=1;clearInterval(timer);clearInterval(heartbeat);});
server.on('listening',()=>console.log('房间服务已启动'));
