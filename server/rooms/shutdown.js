import { WebSocket } from 'ws';
// 监听、连接、计时器和退出均可注入，测试不触发真实进程退出。
export function createShutdown({server,wss,cleanup,exit=code=>process.exit(code),setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout}) {
 let stopping=false,finished=false,grace,deadline;
 function finish(code){if(finished)return;finished=true;clearTimeout(grace);clearTimeout(deadline);cleanup();exit(code);}
 return ()=>{
  if(stopping)return;stopping=true;
  server.close();
  for(const socket of wss.clients)if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'maintenance'}));
  deadline=setTimeout(()=>finish(1),3000);
  grace=setTimeout(()=>{
   for(const socket of wss.clients)if(socket.readyState===WebSocket.OPEN)socket.close(1012);
   wss.close(()=>finish(0));
  },500);
 };
}
