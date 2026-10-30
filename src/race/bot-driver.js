import { pickMissileTarget,raceProgress,itemTargetValid } from './sim/items.js';
import { autopilot } from './sim/autopilot.js';
import { LEFT,RIGHT } from './sim/input-bits.js';
const LEVELS={easy:{cruise:.82,cornerGrip:.8,reaction:18},normal:{cruise:.9,cornerGrip:.9,reaction:10},hard:{cruise:1,cornerGrip:1,reaction:4}};
// 反应延迟以 120Hz 物理步计，只延迟转向，油门、刹车和喷气即时生效。
export function createBotDriver(difficulty) {
 const opts=LEVELS[difficulty];if(!opts)throw new RangeError('机器人难度无效');
 const queue=Array(opts.reaction).fill(0),mask=LEFT|RIGHT;let cursor=0;
 return (state,track)=>{const bits=autopilot(state,track,opts),steer=queue[cursor];queue[cursor]=bits&mask;cursor=(cursor+1)%queue.length;return (bits&~mask)|steer;};
}

// 道具反应独立于驾驶输入队列，难度越高的随机区间越短。
export function botItemDelay(difficulty,random=Math.random) {
 const [base,span]=({easy:[.8,.4],normal:[.5,.3],hard:[.3,.2]})[difficulty]??[.5,.3];
 return Math.min(1.2,Math.max(.3,base+span*random()));
}
export function botShouldUseItem(kind,actor,cars,track,held,locked) {
 const self={id:actor.id,lap:actor.race.lap,s:actor.car.near.s};
 if(kind==='missile')return !!pickMissileTarget(self,cars,track.length);
 if(kind==='shield')return locked||held>8;
 if(kind==='mine')return !!pickMissileTarget(self,cars,track.length)||held>6||cars.some(car=>{const behind=raceProgress(self,track.length)-raceProgress(car,track.length);return car.id!==self.id&&itemTargetValid(car)&&behind>0&&behind<=30;});
 if(kind==='nitro'){
  if(actor.rank>actor.count/2)return true;
  let s=self.s;
  if(actor.car.near.path&&actor.car.near.path!=='main'){const b=track.branches.find(b=>b.id===actor.car.near.path);s=b.from+(b.to-b.from)*s/b.length;}
  for(let d=0;d<120;d+=3){const a=track.at(s+d),b=track.at(s+d+3),dot=Math.max(-1,Math.min(1,a.tx*b.tx+a.tz*b.tz));if(Math.sqrt(Math.max(0,2-2*dot))/3>.002)return false;}
  return true;
 }
 return false;
}
