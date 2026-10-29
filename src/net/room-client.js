// 仅使用内存保存恢复令牌；离房时清除，网络断开时保留同一局的本地模拟。
export function createRoomClient({url=globalThis.location.href,WebSocket=globalThis.WebSocket,now=Date.now,setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout,setInterval=globalThis.setInterval,clearInterval=globalThis.clearInterval}={}) {
 const endpoint=new URL('/rooms',url);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
 const listeners=new Map(),pending=new Map();let socket,hello,id,resumeToken,stopped=true,retry,pulse,attempt=0,offset=0,samples=[];
 const emit=(type,m)=>{for(const fn of listeners.get(type)||[])fn(m);};
 function send(message){if(socket?.readyState!==1)return false;socket.send(JSON.stringify(message));return true;}
 function ping(){const t=now();if(send({type:'ping',t})){pending.set(t,t);for(const key of pending.keys())if(t-key>20000)pending.delete(key);}}
 function open(){
  if(stopped)return;
  socket=new WebSocket(endpoint.href);const active=socket;
  active.onopen=()=>{
   if(stopped||socket!==active)return;
   attempt=0;send({type:'hello',...hello,...(resumeToken?{resumeToken}:{})});ping();pulse=setInterval(ping,2000);
  };
  active.onmessage=event=>{
   if(stopped||socket!==active)return;
   let m;try{m=JSON.parse(event.data);}catch{return;}
   if(!m||typeof m.type!=='string')return;
   if(m.type==='welcome'){id=m.id;resumeToken=m.resumeToken;emit('connection',{connected:true});}
   if(m.type==='pong'&&pending.has(m.t)&&Number.isFinite(m.serverT)){
    const sent=pending.get(m.t);pending.delete(m.t);const received=now(),rtt=received-sent;
    if(rtt>=0){samples=[...samples.slice(-7),{rtt,offset:m.serverT-(sent+received)/2}];offset=samples.reduce((a,b)=>a.rtt<=b.rtt?a:b).offset;}
   }
   if(m.type==='error'&&['NO_ROOM','ROOM_FULL','BAD_PHASE'].includes(m.code)&&!id){stopped=true;clearInterval(pulse);active.close();}
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
  connect(options){stop();hello={...options};id=resumeToken=null;offset=0;samples=[];attempt=0;stopped=false;open();},
  send,ping,serverNow:()=>now()+offset,
  on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);return ()=>listeners.get(type).delete(fn);},
  leave(){send({type:'leave'});stop();id=resumeToken=null;},
  get id(){return id;},get connected(){return socket?.readyState===1&&!stopped;},
 };
}
