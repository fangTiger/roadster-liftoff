import { itemBoxes,rollItem,mineHits,mineAlive,mineThrowTarget,pickMissileTarget,itemTargetValid } from './sim/items.js';
import { botShouldUseItem,botItemDelay } from './bot-driver.js';
// 每台本地模拟的车独立持有一个槽和箱子刷新时间；远端只同步道具实体。
export function createRoomItems({track,send,random=Math.random,onEvent=()=>{}}) {
 const boxes=itemBoxes(track),actors=new Map(),mines=new Map(),missiles=new Map(),removed=new Set(),hits=new Set();
 const slot=id=>{if(!actors.has(id))actors.set(id,{kind:null,readyAt:0,pickedAt:0,useAt:null,shieldQueued:false,hidden:new Map(),sequence:0});return actors.get(id);};
 const visible=(id,boxId,time)=>time>=(slot(id).hidden.get(boxId)??-Infinity);
 const allowed=a=>!a.race.frozen&&!a.race.finished&&!(a.car.trapTime>0);
 function receive(item){
  const entities=item.kind==='missile'?missiles:mines;
  if(!entities.has(item.itemId)&&!removed.has(item.itemId)){entities.set(item.itemId,{...item});if(item.kind==='missile')onEvent({type:'missileFired',missile:item});}
 }
 const invalidate=id=>{for(const m of missiles.values())if(m.target===id)m.invalid=true;};
 const locked=id=>[...missiles.values()].some(m=>m.target===id&&!m.invalid&&!m.claimed);
 function tick(time,cars){
  for(const [id,m] of missiles){
   if(m.target&&!itemTargetValid(cars.find(c=>c.id===m.target)))m.invalid=true;
   if(time+1e-12>=m.firedAt+1.5){missiles.delete(id);removed.add(id);}
  }
 }
 function hit({itemId,by,shielded}){
  if(hits.has(itemId))return;hits.add(itemId);missiles.delete(itemId);removed.add(itemId);onEvent({type:'missileBurst',itemId,by,shielded});
 }
 function gone({itemId,by}){const mine=mines.get(itemId);if(mine)onEvent({type:'mineBurst',mine,by});mines.delete(itemId);removed.add(itemId);}
 function use(actor){
  const s=slot(actor.id);if(!allowed(actor)||!s.kind||actor.time+1e-12<s.readyAt)return false;
  const kind=s.kind;s.kind=null;s.useAt=null;
  if(kind==='mine'){
   const self={...actor.car,id:actor.id,lap:actor.race.lap,s:actor.car.near?.s??0},target=pickMissileTarget(self,actor.cars??[],track.length);
   const back=actor.bot?!target&&actor.time-s.pickedAt<=6:actor.back;
   const position=back?{x:actor.car.x-Math.sin(actor.car.yaw)*3,z:actor.car.z-Math.cos(actor.car.yaw)*3}:{...mineThrowTarget(self,target,track),ox:actor.car.x,oz:actor.car.z};
   const mine={type:'item',kind,itemId:`${actor.id}-${++s.sequence}`,...position,placedAt:actor.time};
   // 等服务端接受后再由 item 回显创建实体，限流丢弃不会留本地幽灵雷。
   send({...mine,...(actor.bot?{botId:actor.id}:{})});onEvent({type:'minePlaced',id:actor.id,mine});
  }else if(kind==='missile'){
   const target=pickMissileTarget({id:actor.id,lap:actor.race.lap,s:actor.car.near?.s??0},actor.cars??[],track.length);
   send({type:'item',kind,itemId:`${actor.id}-${++s.sequence}`,target:target?.id??null,x:actor.car.x,z:actor.car.z,yaw:actor.car.yaw,firedAt:actor.time,...(actor.bot?{botId:actor.id}:{})});
  }else{actor.applyEffect(kind);if(kind==='shield')s.shieldQueued=true;}
  onEvent({type:'itemUsed',id:actor.id,kind});return true;
 }
 function step(actor){
  const s=slot(actor.id);let shield=actor.car.shieldTime>0||s.shieldQueued;s.shieldQueued=false;
  for(const [id,mine] of mines)if(!mineAlive(mine,actor.time)){mines.delete(id);removed.add(id);}
  // 命中先于拾取和机器人决策，离地、禁锢都不能躲过锁定导弹。
  for(const m of missiles.values())if(m.target===actor.id&&!m.invalid&&!m.claimed&&actor.time+1e-12>=m.firedAt+1.5){
   const target=actor.cars?.find(c=>c.id===actor.id);
   if(actor.race.finished||actor.race.frozen||actor.ghost||(actor.cars&&!itemTargetValid(target))){m.invalid=true;continue;}
   actor.applyEffect('spin');m.claimed=true;send({type:'hit',itemId:m.itemId,shielded:shield,...(actor.bot?{botId:actor.id}:{})});shield=false;
  }
  if(!allowed(actor))return;
  if(actor.car.grounded){
   for(const box of boxes){
    if(!visible(actor.id,box.id,actor.time)||(actor.car.x-box.x)**2+(actor.car.z-box.z)**2>1.8**2)continue;
    s.hidden.set(box.id,actor.time+4);onEvent({type:'pickup',id:actor.id});
    if(!s.kind){s.kind=rollItem(actor.rankFraction,random);s.readyAt=actor.time+(actor.bot?0:1);s.pickedAt=actor.time;s.useAt=null;onEvent({type:'roulette',id:actor.id});}
   }
   for(const [itemId,mine] of mines)if(mineHits(mine,actor.car,actor.id,actor.time)){
    actor.applyEffect('trap');mines.delete(itemId);removed.add(itemId);onEvent({type:'mineBurst',mine,by:actor.id});send({type:'mineHit',itemId,...(actor.bot?{botId:actor.id}:{})});
   }
  }
  if(actor.bot){
   const should=s.kind&&botShouldUseItem(s.kind,actor,actor.cars??[],track,actor.time-s.pickedAt,locked(actor.id));
   if(!should)s.useAt=null;
   else{if(s.useAt===null)s.useAt=actor.time+botItemDelay(actor.difficulty,random);if(actor.time+1e-12>=s.useAt)use(actor);}
  }
 }
 return {boxes,mines,missiles,slot,visible,use,step,tick,locked,invalidate,receive,gone,hit,dispose(){actors.clear();mines.clear();missiles.clear();removed.clear();hits.clear();}};
}
