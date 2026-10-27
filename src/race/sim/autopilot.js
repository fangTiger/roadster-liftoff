import { sin,cos,clamp } from './fmath.js';
import { THROTTLE,BRAKE,LEFT,RIGHT,JET } from './input-bits.js';
import T from './tuning.js';
export function autopilot(snapshot,track) {
 const c=snapshot.car,n=track.nearest(c.x,c.z,c.near),speed=Math.sqrt(c.vx*c.vx+c.vz*c.vz);
 // 主线投影独立于分支的最近点，绝不主动选择捷径。
 let s=n.s;
 if(n.path!=='main'){const branch=track.branches.find(b=>b.id===n.path);s=branch.from+(branch.to-branch.from)*n.s/branch.length;}
 const look=T.lookaheadBase+speed*T.lookaheadSpeed,p=track.at(s+look),dx=p.x-c.x,dz=p.z-c.z;
 const right=dx*cos(c.yaw)-dz*sin(c.yaw),distance2=dx*dx+dz*dz;
 const desired=2*right/Math.max(1,distance2),maxCurve=1/(6+speed*speed/(1.6*T.gravity));
 const control=clamp(desired/maxCurve,-1,1);
 let bits=control>c.steer+.035?RIGHT:control<c.steer-.035?LEFT:0;
 // 数字按键用误差反馈脉冲保持中间转向值。
 let target=T.botCruise;
 for(let d=0;d<=140;d+=3){const a=track.at(s+d),b=track.at(s+d+3),dot=clamp(a.tx*b.tx+a.tz*b.tz,-1,1),curve=Math.sqrt(Math.max(0,2-2*dot))/3;
  const corner=Math.sqrt(Math.max(9,T.botCornerGrip*(1/Math.max(.0001,curve)-6)));target=Math.min(target,Math.sqrt(corner*corner+2*20*d));}
 const gap=track.features.find(f=>f.type==='gap');
 if(gap&&s>gap.from-95&&s<gap.to+12){target=Math.max(target,62);if(s>gap.from-14&&s<gap.to-2)bits|=JET;}
 if(!c.grounded&&c.vy<0&&c.y<n.y+2&&gap&&s<gap.to+10)bits|=JET;
 bits|=speed>target+T.botBrakeMargin?BRAKE:speed<target?THROTTLE:0;
 return bits;
}
