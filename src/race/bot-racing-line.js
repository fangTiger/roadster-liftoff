import { clamp } from './sim/fmath.js';
import { THROTTLE,BRAKE,LEFT,RIGHT,JET,DRIFT } from './sim/input-bits.js';
import T from './sim/tuning.js';
const cache=new WeakMap();
const wrap=(s,length)=>((s%length)+length)%length;
// 三点外接圆的有符号曲率，直接使用赛车线坐标而非中心线曲率。
function curvature(a,b,c){const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-b.x,vz=c.z-b.z;return 2*(ux*vz-uz*vx)/Math.max(1e-9,Math.hypot(ux,uz)*Math.hypot(vx,vz)*Math.hypot(c.x-a.x,c.z-a.z));}
/** 在主线路面约束内最小化整条闭合路径的曲率能量，生成外—内—外赛车线。 */
export function createRacingLine(track) {
 if(cache.has(track))return cache.get(track);
 const count=Math.ceil(track.length/4),spacing=track.length/count;
 const nodes=Array.from({length:count},(_,i)=>{const s=i*spacing,p=track.at(s);let room=Math.max(0,Math.min(p.w*.3,p.w/2-2.5));
  if(track.branches.some(b=>s>b.from-65&&s<b.to+65)||track.features.some(f=>f.type==='gap'&&s>f.from-110&&s<f.to+65))room=0;
  // 锥桶与水泥墩交错布置，保留中央通道；否则最小曲率路径会直穿弯外水泥墩。
  if(track.features.some(f=>f.type==='cones'&&f.items?.length&&s>f.items[0].s-20&&s<f.items.at(-1).s+20))room=0;
  return {...p,s,cx:p.x,cz:p.z,offset:0,room};
 });
 const node=i=>nodes[(i%count+count)%count];
 const move=(p,offset)=>{p.offset=offset;p.x=p.cx-p.tz*p.offset;p.z=p.cz+p.tx*p.offset;};
 // 从大尺度弧线逐步细化，避免只平滑几米邻域而停留在中心线附近。
 for(const stride of [16,8,4,2,1])for(let sweep=0;sweep<120;sweep++)for(let i=0;i<count;i++){
  const p=node(i),old=p.offset;if(!p.room)continue;
  const energy=()=>{let e=0;for(const j of [-stride,0,stride]){const a=node(i+j-stride),b=node(i+j),c=node(i+j+stride);const k=curvature(a,b,c);e+=k*k;}return e;};
  const e0=energy();move(p,old+.1);const plus=energy();move(p,old-.1);const minus=energy();move(p,old);
  const second=(plus+minus-2*e0)/.01,first=(plus-minus)/.2;
  let delta=second>1e-12?clamp(-first/second,-.3,.3):-.3*Math.sign(first);
  for(let tries=0;tries<6;tries++){move(p,clamp(old+delta,-p.room,p.room));if(energy()<=e0)break;move(p,old);delta*=.5;}
 }
 const samples=nodes.map((p,i)=>{const a=node(i-1),b=node(i+1),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);return {...p,tx:dx/len,tz:dz/len,curve:Math.abs(curvature(a,p,b))};});
 const line={spacing,nodes:samples,at(s){const raw=wrap(s,track.length)/spacing,index=Math.floor(raw),u=raw-index,a=samples[index],b=samples[(index+1)%count],p=track.at(s);const offset=clamp(a.offset+(b.offset-a.offset)*u,-Math.min(p.w*.3,p.w/2-2.5),Math.min(p.w*.3,p.w/2-2.5));const tx=a.tx+(b.tx-a.tx)*u,tz=a.tz+(b.tz-a.tz)*u,len=Math.hypot(tx,tz);return {x:p.x-p.tz*offset,z:p.z+p.tx*offset,y:p.y,w:p.w,tx:tx/len,tz:tz/len,curve:a.curve+(b.curve-a.curve)*u,offset,room:a.room+(b.room-a.room)*u};}};
 cache.set(track,line);return line;
}

/** 根据实际赛车线曲率扫描制动包络，默认物理与旧自动驾驶不依赖此控制器。 */
export function racingInput(snapshot,track,{line=createRacingLine(track),cornerGrip=2.2,cruise=1.8,braking=27,brakeBias=0,laneOffset=0,grip=1,lookahead=.18,drift=false}={}) {
 const c=snapshot.car,n=track.nearest(c.x,c.z,c.near),speed=Math.hypot(c.vx,c.vz);
 let s=n.s;if(n.path!=='main'){const branch=track.branches.find(b=>b.id===n.path);s=branch.from+(branch.to-branch.from)*s/branch.length;}
 const look=6+speed*lookahead,p=line.at(s+look),offset=typeof laneOffset==='function'?laneOffset(s+look,track):laneOffset;
 const room=Math.min(p.room,p.w*.3,Math.max(0,p.w/2-2.5));
 const side=clamp(p.offset+offset,-room,room),center=track.at(s+look);
 const dx=center.x-center.tz*side-c.x,dz=center.z+center.tx*side-c.z,right=dx*Math.cos(c.yaw)-dz*Math.sin(c.yaw);
 const mu=(T.grip[c.surface]||1.6)*grip;
 const desired=2*right/Math.max(1,dx*dx+dz*dz),control=clamp(desired*(6+speed*speed/(mu*T.gravity)),-1,1);
 let bits=control>c.steer+.025?LEFT:control<c.steer-.025?RIGHT:0,target=T.botCruise*cruise;
 for(let d=0;d<=180;d+=4){const p=line.at(s+d+brakeBias),corner=Math.sqrt(Math.max(9,T.botCornerGrip*cornerGrip*(1/Math.max(.0001,p.curve)-6)));target=Math.min(target,Math.sqrt(corner*corner+2*braking*d));}
 const gap=track.features.find(f=>f.type==='gap');if(gap&&s>gap.from-95&&s<gap.to+12){target=Math.max(target,62);if(s>gap.from-14&&s<gap.to-2)bits|=JET;}
 if(!c.grounded&&c.vy<0&&c.y<n.y+2&&gap&&s<gap.to+10)bits|=JET;
 bits|=speed>target+.5?BRAKE:speed<target?THROTTLE:0;
 // 漂移仅在可持续长弯尝试，出弯松开结算；探测时可显式关闭以比较净收益。
 if(drift&&c.grounded&&speed>25&&line.at(s+25).curve>.009&&line.at(s+45).curve>.009&&!(bits&BRAKE))bits|=DRIFT;
 return bits;
}
