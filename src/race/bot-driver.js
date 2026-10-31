import { pickMissileTarget,raceProgress,itemTargetValid } from './sim/items.js';
import { racingInput } from './bot-racing-line.js';
import { smartBotShouldUseItem } from './bot-item-strategy.js';
import { autopilot } from './sim/autopilot.js';
import { LEFT,RIGHT,THROTTLE,BRAKE } from './sim/input-bits.js';
import { clamp,smoothstep } from './sim/fmath.js';
import { DT } from './sim/physics.js';
import T from './sim/tuning.js';
// 三档依次继承前版普通、困难、最高档；普通和困难使用赛车线，倍率显式传入。
const LEVELS={easy:{cruise:1.8,cornerGrip:2.15,braking:24,reaction:2},normal:{cruise:1.8,cornerGrip:1.7,braking:27,reaction:2},hard:{cruise:1.8,cornerGrip:2.3,braking:27,reaction:1}};
// 赛道紧弯和障碍密度不同，分别校准驾驶预算；倍率由房主明确传入会话。
const CALIBRATION={normal:{1:{cornerGrip:1.7},2:{cornerGrip:2.15},3:{cornerGrip:2.3,engine:1.2,topSpeed:1.08,grip:1.2}},hard:{1:{cornerGrip:2.3,cornerCap:2.3},2:{cornerGrip:2.75,engine:1.25,topSpeed:1.12,grip:1.3},3:{cornerGrip:2.9,engine:1.5,topSpeed:1.15,grip:1.6}}};
export function botPerformance(difficulty,track){const level=CALIBRATION[difficulty]?.[track?.id];return Object.freeze({engine:level?.engine??1,topSpeed:level?.topSpeed??1,grip:level?.grip??1});}
export function createBotPersonality(difficulty,random=Math.random) {
 const level=LEVELS[difficulty];if(!level)throw new RangeError('机器人难度无效');
 const cruise=level.cruise*(.97+.06*random()),cornerGrip=level.cornerGrip*(.97+.06*random()),brakeBias=(random()-.5)*4;
 const reaction=level.reaction+Math.min(2,Math.floor(random()*3))-1;
 const phase=random()*Math.PI*2,bias=(random()-.5)*.18,amplitude=.12+random()*.08,waves=3+Math.floor(random()*4),seed=Math.floor(random()*0x100000000);
 const laneOffset=(s,track)=>{const angle=s/track.length*Math.PI*2;return track.at(s).w*(bias+amplitude*(.7*Math.sin(waves*angle+phase)+.3*Math.sin((waves+2)*angle-phase)));};
 // 每圈使用无状态散列选失误，不消耗逐帧随机数；简单约八圈一次，普通和困难不故意失误。
 const plans=new WeakMap();
 function mistake(lap,track){
  if(difficulty==='normal'||difficulty==='hard')return null;
  let value=Math.imul((seed^lap)>>>0,0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);value=(value^(value>>>16))>>>0;
  if(value/0x100000000>.12)return null;
  let corners=plans.get(track);
  if(!corners){corners=[];for(let s=80;s<track.length-80;s+=20){const a=track.at(s),b=track.at(s+8);if(a.w>=10&&Math.abs(a.tx*b.tz-a.tz*b.tx)/8>.004&&!track.branches.some(q=>s>q.from-80&&s<q.to+80))corners.push(s);}plans.set(track,corners);}
  return corners.length?{s:corners[value%corners.length],brakeBias:-2-(value%100)/100}:null;
 }
 return Object.freeze({cruise,cornerGrip,braking:level.braking,brakeBias,reaction,phase,bias,amplitude,waves,seed,laneOffset,mistake});
}
// 反应延迟以 120Hz 物理步计，只延迟转向；每车独立持有个性、超车偏移和输入队列。
export function createBotDriver(difficulty,{random=Math.random,cars=()=>[],id,performance=botPerformance(difficulty)}={}) {
 const personality=createBotPersonality(difficulty,random),queue=Array(personality.reaction).fill(0),mask=LEFT|RIGHT;
 let cursor=0,passing=0,passSide=0;
 const laneOffset=(s,track)=>clamp(personality.laneOffset(s,track)+passing,-track.at(s).w*.3,track.at(s).w*.3);
 const driver=(state,track)=>{
  const c=state.car,n=track.nearest(c.x,c.z,c.near),others=cars().filter(o=>o.id!==id&&!o.ghost&&!o.finished&&!o.stale&&!o.air&&o.connected!==false);
  let target=0;
  const relative=o=>{const dx=o.x-c.x,dz=o.z-c.z;return {along:dx*n.tx+dz*n.tz,side:-dx*n.tz+dz*n.tx};};
  const front=others.map(relative).filter(o=>o.along>0&&o.along<=25&&Math.abs(o.side)<2.8).sort((a,b)=>a.along-b.along)[0];
  if(front){
   const space=side=>others.reduce((score,o)=>{const r=relative(o);return r.along>-8&&r.along<30?Math.min(score,Math.abs(r.side-side*3.2)):score;},10);
   const left=space(-1),right=space(1);
   if(!passSide||space(passSide)<1.8)passSide=left===right?(personality.bias<0?-1:1):left>right?-1:1;
   if(space(passSide)>1.8)target=passSide*3.2;
  }else passSide=0;
  // 横移要约两秒才能收回：在锥桶/水泥墩前提前结束超车，防止到归中窗口才开始回撤。
  if((difficulty==='normal'||difficulty==='hard')&&track.features.some(f=>f.type==='cones'&&f.items?.length&&n.s>f.items[0].s-200&&n.s<f.items.at(-1).s+65))target=0;
  // 每秒最多横移 1.8 米，离开超车场景后同样平滑归位。
  passing+=clamp(target-passing,-1.8*DT,1.8*DT);
  const mistake=state.race?.frozen?null:personality.mistake(state.race?.lap??1,track);
  const distance=mistake?Math.abs(n.s-mistake.s):Infinity,weight=1-smoothstep(8,40,distance);
  const opts={...personality,laneOffset,brakeBias:personality.brakeBias+(mistake?.brakeBias??0)*weight};
  // 新指令要等队列耗尽才执行，比较那时的方向盘，避免延迟反馈导致持续欠转。
  let futureSteer=c.steer;
  for(let i=0;i<queue.length;i++){const bits=queue[(cursor+i)%queue.length],target=(bits&LEFT?1:0)-(bits&RIGHT?1:0),rate=target?T.steerRate:T.steerReturn;futureSteer+=clamp(target-futureSteer,-rate*DT,rate*DT);}
  const racing=difficulty==='normal'||difficulty==='hard';
  const input=racing?racingInput:autopilot,calibration=CALIBRATION[difficulty]?.[track.id];
  const cornerGrip=Math.min(opts.cornerGrip*(calibration?.cornerGrip??LEVELS[difficulty].cornerGrip)/LEVELS[difficulty].cornerGrip,calibration?.cornerCap??Infinity);
  let bits=input({...state,car:{...c,steer:futureSteer}},track,racing?{...opts,cornerGrip,lookahead:.3,grip:performance.grip,laneOffset:(s,track)=>laneOffset(s,track)*.12}:opts);
  // 中心线车在障碍弯保持单列，避免软碰撞将并排车辆推向水泥墩。
  if(difficulty==='easy'&&front&&front.along<18&&track.features.some(f=>f.type==='cones'&&f.items?.length&&n.s>f.items[0].s-200&&n.s<f.items.at(-1).s+65))bits=(bits&~THROTTLE)|BRAKE;
  // 困难档可能抽到零步反应；这时直接执行，不能对空队列取模。
  if(!queue.length)return bits;
  const steer=queue[cursor];queue[cursor]=bits&mask;cursor=(cursor+1)%queue.length;
  return (bits&~mask)|steer;
 };
 return Object.assign(driver,{personality,laneOffset});
}

// 道具反应独立于驾驶输入队列，难度越高的随机区间越短。
export function botItemDelay(difficulty,random=Math.random) {
 const [base,span]=({easy:[.5,.3],normal:[.3,.2],hard:[.3,.12]})[difficulty]??[.5,.3];
 return Math.min(1.2,Math.max(.3,base+span*random()));
}
export function botShouldUseItem(kind,actor,cars,track,held,locked) {
 if(actor.difficulty==='normal'||actor.difficulty==='hard')return smartBotShouldUseItem(kind,actor,cars,track,held,locked);
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
