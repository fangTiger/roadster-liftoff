import { sin,cos,clamp } from './fmath.js';
import { THROTTLE,BRAKE,LEFT,RIGHT,JET } from './input-bits.js';
import T from './tuning.js';
export function autopilot(snapshot,track,{cruise=1,cornerGrip=1,laneOffset=0,brakeBias=0,braking=20}={}) {
 const c=snapshot.car,n=track.nearest(c.x,c.z,c.near),speed=Math.sqrt(c.vx*c.vx+c.vz*c.vz);
 // 主线投影独立于分支的最近点，绝不主动选择捷径。
 let s=n.s;
 if(n.path!=='main'){const branch=track.branches.find(b=>b.id===n.path);s=branch.from+(branch.to-branch.from)*n.s/branch.length;}
 const look=T.lookaheadBase+speed*T.lookaheadSpeed,p=track.at(s+look);
 // 新选项只在显式请求偏移时生效；默认计算顺序保持原样。
 let offset=typeof laneOffset==='function'?laneOffset(s+look,track):laneOffset;
 if(offset){
  // 连续 S 弯不能只看首尾切线，否则两次反向转弯会抵消而突然恢复横移。
  let curve=0;
  for(let d=-36;d<=12;d+=24){const a=track.at(s+look+d),b=track.at(s+look+d+24);curve=Math.max(curve,Math.abs(a.tx*b.tz-a.tz*b.tx)/24);}
  const room=Math.max(0,Math.min(p.w*.3,p.w/2-2)),taper=Math.max(0,1-curve*110);
  offset=clamp(offset,-room,room)*taper*taper;
  // 接口附近必须回到主线，断桥起跳和落地点也不横向换线。
  if(track.branches.some(b=>s+look>b.from-65&&s+look<b.to+65)||track.features.some(f=>f.type==='gap'&&s+look>f.from-110&&s+look<f.to+65))offset=0;
 }
 const dx=(offset?p.x-p.tz*offset:p.x)-c.x,dz=(offset?p.z+p.tx*offset:p.z)-c.z;
 const right=dx*cos(c.yaw)-dz*sin(c.yaw),distance2=dx*dx+dz*dz;
 const desired=2*right/Math.max(1,distance2),maxCurve=1/(6+speed*speed/(1.6*T.gravity));
 const control=clamp(desired/maxCurve,-1,1);
 // 这里的 right 是车头 +x 一侧，对应 steer 增大，也就是 LEFT 键
 let bits=control>c.steer+.035?LEFT:control<c.steer-.035?RIGHT:0;
 // 数字按键用误差反馈脉冲保持中间转向值。
 let target=T.botCruise*cruise;
 for(let d=0;d<=140;d+=3){const a=track.at(s+d+brakeBias),b=track.at(s+d+3+brakeBias),dot=clamp(a.tx*b.tx+a.tz*b.tz,-1,1),curve=Math.sqrt(Math.max(0,2-2*dot))/3;
  const corner=Math.sqrt(Math.max(9,T.botCornerGrip*cornerGrip*(1/Math.max(.0001,curve)-6)));target=Math.min(target,Math.sqrt(corner*corner+2*braking*d));}
 const gap=track.features.find(f=>f.type==='gap');
 if(gap&&s>gap.from-95&&s<gap.to+12){target=Math.max(target,62);if(s>gap.from-14&&s<gap.to-2)bits|=JET;}
 if(!c.grounded&&c.vy<0&&c.y<n.y+2&&gap&&s<gap.to+10)bits|=JET;
 bits|=speed>target+T.botBrakeMargin?BRAKE:speed<target?THROTTLE:0;
 return bits;
}
