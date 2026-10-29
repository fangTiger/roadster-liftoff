import { createRoomClient } from '../net/room-client.js';
import { pushState,sampleState } from '../net/interp.js';
import { mountRoomUI } from './room-ui.js';
import { createRemoteCar } from './remote-car.js';
import { gridSpawn,targetSteps } from './grid.js';
import { TRACKS } from './track/data/index.js';
import { autopilot } from './sim/autopilot.js';
import { DT } from './sim/physics.js';
// 房间循环只推进自己的 session；远端状态只用于渲染和自己的软碰撞。
export function mountRoomRace({engine,params,setup,clear,simulate,render,getState,getTrack,getBits,getGhost=()=>false,isPaused=()=>false,client=createRoomClient(),ui,createRemote=createRemoteCar,requestFrame=globalThis.requestAnimationFrame}) {
 const buffers=new Map(),remotes=new Map(),departed=new Set();let round=null,active=false,loading=false,dead=false,version=0,sequence=0,lastSend=-Infinity,lastFinish=-Infinity,lastRanks=-Infinity,lastFrame,queue=Promise.resolve(),players=[];
 function removeRemotes(){for(const remote of remotes.values())remote.dispose();remotes.clear();buffers.clear();}
 function reset(){active=false;round=null;++version;removeRemotes();if(!loading)clear();}
 ui??=mountRoomUI({client,roomCode:params.get('room')||'',onReturn:reset});
 const unsubs=[
  client.on('peer',message=>{if(round&&round.grid.some(p=>p.id===message.id))buffers.set(message.id,pushState(buffers.get(message.id)||[],{...message,simT:round.startAt+message.step*DT*1000}));}),
  client.on('left',({id})=>{departed.add(id);remotes.get(id)?.dispose();remotes.delete(id);buffers.delete(id);}),
  client.on('results',()=>{active=false;++version;}),
  client.on('start',message=>{
   if(round?.startAt===message.startAt)return queue;
   const generation=++version;active=false;round=message;sequence=0;lastSend=lastFinish=lastRanks=-Infinity;removeRemotes();departed.clear();
   players=message.grid.map(p=>({...ui.room?.players.find(q=>q.id===p.id),...p}));
   queue=queue.then(async()=>{
    if(generation!==version||dead)return;
    loading=true;clear();
    try{
     const self=message.grid.find(p=>p.id===client.id);if(!self)throw new Error('房间中没有自己的座位');
     const contacts=step=>{
      if(generation!==version||dead)return [];
      const time=message.startAt+step*DT*1000,now=client.serverNow(),others=[];
      for(const [id,buffer] of buffers){
       if(id===client.id||buffer.at(-1)?.ghost||buffer.at(-1)?.air)continue;
       const state=sampleState(buffer,now,time);
       if(state&&!state.stale&&!state.ghost&&!state.air)others.push({...state,id});
      }
      return others;
     };
     await setup(TRACKS.find(t=>t.def.id===message.trackId).difficulty,{seat:self.seat,laps:message.laps,contacts,contactId:client.id});
     if(generation!==version||dead){clear();return;}
     await Promise.all(players.filter(p=>p.id!==client.id&&!departed.has(p.id)).map(async player=>{
      const remote=await createRemote(player);
      if(generation!==version||dead||departed.has(player.id)){remote.dispose();return;}
      engine.scene.add(remote.root);remotes.set(player.id,remote);
      if(!buffers.has(player.id)){const p=gridSpawn(getTrack(),player.seat);buffers.set(player.id,[{...p,seq:-1,step:0,simT:message.startAt,serverT:message.startAt,vx:0,vz:0,pitch:0,steer:0,drifting:false,boost:false,ghost:false,air:false,lap:1}]);}
     }));
     if(generation!==version||dead){removeRemotes();clear();return;}
     active=true;ui.racing();
    }catch(error){console.error('房间赛道加载失败',error);if(generation===version){active=false;++version;removeRemotes();clear();ui.fail();}}
    finally{loading=false;}
   });return queue;
  }),
 ];
 function frame(time){
  if(dead)return;
  const dt=lastFrame===undefined?0:Math.min(.1,Math.max(0,(time-lastFrame)/1000));lastFrame=time;
  if(active&&!loading&&ui.view!=='results'){
   const now=client.serverNow(),target=targetSteps(now,round.startAt,getState().step),track=getTrack();
   while(getState().step<target){const snap=getState(),bits=isPaused()?0:params.has('autopilot')&&!snap.race.finished?autopilot(snap,track):getBits();simulate(bits);}
   const snap=getState(),c=snap.car,r=snap.race;
   if(now>=round.startAt&&now-lastSend>=1000/15){
    lastSend=now;client.send({type:'state',seq:sequence++,step:snap.step,x:c.x,y:c.y,z:c.z,yaw:c.yaw,pitch:c.pitch,vx:c.vx,vz:c.vz,steer:c.steer,drifting:!!c.drifting,boost:c.boostTime>0,ghost:!!getGhost(),air:!c.grounded,lap:r.lap,s:c.near.s});
   }
   // 完赛消息可重复接收：重连或短暂发送失败后，每秒补发直到收到统一结算。
   if(r.finished&&now-lastFinish>=1000){lastFinish=now;client.send({type:'finish',elapsed:r.elapsed,bestLap:r.bestLap,lapTimes:r.lapTimes});}
   const states=new Map([[client.id,{lap:r.lap,s:c.near.s}]]);
   for(const [id,remote] of remotes){const state=sampleState(buffers.get(id)||[],now);remote.update(state,dt);if(state)states.set(id,state);}
   if(now-lastRanks>=100){lastRanks=now;const connected=new Map((ui.room?.players||[]).map(p=>[p.id,p.connected]));ui.update(players.map(p=>({...p,connected:connected.get(p.id)??false})),states,track.length);}
   render(1,dt);
  }else engine.render();
  requestFrame(frame);
 }
 requestFrame(frame);
 return {client,ui,frame,destroy(){dead=true;reset();unsubs.forEach(fn=>fn());client.leave();ui.destroy();}};
}
