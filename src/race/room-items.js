import { itemBoxes,rollItem,mineHits,mineAlive } from './sim/items.js';
// 每台本地模拟的车独立持有一个槽和箱子刷新时间；远端只同步水雷实体。
export function createRoomItems({track,send,random=Math.random,onEvent=()=>{}}) {
 const boxes=itemBoxes(track),actors=new Map(),mines=new Map(),removed=new Set();
 const slot=id=>{if(!actors.has(id))actors.set(id,{kind:null,readyAt:0,hidden:new Map(),sequence:0});return actors.get(id);};
 const visible=(id,boxId,time)=>time>=(slot(id).hidden.get(boxId)??-Infinity);
 const allowed=a=>!a.race.frozen&&!a.race.finished&&!(a.car.trapTime>0);
 function receive(mine){if(mine.kind==='mine'&&!mines.has(mine.itemId)&&!removed.has(mine.itemId))mines.set(mine.itemId,{...mine});}
 function gone({itemId,by}){const mine=mines.get(itemId);if(mine)onEvent({type:'mineBurst',mine,by});mines.delete(itemId);removed.add(itemId);}
 function use(actor){
  const s=slot(actor.id);if(!allowed(actor)||!s.kind||actor.time+1e-12<s.readyAt||s.kind==='missile')return false;
  const kind=s.kind;s.kind=null;
  if(kind==='mine'){
   const mine={type:'item',kind,itemId:`${actor.id}-${++s.sequence}`,x:actor.car.x-Math.sin(actor.car.yaw)*3,z:actor.car.z-Math.cos(actor.car.yaw)*3,placedAt:actor.time};
   // 等服务端接受后再由 item 回显创建实体，限流丢弃不会留本地幽灵雷。
   send({...mine,...(actor.bot?{botId:actor.id}:{})});onEvent({type:'minePlaced',id:actor.id,mine});
  }else actor.applyEffect(kind);
  onEvent({type:'itemUsed',id:actor.id,kind});return true;
 }
 function step(actor){
  const s=slot(actor.id);
  for(const [id,mine] of mines)if(!mineAlive(mine,actor.time)){mines.delete(id);removed.add(id);}
  if(!allowed(actor)||!actor.car.grounded)return;
  for(const box of boxes){
   if(!visible(actor.id,box.id,actor.time)||(actor.car.x-box.x)**2+(actor.car.z-box.z)**2>1.8**2)continue;
   s.hidden.set(box.id,actor.time+4);onEvent({type:'pickup',id:actor.id});
   if(!s.kind){s.kind=rollItem(actor.rankFraction,random);s.readyAt=actor.time+(actor.bot?0:1);onEvent({type:'roulette',id:actor.id});}
  }
  for(const [itemId,mine] of mines)if(mineHits(mine,actor.car,actor.id,actor.time)){
   actor.applyEffect('trap');mines.delete(itemId);removed.add(itemId);onEvent({type:'mineBurst',mine,by:actor.id});send({type:'mineHit',itemId,...(actor.bot?{botId:actor.id}:{})});
  }
  if(actor.bot)use(actor);
 }
 return {boxes,mines,slot,visible,use,step,receive,gone,dispose(){actors.clear();mines.clear();removed.clear();}};
}
