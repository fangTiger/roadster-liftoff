import { sin,cos,wrapAngle } from './fmath.js';
import T from './tuning.js';
// 只修改自己的尾流与加速状态；无前车输入时保留单人车辆的字段形状。
export function updateDraft(car,others,dt) {
 const events=[];
 if(!others)return events;
 car.draft??=0;
 const sx=sin(car.yaw),sz=cos(car.yaw),length=Math.sqrt(sx*sx+sz*sz),fx=sx/length,fz=sz/length;
 const following=car.vx*car.vx+car.vz*car.vz>T.draftMinSpeed*T.draftMinSpeed&&others.some(other=>{
  const dx=other.x-car.x,dz=other.z-car.z,along=dx*fx+dz*fz,side=dx*fz-dz*fx;
  return along>=T.draftMin&&along<=T.draftRange&&Math.abs(side)<T.draftWidth&&Math.abs(wrapAngle(other.yaw-car.yaw))<Math.PI/6;
 });
 car.draft=Math.max(0,car.draft+(following?1:-2)*dt/T.draftCharge);
 // 固定步长累加的舍入误差不应使充满时刻推迟一帧。
 if(car.draft>=1-1e-12){car.draft=0;car.boostTime=Math.max(car.boostTime??0,T.draftBoost);events.push({type:'draft'});}
 return events;
}
