import T from './tuning.js';
import { THROTTLE,LEFT,RIGHT,DRIFT } from './input-bits.js';
export const EFFECT_KINDS=Object.freeze(['spin','trap','nitro','shield']);
// 队列按到达顺序消费，只修改目标车辆；参数为后续导弹效果保留。
export function applyEffects(car,queue) {
 const events=[];
 car.spinTime??=0;car.trapTime??=0;car.shieldTime??=0;
 for(const {kind} of queue){
  if((kind==='spin'||kind==='trap')&&car.shieldTime>0){car.shieldTime=0;events.push({type:'shieldBreak'});continue;}
  if(kind==='nitro')car.boostTime=Math.max(car.boostTime,T.nitroTime);
  if(kind==='shield')car.shieldTime=T.shieldTime;
  if(kind==='spin'){car.spinTime=T.spinTime;car.vx*=T.spinKeep;car.vz*=T.spinKeep;}
  if(kind==='trap'){car.trapTime=T.trapTime;car.vx=car.vz=0;}
  events.push({type:'effect',kind});
 }
 return events;
}
export function effectInput(car,bits) {
 if(car.trapTime>0)bits=0;
 else if(car.spinTime>0)bits&=~(THROTTLE|LEFT|RIGHT|DRIFT);
 if(car.trapTime>0||car.spinTime>0){
  // 不让受控前的漂移松开沿产生额外加速，清除残留转向和二次加速窗口。
  car.steer=0;car.yawKick=0;car.driftDir=0;car.drifting=false;car.driftTime=car.driftTier=car.driftBlend=car.driftSwitch=car.counterWindow=0;
 }
 return bits;
}
export function tickEffects(car,dt) {
 for(const key of ['spinTime','trapTime','shieldTime'])if(car[key]>0){const next=car[key]-dt;car[key]=next<1e-12?0:next;}
}

// 两圈视觉转动只用于渲染，不写回车辆物理朝向。
export const spinRotation=remaining=>remaining>0?(1-Math.min(1,remaining/T.spinTime))*Math.PI*4:0;
