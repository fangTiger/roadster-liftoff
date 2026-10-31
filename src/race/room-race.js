import { createRoomClient } from '../net/room-client.js';
import { pushState,sampleState } from '../net/interp.js';
import { createRoomItems } from './room-items.js';
import { createItemFx } from './scene/items.js';
import { mountRoomUI,standings } from './room-ui.js';
import { createRemoteCar,ROOM_COLORS } from './remote-car.js';
import { createEmote } from './emote.js';
import { gridSpawn,targetSteps } from './grid.js';
import { TRACKS } from './track/data/index.js';
import { autopilot } from './sim/autopilot.js';
import { createRoomBots,carState } from './room-bots.js';
import { DT } from './sim/physics.js';
import { BRAKE } from './sim/input-bits.js';
// 房主与所属机器人同步推进；网络远端只用于渲染和本地软碰撞。
export function mountRoomRace({engine,params,setup,clear,simulate,render,getState,getTrack,getBits,getGhost=()=>false,isPaused=()=>false,client=createRoomClient(),ui,createRemote=createRemoteCar,requestFrame=globalThis.requestAnimationFrame,selfRoot,inputTarget=globalThis,applyEffect=()=>{},random=Math.random,playSound=()=>{},setMusicPhase=()=>{},createItemsFx=createItemFx}) {
 const buffers=new Map(),remotes=new Map(),emotes=new Map(),departed=new Set();let bots=new Map(),round=null,active=false,loading=false,dead=false,version=0,sequence=0,lastSend=-Infinity,lastFinish=-Infinity,lastRanks=-Infinity,lastFrame,queue=Promise.resolve(),players=[],items=null,itemFx=null,pendingItems=[],lastTick=-1,lastWarning=-Infinity,rivals=[];
 function invalidateTarget(id){items?.invalidate(id);for(const m of pendingItems)if(m.kind==='missile'&&m.target===id)m.invalid=true;}
 function clearItems(){items?.dispose();items=null;itemFx?.dispose();itemFx=null;pendingItems=[];lastWarning=-Infinity;}
 function clearEmotes(){for(const emote of emotes.values())emote.dispose();emotes.clear();}
 function removeRemotes(){clearItems();bots.clear();clearEmotes();for(const remote of remotes.values())remote.dispose();remotes.clear();buffers.clear();rivals=[];}
 function reset(){active=false;round=null;++version;removeRemotes();if(!loading)clear();}
 ui??=mountRoomUI({client,roomCode:params.get('room')||'',onReturn:reset,playSound,setMusicPhase});
 const unsubs=[
  client.on('peer',message=>{if(round&&round.grid.some(p=>p.id===message.id))buffers.set(message.id,pushState(buffers.get(message.id)||[],{...message,simT:round.startAt+message.step*DT*1000}));}),
  client.on('connection',({connected})=>{if(!connected)for(const id of [client.id,...players.filter(p=>p.bot&&p.ownerId===client.id).map(p=>p.id)])invalidateTarget(id);}),
  client.on('room',room=>{for(const p of room.players)if(p.connected===false)invalidateTarget(p.id);players=players.map(p=>({...p,...room.players.find(q=>q.id===p.id)}));for(const [id] of bots){const player=room.players.find(p=>p.id===id);if(room.hostId!==client.id||!player?.connected||player.ownerId!==client.id)bots.delete(id);}}),
  client.on('left',({id})=>{invalidateTarget(id);bots.delete(id);emotes.get(id)?.dispose();emotes.delete(id);departed.add(id);remotes.get(id)?.dispose();remotes.delete(id);buffers.delete(id);}),
  client.on('results',()=>{clearItems();active=false;++version;clearEmotes();}),
  client.on('item',m=>{if(round?.mode!=='items')return;if(items)items.receive(m);else pendingItems.push(m);}),
  client.on('hitAt',m=>{if(round?.mode!=='items')return;if(items)items.hit(m);else pendingItems.push(m);}),
  client.on('mineGone',m=>{if(round?.mode!=='items')return;if(items)items.gone(m);else pendingItems.push(m);}),
  client.on('emote',({from,id})=>{
   if(!active||ui.view==='results'||!round.grid.some(p=>p.id===from)||!Number.isInteger(id)||id<1||id>6)return;
   const root=from===client.id?selfRoot:remotes.get(from)?.root;if(!root)return;
   if(!emotes.has(from))emotes.set(from,createEmote(root));emotes.get(from).show(id);
  }),
  client.on('start',message=>{
   if(round?.startAt===message.startAt)return queue;
   const generation=++version;active=false;round=message;sequence=0;lastSend=lastFinish=lastRanks=-Infinity;lastTick=-1;lastWarning=-Infinity;removeRemotes();departed.clear();
   players=message.grid.map(p=>({...ui.room?.players.find(q=>q.id===p.id),...p}));
   queue=queue.then(async()=>{
    if(generation!==version||dead)return;
    loading=true;clear();
    try{
     const self=message.grid.find(p=>p.id===client.id);if(!self)throw new Error('房间中没有自己的座位');
     const contactsFor=(contactId,step)=>{
      if(generation!==version||dead)return [];
      const time=message.startAt+step*DT*1000,now=client.serverNow(),others=[];
      for(const [id,buffer] of buffers){
       if(id===contactId||id===client.id||bots.has(id)||buffer.at(-1)?.ghost||buffer.at(-1)?.air)continue;
       const state=sampleState(buffer,now,time);
       if(state&&!state.stale&&!state.ghost&&!state.air)others.push({...state,id});
      }
      if(contactId!==client.id){const self=getState();if(!getGhost()&&self.car.grounded)others.push({id:client.id,...carState(self.car,self.race)});}
      for(const [id,bot] of bots)if(id!==contactId&&!bot.session.ghost&&bot.session.car.grounded)others.push({id,...carState(bot.session.car,bot.session.race)});
      return others;
     };
     await setup(TRACKS.find(t=>t.def.id===message.trackId).difficulty,{seat:self.seat,laps:message.laps,contacts:step=>contactsFor(client.id,step),contactId:client.id,mode:message.mode});
     if(generation!==version||dead){clear();return;}
     // 加载期间可能已断线并恢复，必须以最新座位状态判断机器人是否仍有效。
     if(ui.room?.hostId===client.id)bots=createRoomBots({players:ui.room.players.filter(p=>message.grid.some(q=>q.id===p.id)),ownerId:client.id,track:getTrack(),laps:message.laps,contacts:contactsFor,traffic:contactsFor});
     await Promise.all(players.filter(p=>p.id!==client.id&&!departed.has(p.id)).map(async player=>{
      const remote=await createRemote(player);
      if(generation!==version||dead||departed.has(player.id)){remote.dispose();return;}
      engine.scene.add(remote.root);remotes.set(player.id,remote);
      if(!buffers.has(player.id)){const p=gridSpawn(getTrack(),player.seat);buffers.set(player.id,[{...p,seq:-1,step:0,simT:message.startAt,serverT:message.startAt,vx:0,vz:0,pitch:0,steer:0,drifting:false,boost:false,ghost:false,air:false,lap:1}]);}
     }));
     if(generation!==version||dead){removeRemotes();clear();return;}
     if(message.mode==='items'){
      items=createRoomItems({track:getTrack(),send:m=>client.send(m),random,onEvent:event=>{
       if(event.type==='missileFired'){
        playSound('raceMissile');if(event.missile.target===client.id&&!event.missile.invalid){playSound('raceMissileWarning');lastWarning=getState().step*DT;}
       }
       if(event.type==='missileBurst'){
        const state=raceStates(true).get(event.by);if(state)itemFx?.explode(state,getState().step*DT,event.shielded);
        if(!event.shielded||event.by!==client.id)playSound(event.shielded?'raceShieldBreak':'raceExplosion');
       }
       if(event.type==='pickup'&&event.id===client.id)playSound('racePickup');
       if(event.type==='minePlaced')playSound('raceMine');
       if(event.type==='itemUsed'&&event.id!==client.id&&['nitro','shield'].includes(event.kind))playSound(event.kind==='nitro'?'raceNitro':'raceShield');
       if(event.type==='mineBurst'){
        itemFx?.burst(event.mine,getState().step*DT);
        if(event.by!==client.id){const bot=bots.get(event.by),shield=bot?bot.session.car.shieldTime>0:sampleState(buffers.get(event.by)||[],client.serverNow())?.shield;playSound(shield?'raceShieldBreak':'raceBubble');}
       }
      }});
      itemFx=createItemsFx(engine.scene,items,getTrack());
      for(const m of pendingItems)m.type==='mineGone'?items.gone(m):m.type==='hitAt'?items.hit(m):items.receive(m);pendingItems=[];
     }
     render?.(1,0);active=true;ui.racing();
    }catch(error){console.error('房间赛道加载失败',error);if(generation===version){active=false;++version;removeRemotes();clear();ui.fail();}}
    finally{loading=false;}
   });return queue;
  }),
 ];
 function keydown(event){
  const target=event.target;
  if(!active||loading||ui.view!=='racing'||isPaused()||getState().race.frozen||event.repeat||target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName)||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  if(event.code==='KeyE'&&items){event.preventDefault();items.use(localActor(client.id));}
  if(/^Digit[1-6]$/.test(event.code)){event.preventDefault();client.send({type:'emote',id:Number(event.code.slice(-1))});}
 }
 inputTarget.addEventListener?.('keydown',keydown);
 function localActor(id){
  const bot=bots.get(id),snap=bot?{car:bot.session.car,race:bot.session.race,step:bot.step}:getState();
  return {id,...snap,time:snap.step*DT,bot:!!bot,back:!bot&&!!(getBits()&BRAKE),difficulty:players.find(p=>p.id===id)?.difficulty,ghost:bot?bot.session.ghost:getGhost(),cars:[...raceStates().values()],rankFraction:0,applyEffect:bot?kind=>bot.session.applyEffect(kind):applyEffect};
 }
 function raceStates(display=false){
  const states=new Map(),now=client.serverNow();
  for(const player of players){
   if(departed.has(player.id))continue;
   const bot=bots.get(player.id),local=player.id===client.id?getState():bot?{car:bot.session.car,race:bot.session.race}:null;
   const state=local?carState(local.car,local.race,bot?bot.session.ghost:getGhost()):sampleState(buffers.get(player.id)||[],now,display?undefined:round.startAt+getState().step*DT*1000);
   if(state)states.set(player.id,{...state,id:player.id,connected:player.connected!==false});
  }
  return states;
 }
 function stepItems(){
  if(!items)return;
  const states=raceStates();
  const ranked=standings(players,states,getTrack().length);
  for(const id of [client.id,...bots.keys()]){const actor=localActor(id);actor.rank=ranked.findIndex(p=>p.id===id)+1;actor.count=players.length;actor.rankFraction=players.length>1?(actor.rank-1)/(players.length-1):0;items.step(actor);}
  items.tick(getState().step*DT,[...states.values()]);
  const slot=items.slot(client.id),time=getState().step*DT,tick=Math.floor(time*10);
  if(slot.kind&&time<slot.readyAt&&tick!==lastTick){lastTick=tick;playSound('raceRoulette');}
 }
 function frame(time){
  if(dead)return;
  const elapsed=lastFrame===undefined?0:Math.max(0,(time-lastFrame)/1000),dt=Math.min(.1,elapsed);lastFrame=time;
  // 表情按实际显示时间过期，低帧率或后台恢复时也不会延长到两秒以上。
  for(const emote of emotes.values())emote.update(elapsed);
  if(active&&!loading&&ui.view!=='results'){
   const now=client.serverNow(),target=targetSteps(now,round.startAt,getState().step),track=getTrack();
   while(getState().step<target){const snap=getState(),bits=isPaused()?0:params.has('autopilot')&&!snap.race.finished?autopilot(snap,track):getBits();simulate(bits);for(const bot of bots.values()){bot.session.step(bot.driver({race:bot.session.race,car:bot.session.car},track));bot.step++;}stepItems();}
   const snap=getState(),c=snap.car,r=snap.race;
   if(now>=round.startAt&&now-lastSend>=1000/15){
    lastSend=now;client.send({type:'state',seq:sequence++,step:snap.step,x:c.x,y:c.y,z:c.z,yaw:c.yaw,pitch:c.pitch,vx:c.vx,vz:c.vz,steer:c.steer,drifting:!!c.drifting,boost:c.boostTime>0,ghost:!!getGhost(),spinning:c.spinTime>0,finished:r.finished,shield:c.shieldTime>0,trapped:c.trapTime>0,air:!c.grounded,lap:r.lap,s:c.near.s});
   }
   // 完赛消息可重复接收：重连或短暂发送失败后，每秒补发直到收到统一结算。
   if(r.finished&&now-lastFinish>=1000){lastFinish=now;client.send({type:'finish',elapsed:r.elapsed,bestLap:r.bestLap,lapTimes:r.lapTimes});}
   for(const [id,bot] of bots){
    const race=bot.session.race;
    if(now>=round.startAt&&now-bot.lastSend>=1000/15){bot.lastSend=now;client.send({type:'botState',botId:id,seq:bot.sequence++,step:bot.step,...carState(bot.session.car,race,bot.session.ghost)});}
    if(race.finished&&now-bot.lastFinish>=1000){bot.lastFinish=now;client.send({type:'botFinish',botId:id,elapsed:race.elapsed,bestLap:race.bestLap,lapTimes:race.lapTimes});}
   }
   const states=new Map([[client.id,carState(c,r,getGhost())]]);
   for(const [id,remote] of remotes){const bot=bots.get(id),state=bot?carState(bot.session.car,bot.session.race,bot.session.ghost):sampleState(buffers.get(id)||[],now);remote.update(state,dt);if(state)states.set(id,state);}
   rivals=players.filter(p=>p.id!==client.id&&!departed.has(p.id)&&states.has(p.id)).map(p=>{const c=states.get(p.id);return {x:c.x,z:c.z,color:p.color??ROOM_COLORS[p.seat]};});
   if(now-lastRanks>=100){lastRanks=now;const connected=new Map((ui.room?.players||[]).map(p=>[p.id,p.connected]));ui.update(players.map(p=>({...p,connected:connected.get(p.id)??false})),states,track.length);}
   if(items?.locked(client.id)&&snap.step*DT-lastWarning>=.45){playSound('raceMissileWarning');lastWarning=snap.step*DT;}
   itemFx?.update(client.id,snap.step*DT,states,{self:{id:client.id,lap:r.lap,s:c.near.s},back:!!(getBits()&BRAKE),cars:[...raceStates().values()]});
   render(1,dt);
  }else if(ui.view!=='lobby'||!ui.room) engine.render();
  requestFrame(frame);
 }
 requestFrame(frame);
 return {client,ui,frame,get rivals(){return rivals;},get missileLocked(){return items?.locked(client.id)??false;},get itemSlot(){return items?.slot(client.id)??null;},destroy(){dead=true;inputTarget.removeEventListener?.('keydown',keydown);reset();unsubs.forEach(fn=>fn());client.leave();ui.destroy();}};
}
