import { closest,effectiveHalfWidth,DT } from '../../src/race/sim/physics.js';
import { sin,cos } from '../../src/race/sim/fmath.js';
import T from '../../src/race/sim/tuning.js';

// 测速外围的几何采样：轻蹭也统计，不依赖物理内的撞击事件阈值。
export function createWallMonitor(track) {
 const size=16,tolerance=.02,buckets=new Map();
 const barriers=[...track.walls.map(w=>({...w,radius:0})),...track.features.flatMap(f=>f.type==='cones'?(f.items??[]).filter(p=>p.kind==='concrete').map(p=>({a:p,b:p,radius:p.radius,concrete:true})):[])];
 for(const barrier of barriers){
  const {a,b,radius}=barrier,pad=radius+T.length/2+tolerance;
  for(let x=Math.floor((Math.min(a.x,b.x)-pad)/size);x<=Math.floor((Math.max(a.x,b.x)+pad)/size);x++)for(let z=Math.floor((Math.min(a.z,b.z)-pad)/size);z<=Math.floor((Math.max(a.z,b.z)+pad)/size);z++){
   const key=`${x},${z}`,bucket=buckets.get(key)??[];bucket.push(barrier);buckets.set(key,bucket);
  }
 }
 let current=0,wallContactSteps=0,wallContactEpisodes=0,maxWallContactSteps=0,wallContactAt=null;
 return {
  sample(car){
   const h=(T.length-T.width)/2,fx=sin(car.yaw),fz=cos(car.yaw),r=effectiveHalfWidth(car);
   const a={x:car.x-fx*h,z:car.z-fz*h},b={x:car.x+fx*h,z:car.z+fz*h};
   const touching=(buckets.get(`${Math.floor(car.x/size)},${Math.floor(car.z/size)}`)??[]).some(barrier=>{
    if(barrier.concrete&&car.y>=car.near.y+1.5)return false;
    const q=closest(a,b,barrier.a,barrier.b);return Math.hypot(q.x-q.px,q.z-q.pz)<=r+barrier.radius+tolerance;
   });
   if(touching){if(!current)wallContactEpisodes++;current++;wallContactSteps++;if(current>maxWallContactSteps){maxWallContactSteps=current;wallContactAt={s:car.near.s,lap:car.lap};}}
   else current=0;
  },
  get metrics(){return {wallContactSteps,wallContactEpisodes,maxWallContactDuration:maxWallContactSteps*DT,wallContactAt};},
 };
}
