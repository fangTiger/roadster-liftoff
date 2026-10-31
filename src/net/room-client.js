// 仅使用内存保存恢复令牌；离房时清除，网络断开时保留同一局的本地模拟。
export function createRoomClient({url=globalThis.location.href,WebSocket=globalThis.WebSocket,now=Date.now,setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout,setInterval=globalThis.setInterval,clearInterval=globalThis.clearInterval}={}) {
 const endpoint=new URL('/rooms',url);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
 const listeners=new Map(),pending=new Map();let mode='joining',socket,hello,id,resumeToken,stopped=true,retry,pulse,attempt=0,offset=0,samples=[];
 const emit=(type,m)=>{for(const fn of listeners.get(type)||[])fn(m);};
 function send(message){if(socket?.readyState!==1)return false;socket.send(JSON.stringify(message));return true;}
 function ping(){const t=now();if(send({type:'ping',t})){pending.set(t,t);for(const key of pending.keys())if(t-key>20000)pending.delete(key);}}
 function open(){
  if(stopped)return;
  socket=new WebSocket(endpoint.href);const active=socket;
  active.onopen=()=>{
   if(stopped||socket!==active)return;
   attempt=0;send(mode==='browsing'?{type:'listRooms'}:{type:'hello',...hello,...(resumeToken?{resumeToken}:{})});ping();pulse=setInterval(ping,2000);
  };
  active.onmessage=event=>{
   if(stopped||socket!==active)return;
   let m;try{m=JSON.parse(event.data);}catch{return;}
   if(!m||typeof m.type!=='string')return;
   if(m.type==='welcome'){id=m.id;resumeToken=m.resumeToken;hello={name:hello.name,...(hello.roomCode?{roomCode:hello.roomCode}:{})};send({type:'unlistRooms'});emit('connection',{connected:true});}
   if(m.type==='rooms')emit('connection',{connected:true});
   if(m.type==='error'&&!id&&mode==='joining'){mode='browsing';hello=null;send({type:'listRooms'});}
   if(m.type==='pong'&&pending.has(m.t)&&Number.isFinite(m.serverT)){
    const sent=pending.get(m.t);pending.delete(m.t);const received=now(),rtt=received-sent;
    if(rtt>=0){samples=[...samples.slice(-7),{rtt,offset:m.serverT-(sent+received)/2}];offset=samples.reduce((a,b)=>a.rtt<=b.rtt?a:b).offset;}
   }
   if(m.type==='error'&&m.code==='NO_ROOM'&&resumeToken){resumeToken=null;id=null;stopped=true;clearInterval(pulse);active.close();}
   emit(m.type,m);
  };
  active.onclose=()=>{
   if(socket!==active)return;
   clearInterval(pulse);pulse=undefined;pending.clear();emit('connection',{connected:false});
   if(!stopped)retry=setTimeout(()=>{retry=undefined;open();},Math.min(5000,500*2**attempt++));
  };
  active.onerror=()=>{};
 }
 function stop(){stopped=true;clearTimeout(retry);clearInterval(pulse);retry=pulse=undefined;socket?.close();socket=null;pending.clear();}
 return {
  browse(){
   // 切回列表要取消未完成的加入，忽略旧连接迟到的 welcome。
   if(mode==='joining'&&!id&&!stopped)stop();
   if(id)send({type:'leave'});
   mode='browsing';hello=null;id=resumeToken=null;
   if(!stopped&&socket?.readyState===1){send({type:'listRooms'});return;}
   stop();attempt=0;stopped=false;open();
  },
  connect(options){
   if(mode==='browsing'&&!stopped&&socket?.readyState===1){mode='joining';hello={...options};send({type:'hello',...hello});return;}
   stop();mode='joining';hello={...options};id=resumeToken=null;offset=0;samples=[];attempt=0;stopped=false;open();
  },
  send,ping,serverNow:()=>now()+offset,
  on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);return ()=>listeners.get(type).delete(fn);},
  leave(){send(id?{type:'leave'}:{type:'unlistRooms'});stop();id=resumeToken=null;},
  get id(){return id;},get connected(){return socket?.readyState===1&&!stopped;},
 };
}
