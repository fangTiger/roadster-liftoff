import { sin, cos, clamp, smoothstep, wrapAngle } from './fmath.js';
import { THROTTLE,BRAKE,LEFT,RIGHT,JET,ROLL,DRIFT } from './input-bits.js';
import T from './tuning.js';
import { SAND,GRAVEL,ROCK,GAP } from '../track/build.js';
export const SIM_VERSION=1, DT=T.dt;
export function createCarState(pose={}) {
 return {x:pose.x||0,y:pose.y||0,z:pose.z||0,yaw:pose.yaw||0,vx:0,vy:0,vz:0,steer:0,yawKick:0,
 grounded:true,fuel:T.fuelMax,roll:0,rollTime:0,rollDirection:1,boostTime:0,driftTime:0,driftTier:0,drifting:false,
 previousBits:0,lap:1,picked:{},cones:{},boostInside:{},rockHits:{},slotEntry:{},surface:0,near:pose.s===undefined?null:{path:'main',index:Math.floor(pose.s),s:pose.s},pitch:0};
}
export function coinPositions(track) {
 const coins=[];
 for(const [fi,f] of track.features.entries()) if(f.type==='coins') for(let i=0;i<f.count;i++) {
  const s=f.from+(f.to-f.from)*(f.count===1?0:i/(f.count-1)),p=track.at(s),l=f.lateral||0;
  coins.push({id:fi+'-'+i,x:p.x-p.tz*l,z:p.z+p.tx*l,y:p.y+(f.height||0)});
 }
 return coins;
}
// 两线段最近点，含平行、端点及退化圆柱中心线。
function closest(a,b,c,d) {
 const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z,wx=a.x-c.x,wz=a.z-c.z;
 const aa=ux*ux+uz*uz,bb=ux*vx+uz*vz,cc=vx*vx+vz*vz,dd=ux*wx+uz*wz,ee=vx*wx+vz*wz,den=aa*cc-bb*bb;
 let s=den>1e-12?clamp((bb*ee-cc*dd)/den,0,1):0,t=cc>1e-12?clamp((bb*s+ee)/cc,0,1):0;
 s=aa>1e-12?clamp((bb*t-dd)/aa,0,1):0;t=cc>1e-12?clamp((bb*s+ee)/cc,0,1):0;
 return {x:a.x+s*ux,z:a.z+s*uz,px:c.x+t*vx,pz:c.z+t*vz};
}
export function effectiveHalfWidth(c) {return Math.abs(cos(c.roll))*T.width/2+Math.abs(sin(c.roll))*T.height/2;}
function collide(c,a,b,radius,events,type='wall') {
 const r=effectiveHalfWidth(c),h=T.length/2-T.width/2,fx=sin(c.yaw),fz=cos(c.yaw);
 const q=closest({x:c.x-fx*h,z:c.z-fz*h},{x:c.x+fx*h,z:c.z+fz*h},a,b);
 let dx=q.x-q.px,dz=q.z-q.pz,d=Math.sqrt(dx*dx+dz*dz),limit=r+radius;
 if(d>=limit) return false;
 if(d<1e-9) {dx=b.z-a.z;dz=a.x-b.x;d=Math.sqrt(dx*dx+dz*dz);if(d<1e-9){dx=-fx;dz=-fz;d=1;}if(dx*c.vx+dz*c.vz>0){dx=-dx;dz=-dz;}}
 const nx=dx/d,nz=dz/d,penetration=limit-Math.sqrt((q.x-q.px)*(q.x-q.px)+(q.z-q.pz)*(q.z-q.pz));
 c.x+=nx*(penetration+.00001);c.z+=nz*(penetration+.00001);
 const vn=c.vx*nx+c.vz*nz,speed=Math.sqrt(c.vx*c.vx+c.vz*c.vz);
 if(vn<0) {c.vx-=vn*nx;c.vz-=vn*nz;const keep=1-T.collisionLoss*clamp(-vn/(speed||1),0,1);c.vx*=keep;c.vz*=keep;}
 if(vn<-.5) events.push({type,impact:-vn});return true;
}
export function stepCar(c,bits,{track,hazards,step=0,coins}={}) {
 const events=[],edge=bits&~c.previousBits;c.previousBits=bits;
 if((edge&ROLL)&&c.rollTime<=0){c.rollTime=T.rollDuration;c.rollDirection=bits&RIGHT?-1:1;}
 if(c.rollTime>0){c.rollTime=Math.max(0,c.rollTime-DT);const elapsed=T.rollDuration-c.rollTime;let i=0;while(i<T.rollKeys.length-2&&elapsed>T.rollKeys[i+1])i++;c.roll=c.rollTime>0?c.rollDirection*Math.PI*(T.rollAngles[i]+(T.rollAngles[i+1]-T.rollAngles[i])*smoothstep(T.rollKeys[i],T.rollKeys[i+1],elapsed)):0;}
 let n=track.nearest(c.x,c.z,c.near);const previousNear=n;c.near=n;c.surface=track.surfaceAt(c.x,c.z);
 const mu=T.grip[c.surface]||.8,fx=sin(c.yaw),fz=cos(c.yaw),rx=fz,rz=-fx;
 let forward=c.vx*fx+c.vz*fz,lateral=c.vx*rx+c.vz*rz;
 // steer > 0 为向左转（车头转向 +x；从车后看 +x 在屏幕左侧），与第一版 steerVis 的约定一致
 const target=(bits&LEFT?1:0)-(bits&RIGHT?1:0),rate=target?T.steerRate:T.steerReturn;
 c.steer+=clamp(target-c.steer,-rate*DT,rate*DT);
 const drifting=!!(bits&DRIFT)&&c.grounded&&Math.abs(forward)>T.driftMinSpeed&&Math.abs(c.steer)>.1;
 if(drifting&&Math.abs(lateral)>T.driftSlip){c.driftTime+=DT;c.driftTier=0;for(const threshold of T.driftThresholds)if(c.driftTime>=threshold)c.driftTier++;}
 if(!(bits&DRIFT)&&c.driftTime>0){if(c.driftTier){c.boostTime=Math.max(c.boostTime,T.driftDurations[c.driftTier-1]);events.push({type:'driftBoost',tier:c.driftTier});}c.driftTime=0;c.driftTier=0;}
 c.drifting=drifting;
 const curvature=c.steer/(6+forward*forward/(mu*T.gravity));
 const yawRate=forward*curvature*(drifting?T.driftSteer:1)+c.yawKick;
 c.yawKick*=Math.max(0,1-3*DT);c.yaw=wrapAngle(c.yaw+yawRate*DT);
 // 先保留世界惯性，再以新车头投影，横滑由抓地上限逐步消除。
 const newFx=sin(c.yaw),newFz=cos(c.yaw);forward=c.vx*newFx+c.vz*newFz;lateral=c.vx*newFz-c.vz*newFx;
 lateral-=clamp(lateral,-mu*T.gravity*(drifting?T.driftGrip:1)*DT,mu*T.gravity*(drifting?T.driftGrip:1)*DT);
 let acceleration=0;
 if(bits&THROTTLE) acceleration+=Math.min(T.acceleration,T.power/Math.max(1,Math.abs(forward)));
 if(bits&BRAKE) acceleration+=forward>0?-T.brake:-T.reverseAcceleration;
 const resistance=c.surface===SAND?T.sandResistance:c.surface===GRAVEL?T.gravelResistance:0;
 acceleration-=Math.sign(forward)*(T.drag*forward*forward+resistance);
 if(c.boostTime>0){acceleration+=T.boostAcceleration;c.boostTime=Math.max(0,c.boostTime-DT);}
 let next=forward+acceleration*DT;
 if(!(bits&(THROTTLE|BRAKE))&&next*forward<0)next=0;
 if((bits&BRAKE)&&forward>0&&next<0)next=0;
 const cap=c.surface===SAND?T.sandSpeed:T.maxSpeed+(c.boostTime>0?T.boostSpeed:0);
 forward=clamp(next,-T.reverseSpeed,cap);c.vx=newFx*forward+newFz*lateral;c.vz=newFz*forward-newFx*lateral;
 const oldY=c.y,oldGrounded=c.grounded;
 // 推进器限高：以路面（含断桥缺口上方的路面高度）为基准，越接近升限推力越小，飞不过墙、也不能一路飞到终点
 const onRoad=Math.abs(n.lateral)<=n.w/2+1,base=onRoad?n.y:track.heightAt(c.x,c.z),apex=c.y-base+(c.vy>0?c.vy*c.vy/(2*T.gravity):0),lift=T.jetAcceleration*clamp((T.jetCeiling-apex)/T.jetFade,0,1);   // 按惯性还能冲到的高度减推力，不会冲过升限
 if((bits&JET)&&c.fuel>0){c.fuel=Math.max(0,c.fuel-T.fuelBurn*DT);c.vy+=(lift-T.gravity)*DT;c.grounded=c.grounded&&lift<=T.gravity;}
 else if(!c.grounded)c.vy-=T.gravity*DT;
 c.x+=c.vx*DT;c.z+=c.vz*DT;
 n=track.nearest(c.x,c.z,n);c.near=n;c.surface=track.surfaceAt(c.x,c.z);
 const ground=Math.abs(n.lateral)<=n.w/2+.8&&c.surface!==GAP?n.y+n.lateral*n.bank:track.heightAt(c.x,c.z);
 if(oldGrounded&&c.grounded){// 极急回头弯的路幅会重叠，最近投影可切换到相邻弧段；这不是跳台。
 const seam=n.path===previousNear.path&&Math.abs(n.s-previousNear.s)>2+Math.abs(forward)*DT*2;
 // 分支接口、重叠路幅的高度断层不是坡：向上超出合理坡度时只抬起车身，不产生弹射速度；向下断层照常离地（台地边缘要能飞出去）。
 const raw=(ground-oldY)/DT,cap=Math.abs(forward)*T.maxGrade+T.stepSpeed,stepUp=raw>cap;
 const slope=seam||stepUp?Math.min(c.vy,cap):raw;if(!stepUp&&slope<c.vy-T.gravity*DT){c.grounded=false;c.vy-=T.gravity*DT;c.y+=c.vy*DT;}else{c.vy=slope;c.y=ground;}}
 else c.y+=c.vy*DT;
 if(!c.grounded&&c.y<=ground&&c.vy<=0){const impact=-c.vy;c.y=ground;c.vy=0;c.grounded=true;events.push({type:'land',impact});if(impact>T.landingThreshold){const keep=Math.max(.75,1-(impact-T.landingThreshold)*T.landingLoss);c.vx*=keep;c.vz*=keep;}}
 if(c.grounded)c.fuel=Math.min(T.fuelMax,c.fuel+T.fuelRecharge*DT);
 c.pitch=c.grounded?clamp(c.vy/(Math.abs(forward)+1),-.4,.4):clamp(c.vy/60,-.35,.35);
 if(c.surface===GAP&&c.y<n.y-T.fallDepth)events.push({type:'fell'});
 // 赛道边界在任何高度都挡（推进器不能从空中抄近路）。
 for(let pass=0;pass<2;pass++)for(const wall of track.walls){
  if(Math.abs((wall.a.x+wall.b.x)/2-c.x)>16||Math.abs((wall.a.z+wall.b.z)/2-c.z)>16)continue;
  collide(c,wall.a,wall.b,0,events);
 }
 for(const [fi,f] of track.features.entries()) {
  if(f.type==='slot'&&c.y<f.y+f.height){
   // 无法容纳的夹缝没有可行的侧向推出解，退回入口平面，避免两面墙互相推挤穿透。
   const dx=c.x-f.x,dz=c.z-f.z,along=dx*f.tx+dz*f.tz,side=-dx*f.tz+dz*f.tx,r=effectiveHalfWidth(c);
   const extent=Math.abs(newFx*f.tx+newFz*f.tz)*(T.length/2-T.width/2)+r;
   if(Math.abs(along)>=f.rockRadius+extent)c.slotEntry[fi]=Math.sign(along);
   if(Math.abs(along)<f.rockRadius+extent&&Math.abs(side)<f.width/2+r&&r+Math.abs(side)>f.width/2){
    const entry=c.slotEntry[fi]||Math.sign(along)||-1,correction=entry*(f.rockRadius+extent+.001)-along;c.x+=f.tx*correction;c.z+=f.tz*correction;
    const vn=c.vx*f.tx+c.vz*f.tz;if(vn*entry<0){c.vx-=vn*f.tx;c.vz-=vn*f.tz;events.push({type:'wall',impact:Math.abs(vn)});}
   }
  }
  if(f.type==='boost'){
   const dx=c.x-f.x,dz=c.z-f.z,inside=Math.abs(dx*f.tx+dz*f.tz)<=f.length/2&&Math.abs(-dx*f.tz+dz*f.tx)<=f.width/2&&c.grounded;
   if(inside&&!c.boostInside[fi]){c.boostTime=T.boostDuration;events.push({type:'boost',id:fi});}c.boostInside[fi]=inside;
  }
  if(f.type==='cones'&&c.y<n.y+1.5)for(const [i,item] of f.items.entries()){
   if(item.kind==='concrete'){collide(c,item,item,item.radius,events);continue;}
   const dx=c.x-item.x,dz=c.z-item.z,key=fi+'-'+i;
   if(c.cones[key]!==c.lap&&dx*dx+dz*dz<2.25){c.cones[key]=c.lap;c.vx*=T.coneRetention;c.vz*=T.coneRetention;events.push({type:'cone',id:key});}
  }
 }
 for(const coin of coins||coinPositions(track))if(c.picked[coin.id]!==c.lap){const dx=c.x-coin.x,dy=c.y+T.height/2-coin.y,dz=c.z-coin.z;if(dx*dx+dy*dy+dz*dz<=T.coinRadius*T.coinRadius){c.picked[coin.id]=c.lap;c.fuel=Math.min(T.fuelMax,c.fuel+T.coinFuel);events.push({type:'coin',id:coin.id});}}
 for(const rock of hazards?.positions(step)||[]){
  if(step-(c.rockHits[rock.id]??-100000)<T.rockCooldown/DT||Math.abs(c.y-rock.y)>T.height+rock.radius)continue;
  const h=T.length/2-T.width/2,q=closest({x:c.x-newFx*h,z:c.z-newFz*h},{x:c.x+newFx*h,z:c.z+newFz*h},rock,rock),dx=q.x-rock.x,dz=q.z-rock.z,r=effectiveHalfWidth(c)+rock.radius;
  if(dx*dx+dz*dz<r*r){c.rockHits[rock.id]=step;c.vx*=T.rockRetention;c.vz*=T.rockRetention;c.yawKick=rock.direction*T.rockYaw;events.push({type:'rock',id:rock.id});}
 }
 // 水平接触修正不是行驶位移，不能在下一步被误算成坡面向上速度。
 const corrected=track.nearest(c.x,c.z,c.near);c.near=corrected;c.surface=track.surfaceAt(c.x,c.z);
 if(c.grounded)c.y=Math.abs(corrected.lateral)<=corrected.w/2+.8&&c.surface!==GAP?corrected.y+corrected.lateral*corrected.bank:track.heightAt(c.x,c.z);
 return events;
}
