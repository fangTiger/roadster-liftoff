import { lerp } from './fmath.js';
import T from './tuning.js';
export function createHazards(track) {
 const rocks=track.features.filter(f=>f.type==='rockfall');
 function positions(step) {
  const out=[];
  for(const [id,f] of rocks.entries()) {
   const time=step*T.dt+f.phase,phase=time-Math.floor(time/f.period)*f.period;
   if(phase>=f.duration)continue;
   const lateral=lerp(f.lateralFrom,f.lateralTo,phase/f.duration);
   out.push({id,x:f.x-f.tz*lateral,z:f.z+f.tx*lateral,y:f.y+f.radius,radius:f.radius,direction:Math.sign(f.lateralTo-f.lateralFrom),tumbleweed:f.kind==='tumbleweed'});
  }
  return out;
 }
 return {positions};
}
