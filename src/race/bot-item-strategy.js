import { pickMissileTarget } from './sim/items.js';
import { ROAD } from './track/build.js';

// 曲率只取主线切线并按赛道缓存，避免每辆车每个物理步重复构建几何。
const profiles=new WeakMap();
function curvature(track,s){
 let profile=profiles.get(track);
 if(!profile){
  const count=Math.ceil(track.length/4),spacing=track.length/count,values=new Float32Array(count);
  for(let i=0;i<count;i++){const a=track.at(i*spacing-4),b=track.at(i*spacing+4);values[i]=Math.abs(a.tx*b.tz-a.tz*b.tx)/8;}
  profile={spacing,values};profiles.set(track,profile);
 }
 const index=Math.round(s/profile.spacing),count=profile.values.length;
 return profile.values[((index%count)+count)%count];
}
const onMain=actor=>!actor.car.near?.path||actor.car.near.path==='main';
function stable(car){
 const speed=Math.hypot(car.vx??0,car.vz??0),side=Math.abs((car.vx??0)*Math.cos(car.yaw)-(car.vz??0)*Math.sin(car.yaw));
 return car.grounded!==false&&!car.drifting&&!(car.spinTime>0)&&Math.abs(car.steer??0)<.3&&side<=Math.max(2.5,speed*.1);
}

/** 只返回前方弯心前的主线路面；不跟随前车，也不将水雷扔到断口或支线。 */
export function smartBotMineTarget(actor,track){
 if(!onMain(actor)||actor.car.grounded===false)return null;
 const s=actor.car.near?.s??0;let peak=0,distance=0;
 for(let d=0;d<=100;d+=4){const value=curvature(track,s+d);if(value>peak){peak=value;distance=d;}}
 if(peak<.003||distance<16||distance>76)return null;
 // 位置固定在弯心前八米，不追踪前车到弯道之外。
 const point=track.at(s+distance-8);
 return track.surfaceAt(point.x,point.z)===ROAD?{x:point.x,z:point.z}:null;
}

/** 高档仅在有利驾驶条件成立时启动反应计时，连续稳定窗口由道具槽维护。 */
export function smartBotShouldUseItem(kind,actor,cars,track,held,locked){
 if(kind==='shield')return !!locked;
 if(kind==='mine')return !!smartBotMineTarget(actor,track);
 if(!stable(actor.car))return false;
 const s=actor.car.near?.s??0;
 if(kind==='missile'){
  const target=pickMissileTarget({id:actor.id,lap:actor.race.lap,s},cars,track.length);
  if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.z))return false;
  const dx=target.x-actor.car.x,dz=target.z-actor.car.z,distance=Math.hypot(dx,dz);
  return distance>1&&(dx*Math.sin(actor.car.yaw)+dz*Math.cos(actor.car.yaw))/distance>=.985;
 }
 if(kind==='nitro'){
  if(!onMain(actor))return false;
  const point=track.at(s),alignment=point.tx*Math.sin(actor.car.yaw)+point.tz*Math.cos(actor.car.yaw);
  if(alignment<.985)return false;
  for(let d=0;d<=120;d+=4)if(curvature(track,s+d)>.002)return false;
  return true;
 }
 return false;
}
