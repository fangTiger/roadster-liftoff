import { closest } from './physics.js';
import { sin,cos } from './fmath.js';
import T from './tuning.js';
// 与 stepCar 一样只修改自己的车；不读取时间、随机数或外部状态，不改动其他车。
// 法向只消除「相对」接近速度的一半（对方电脑处理另一半），同向跟车不会被刹停；
// 掉速按一次接触结算：同一辆车持续贴身期间不重复扣速，避免网络延迟导致被撞方连续受罚。
export function resolveContacts(car,others,{id=car.id,step=0,contactLoss=T.contactLoss,rearEndLoss=T.rearEndLoss,contactPushMax=T.contactPushMax}={}) {
 const events=[],h=(T.length-T.width)/2,speed2=car.vx*car.vx+car.vz*car.vz,cooldown=Math.round(T.contactCooldown/T.dt);
 let budget=contactPushMax;
 // 固定处理次序，网络消息到达顺序不影响接触结果。
 for(const other of [...others].sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0)){
  const fx=sin(car.yaw),fz=cos(car.yaw),ox=sin(other.yaw),oz=cos(other.yaw);
  const q=closest({x:car.x-fx*h,z:car.z-fz*h},{x:car.x+fx*h,z:car.z+fz*h},{x:other.x-ox*h,z:other.z-oz*h},{x:other.x+ox*h,z:other.z+oz*h});
  let dx=q.x-q.px,dz=q.z-q.pz,d=Math.sqrt(dx*dx+dz*dz);
  if(d>=T.width)continue;
  const penetration=T.width-d,rear=(car.x-other.x)*ox+(car.z-other.z)*oz<0&&car.vx*ox+car.vz*oz>other.vx*ox+other.vz*oz;
  // 中心线相交时先用车心连线；完全重合时反向于相对速度，静止则按玩家身份反向分开。
  if(d<1e-9){dx=car.x-other.x;dz=car.z-other.z;d=Math.sqrt(dx*dx+dz*dz);}
  if(d<1e-9){dx=other.vx-car.vx;dz=other.vz-car.vz;d=Math.sqrt(dx*dx+dz*dz);}
  if(d<1e-9){dx=id!==undefined&&other.id!==undefined?(String(id)<String(other.id)?-1:1):fz;dz=id!==undefined&&other.id!==undefined?0:-fx;d=Math.sqrt(dx*dx+dz*dz);}
  const nx=dx/d,nz=dz/d,push=Math.min(penetration/2,budget);
  car.x+=nx*push;car.z+=nz*push;budget-=push;
  // rel < 0 表示两车在法向上互相接近；closing 为接近速度
  const rel=(car.vx-other.vx)*nx+(car.vz-other.vz)*nz,closing=Math.max(0,-rel);
  if(rel<0){car.vx-=rel/2*nx;car.vz-=rel/2*nz;}
  const key=String(other.id),seen=car.contactAt?.[key],fresh=seen===undefined||step-seen>cooldown;
  (car.contactAt??={})[key]=step;
  if(fresh&&closing>1){
   const k=Math.min(1,closing/Math.max(1,Math.sqrt(speed2))),keep=1-k*(contactLoss+(rear?rearEndLoss:0));
   car.vx*=keep;car.vz*=keep;events.push({type:'contact',impact:closing,rear});
  }
 }
 // 碰撞永远不让车变快：被追尾的车不会被顶着加速
 const after=car.vx*car.vx+car.vz*car.vz;
 if(after>speed2){const scale=Math.sqrt(speed2/after);car.vx*=scale;car.vz*=scale;}
 return events;
}
