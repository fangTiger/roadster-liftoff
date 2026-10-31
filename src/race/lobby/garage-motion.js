/** 展示时钟不接入比赛模拟；准备只在 false → true 时触发一次。 */
export function readyEnvelope(age) {
 const headlights=age<.1||(age>=.2&&age<.3)?5:age<.4?.2:1.2;
 return {headlights,boost:age>=.55&&age<1.45};
}
/** 模型车头为 -Z；以镜头水平视线为基准，向左偏转四十度。 */
export function frontThreeQuarterYaw(x,z,camera) {
 return Math.PI+Math.atan2(camera.x-x,camera.z-z)-40*Math.PI/180;
}
/** 灯闪阶段保持前脸，随后露出车尾，最后回到同一展示角度。 */
export function readyTurn(age,reduced=false) {
 if(reduced||age<=.3||age>=2.2)return 0;
 const smooth=p=>p*p*(3-2*p);
 const p=age<.85?smooth((age-.3)/.55):age<1.35?1:1-smooth((age-1.35)/.85);
 return -1.8*p;
}
export function cameraProgress(age,duration,reduced) {
 const p=reduced?1:Math.min(1,Math.max(0,age/duration));
 return 1-(1-p)**3;
}

/** 每台车独立保存用户朝向；惯性按时间积分，恢复采用最短圆弧。 */
export function createCarRotation() {
 let yaw=0,velocity=0,dragging=false,active=false,lastX=0,lastMove=0,releasedAt=0,returnYaw=null;
 return {
  get yaw(){return yaw;},get velocity(){return velocity;},get active(){return active;},
  begin(x,now,currentYaw){yaw=currentYaw;velocity=0;lastX=x;lastMove=now;dragging=active=true;returnYaw=null;},
  move(x,now){
   if(!dragging)return;
   const delta=(x-lastX)*.012,elapsed=now-lastMove;
   yaw+=delta;velocity=elapsed>0?Math.max(-12,Math.min(12,delta/elapsed)):0;lastX=x;lastMove=now;
  },
  end(now,reduced=false){if(!dragging)return;dragging=false;releasedAt=now;if(reduced||now-lastMove>.12)velocity=0;},
  step(now,dt,displayYaw,reduced=false){
   if(!active)return yaw=displayYaw;
   if(dragging)return yaw;
   const idle=now-releasedAt;
   if(idle<3){
    if(reduced)velocity=0;
    const decay=Math.exp(-4*Math.max(0,Math.min(dt,idle)));
    yaw+=velocity*(1-decay)/4;velocity*=decay;return yaw;
   }
   velocity=0;returnYaw??=yaw;
   const progress=Math.min(1,(idle-3)/.8),ease=progress*progress*(3-2*progress);
   const arc=Math.atan2(Math.sin(displayYaw-returnYaw),Math.cos(displayYaw-returnYaw));
   yaw=returnYaw+arc*ease;
   if(progress===1){active=false;returnYaw=null;yaw=displayYaw;}
   return yaw;
  },
 };
}
