// 房间状态机不依赖网络；时间、随机源与消息出口均可注入。
export const COLORS = ['#ef5350','#42b9ff','#ffd34d','#57db85','#c58aff','#ff963e'];
const ALPHABET='23456789ABCDEFGHJKMNPQRSTUVWXYZ',GRACE=30000;
const numeric=['seq','step','x','y','z','yaw','pitch','vx','vz','steer','lap','s'];
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e9;
const itemId=id=>typeof id==='string'&&id.length<=64&&/^[a-z0-9]+-[1-9][0-9]*$/.test(id);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const validState=m=>numeric.every(k=>finite(m[k]))&&integer(m.seq)&&integer(m.step)&&Number.isInteger(m.lap)&&m.lap>=1&&m.lap<=3&&m.s>=0&&typeof m.drifting==='boolean'&&typeof m.boost==='boolean'&&typeof m.ghost==='boolean'&&typeof m.air==='boolean'&&['shield','trapped','spinning','finished'].every(k=>m[k]===undefined||typeof m[k]==='boolean');
const validFinish=m=>finite(m.elapsed)&&m.elapsed>0&&finite(m.bestLap)&&m.bestLap>0&&Array.isArray(m.lapTimes)&&m.lapTimes.length===3&&m.lapTimes.every(n=>finite(n)&&n>0);
export function createRooms({now=Date.now,random=Math.random,send,close=()=>{},onRoom=()=>{}}={}) {
 const rooms=new Map(),clients=new Map(),tokens=new Map();let serial=0,botSerial=0,codeSerial=0;
 const randomText=n=>Array.from({length:n},()=>ALPHABET[Math.min(ALPHABET.length-1,Math.floor(random()*ALPHABET.length))]).join('');
 const error=(c,code)=>send(c,{type:'error',code});
 function code(){let value=randomText(6);while(rooms.has(value)){let n=++codeSerial;value='';for(let i=0;i<6;i++){value=ALPHABET[n%ALPHABET.length]+value;n=Math.floor(n/ALPHABET.length);}}return value;}
 const members=r=>r.players.filter(p=>!p.bot&&p.connected);
 function broadcast(r,m,except){for(const p of members(r))if(p!==except)send(p.connection,m);}
 function publish(r){broadcast(r,{type:'room',code:r.code,hostId:r.hostId,trackId:r.trackId,mode:r.mode,phase:r.phase,players:r.players.map(({id,name,seat,ready,connected,color,bot=false,difficulty,ownerId})=>({id,name,seat,ready,connected,color,bot,difficulty,ownerId}))});onRoom(r.code,r.players.length);}
 function invalidateTarget(r,id){for(const stored of r.items?.values()||[])if(stored.item.kind==='missile'&&stored.item.target===id)stored.invalid=true;}
 function dropBots(r,ownerId){for(const bot of r.players.filter(p=>p.bot&&p.ownerId===ownerId)){r.players=r.players.filter(p=>p!==bot);broadcast(r,{type:'left',id:bot.id});}}
 function host(r){const old=r.hostId;if(!members(r).some(p=>p.id===old))r.hostId=members(r)[0]?.id??null;if(old!==r.hostId&&r.phase==='lobby')dropBots(r,old);}
 function abandonBots(r,ownerId){
  if(r.phase==='lobby'){dropBots(r,ownerId);return;}
  for(const bot of r.players.filter(p=>p.bot&&p.ownerId===ownerId)){const entrant=r.round?.get(bot.id);if(entrant&&!entrant.finish)entrant.dnf=true;bot.connected=false;invalidateTarget(r,bot.id);}
 }
 function settle(r){
  if(!r.round||r.phase==='lobby')return;
  r.phase='results';publish(r);
  const results=[...r.round.values()].sort((a,b)=>Number(!a.finish)-Number(!b.finish)||(a.finish?.elapsed??0)-(b.finish?.elapsed??0)||a.seat-b.seat).map((p,i)=>({id:p.id,name:p.name,rank:i+1,elapsed:p.finish?.elapsed??null,bestLap:p.finish?.bestLap??null,dnf:!p.finish,bot:p.bot,difficulty:p.difficulty}));
  r.lastResults={type:'results',results};broadcast(r,r.lastResults);r.phase='lobby';r.start=null;r.deadline=null;
  for(const bot of [...r.players])if(bot.bot&&(!bot.connected||bot.ownerId!==r.hostId))dropBots(r,bot.ownerId);
  for(const p of r.players)p.ready=!!p.bot;
  publish(r);
 }
 function complete(r){if(r.round&&[...r.round.values()].every(p=>p.finish||p.dnf))settle(r);}
 function remove(r,p){
  abandonBots(r,p.id);invalidateTarget(r,p.id);
  if(p.connected)clients.delete(p.connection);tokens.delete(p.resumeToken);r.players=r.players.filter(q=>q!==p);
  const entrant=r.round?.get(p.id);if(entrant&&!entrant.finish)entrant.dnf=true;
  broadcast(r,{type:'left',id:p.id});host(r);
  if(!r.players.some(p=>!p.bot)){rooms.delete(r.code);onRoom(r.code,0);}else{publish(r);complete(r);}
 }
 function start(r){
  if(r.phase!=='lobby'||!r.trackId||r.players.length<2||!r.players.every(p=>p.connected&&(p.bot||p.id===r.hostId||p.ready)))return;
  r.phase='countdown';r.deadline=null;r.lastResults=null;
  r.round=new Map(r.players.map(p=>[p.id,{id:p.id,name:p.name,seat:p.seat,bot:!!p.bot,difficulty:p.difficulty,finish:null,dnf:false}]));
  r.items=new Map();
  for(const p of r.players){p.lastItem=-Infinity;p.state=null;p.lastSeq=-1;p.rate=[];}
  r.start={type:'start',trackId:r.trackId,mode:r.mode,laps:3,startAt:now()+1500,grid:r.players.map(({id,seat})=>({id,seat}))};publish(r);broadcast(r,r.start);
 }
 function tick(){
  const time=now();
  for(const r of rooms.values()){
   for(const p of [...r.players])if(!p.bot&&!p.connected&&time>=p.expires)remove(r,p);
   if(r.phase==='countdown'&&time>=r.start.startAt){r.phase='racing';publish(r);}
   if(r.phase==='racing'&&r.deadline!==null&&time>=r.deadline)settle(r);
  }
 }
 function hello(c,m){
  if(clients.has(c))return error(c,'BAD_MESSAGE');
  if(typeof m.name!=='string'||(m.roomCode!==undefined&&typeof m.roomCode!=='string')||(m.resumeToken!==undefined&&typeof m.resumeToken!=='string'))return error(c,'BAD_MESSAGE');
  if(m.resumeToken){
   const p=tokens.get(m.resumeToken),r=p&&rooms.get(p.code);
   if(!r||p.connected)return error(c,'NO_ROOM');
   p.connection=c;p.connected=true;p.expires=null;p.rate=[];clients.set(c,p);host(r);
   send(c,{type:'welcome',id:p.id,resumeToken:p.resumeToken});publish(r);
   if(r.start){send(c,r.start);if(r.mode==='items')for(const stored of r.items?.values()||[])if(!stored.invalid&&now()<stored.expires)send(c,stored.gone?(stored.result??{type:'mineGone',itemId:stored.item.itemId,by:stored.by}):stored.item);for(const other of r.players)if(other!==p&&other.state)send(c,{type:'peer',id:other.id,...other.state});}
   else if(r.lastResults)send(c,r.lastResults);
   return;
  }
  let r;
  if(m.roomCode){r=rooms.get(m.roomCode.trim().toUpperCase());if(!r)return error(c,'NO_ROOM');if(r.players.length>=6)return error(c,'ROOM_FULL');if(r.phase!=='lobby')return error(c,'BAD_PHASE');}
  else{r={code:code(),hostId:null,trackId:1,mode:'items',phase:'lobby',players:[],round:null,start:null,deadline:null,lastResults:null};rooms.set(r.code,r);}
  const id=String(++serial),seat=[0,1,2,3,4,5].find(n=>!r.players.some(p=>p.seat===n));
  const name=[...m.name.replace(/[\p{Cc}\p{Cf}]/gu,'').trim()].slice(0,16).join('')||'赛车手';
  const p={id,name,seat,color:COLORS[seat],code:r.code,resumeToken:randomText(32)+id,ready:false,connected:true,connection:c,rate:[],lastSeq:-1};
  r.players.push(p);clients.set(c,p);tokens.set(p.resumeToken,p);host(r);send(c,{type:'welcome',id,resumeToken:p.resumeToken});publish(r);
 }
 function receive(c,raw){
  tick();
  if(typeof raw!=='string')return error(c,'BAD_MESSAGE');
  if(new TextEncoder().encode(raw).length>2048){disconnect(c);close(c);return;}
  let m;try{m=JSON.parse(raw);}catch{return error(c,'BAD_MESSAGE');}
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.type!=='string')return error(c,'BAD_MESSAGE');
  if(m.type==='hello')return hello(c,m);
  if(m.type==='ping'){if(typeof m.t!=='number'||!Number.isFinite(m.t)||Math.abs(m.t)>Number.MAX_SAFE_INTEGER)return error(c,'BAD_MESSAGE');send(c,{type:'pong',t:m.t,serverT:now()});return;}
  // 先校验字段，再检查阶段，避免错误类型因房间状态而改变。
  if(m.type==='item'&&m.kind==='mine'&&['ox','oz'].some(k=>m[k]!==undefined&&!finite(m[k])))return error(c,'BAD_MESSAGE');
  if((['state','botState'].includes(m.type)&&!validState(m))||(['finish','botFinish'].includes(m.type)&&!validFinish(m))||(['botState','botFinish','removeBot'].includes(m.type)&&typeof m.botId!=='string')||(m.type==='addBot'&&!['easy','normal','hard'].includes(m.difficulty))||(m.type==='ready'&&typeof m.on!=='boolean')||(m.type==='pickTrack'&&![1,2,3].includes(m.trackId))||(m.type==='emote'&&(!Number.isInteger(m.id)||m.id<1||m.id>6)))return error(c,'BAD_MESSAGE');
  if((m.type==='pickMode'&&!['items','speed'].includes(m.mode))||(['item','mineHit','hit'].includes(m.type)&&(!itemId(m.itemId)||(m.botId!==undefined&&typeof m.botId!=='string')))||(m.type==='hit'&&m.shielded!==undefined&&typeof m.shielded!=='boolean')||(m.type==='item'&&(!['mine','missile'].includes(m.kind)||!finite(m.x)||!finite(m.z)||(m.kind==='mine'?(!finite(m.placedAt)||m.placedAt<0):(!finite(m.yaw)||!finite(m.firedAt)||m.firedAt<0||(m.target!==null&&typeof m.target!=='string'))))))return error(c,'BAD_MESSAGE');
  const p=clients.get(c),r=p&&rooms.get(p.code);if(!r)return error(c,'NO_ROOM');
  if(m.type==='leave'){remove(r,p);return;}
  if(m.type==='start'){
   if(p.id!==r.hostId)return error(c,'NOT_HOST');
   if(r.phase!=='lobby')return error(c,'BAD_PHASE');
   start(r);return;
  }
  if(m.type==='ready'||m.type==='pickTrack'||m.type==='pickMode'){
   if(m.type!=='ready'&&p.id!==r.hostId)return error(c,'NOT_HOST');
   if(r.phase!=='lobby')return error(c,'BAD_PHASE');
   if(m.type==='ready')p.ready=m.on;else if(m.type==='pickTrack')r.trackId=m.trackId;else r.mode=m.mode;publish(r);return;
  }
  if(m.type==='addBot'||m.type==='removeBot'){
   if(p.id!==r.hostId)return error(c,'NOT_HOST');
   if(r.phase!=='lobby')return error(c,'BAD_PHASE');
   if(m.type==='addBot'){
    if(r.players.length>=6)return error(c,'ROOM_FULL');
    const seat=[0,1,2,3,4,5].find(n=>!r.players.some(q=>q.seat===n));
    r.players.push({id:'b'+(++botSerial),seat,color:COLORS[seat],bot:true,difficulty:m.difficulty,ownerId:p.id,ready:true,connected:true,rate:[],lastSeq:-1});
   }else{
    const bot=r.players.find(q=>q.id===m.botId&&q.bot&&q.ownerId===p.id);if(!bot)return error(c,'BAD_MESSAGE');
    r.players=r.players.filter(q=>q!==bot);broadcast(r,{type:'left',id:bot.id});
   }
   // 增删机器人后仍等待房主手动开赛。
   publish(r);return;
  }
  if(m.type==='emote'){
   if(r.phase!=='racing')return error(c,'BAD_PHASE');
   const time=now();if(p.lastEmote!==undefined&&time-p.lastEmote<1500)return;
   p.lastEmote=time;broadcast(r,{type:'emote',from:p.id,id:m.id});return;
  }
  if(['item','mineHit','hit'].includes(m.type)){
   const actor=m.botId===undefined?p:r.players.find(q=>q.bot&&q.id===m.botId&&q.ownerId===p.id&&q.connected);
   if(!actor)return error(c,'NOT_HOST');
   if(r.phase!=='racing'||r.mode!=='items')return error(c,'BAD_PHASE');
   const entrant=r.round.get(actor.id);if(!entrant||entrant.finish||entrant.dnf)return;
   if(m.type==='item'){
    if(!m.itemId.startsWith(actor.id+'-'))return error(c,'BAD_MESSAGE');
    if(m.kind==='missile'&&m.target!==null){
     const target=r.players.find(q=>q.id===m.target),entrant=r.round.get(m.target);
     if(!target?.connected||!entrant||entrant.finish||entrant.dnf)return error(c,'BAD_MESSAGE');
    }
    const time=now();if(r.items.has(m.itemId)||time-(actor.lastItem??-Infinity)<500)return;
    actor.lastItem=time;const item={type:'item',kind:m.kind,itemId:m.itemId,x:m.x,z:m.z,...(m.kind==='mine'?{placedAt:m.placedAt,...(m.ox===undefined?{}:{ox:m.ox}),...(m.oz===undefined?{}:{oz:m.oz})}:{target:m.target,yaw:m.yaw,firedAt:m.firedAt}),from:actor.id};
    r.items.set(m.itemId,{item,gone:false,expires:m.kind==='mine'?time+30000:Math.max(time+1500,r.start.startAt+(m.firedAt+1.5)*1000)});broadcast(r,item);
   }else{
    const stored=r.items.get(m.itemId);if(!stored||stored.gone||(m.type==='mineHit'&&now()>=stored.expires))return;
    if(m.type==='hit'){
     if(stored.item.kind!=='missile'||stored.item.target!==actor.id||stored.invalid)return;
     stored.gone=true;stored.by=actor.id;stored.result={type:'hitAt',itemId:m.itemId,by:actor.id,shielded:m.shielded??!!actor.state?.shield};broadcast(r,stored.result);
    }else{
     if(stored.item.kind!=='mine')return;
     stored.gone=true;stored.by=actor.id;broadcast(r,{type:'mineGone',itemId:m.itemId,by:actor.id});
    }
   }
   return;
  }
  const isBot=m.type==='botState'||m.type==='botFinish',actor=isBot?r.players.find(q=>q.bot&&q.id===m.botId&&q.ownerId===p.id&&q.connected):p;
  if(isBot&&!actor)return error(c,'NOT_HOST');
  if(m.type==='state'||m.type==='botState'){
   if(r.phase!=='racing')return;
   const time=now();actor.rate=actor.rate.filter(t=>time-t<1000);if(actor.rate.length>=30)return;actor.rate.push(time);
   if(m.seq<=actor.lastSeq)return;actor.lastSeq=m.seq;
   const state=Object.fromEntries([...numeric,'drifting','boost','ghost','air','shield','trapped','spinning','finished'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]]));
   state.serverT=time;actor.state=state;broadcast(r,{type:'peer',id:actor.id,...state},p);return;
  }
  if(m.type==='finish'||m.type==='botFinish'){
   if(r.phase!=='racing')return error(c,'BAD_PHASE');
   const entrant=r.round.get(actor.id);if(entrant.finish||entrant.dnf)return;
   invalidateTarget(r,actor.id);entrant.finish={elapsed:m.elapsed,bestLap:m.bestLap,lapTimes:[...m.lapTimes]};if(r.deadline===null)r.deadline=now()+60000;complete(r);return;
  }
  error(c,'BAD_MESSAGE');
 }
 function disconnect(c){const p=clients.get(c);if(!p)return;clients.delete(c);p.connected=false;p.ready=false;p.expires=now()+GRACE;p.connection=null;const r=rooms.get(p.code);abandonBots(r,p.id);invalidateTarget(r,p.id);host(r);publish(r);complete(r);}
 return {receive,disconnect,tick};
}
