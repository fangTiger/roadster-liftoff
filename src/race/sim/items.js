import { sin,cos,clamp } from './fmath.js';
import { ROAD } from '../track/build.js';
// 所有几何与抽取只依赖入参；随机源由房间注入，模拟和测试无需全局随机数。
export function itemBoxes(track) {
 const boxes=[];
 for(const [row,fraction] of [.22,.52,.8].entries()){
  let found=false;
  for(let offset=0;offset<track.length;offset++){
   const raw=track.length*fraction+offset,s=raw-Math.floor(raw/track.length)*track.length,p=track.at(s);
   const special=track.features.some(f=>{
    if(!['gap','slot','ramp','rockfall','cones','boost'].includes(f.type))return false;
    const margin=f.type==='slot'?(f.rockRadius||4)+2:3,center=f.from??f.s;
    const from=f.type==='boost'?center-(f.length||0)/2:center;
    const to=f.type==='ramp'?center+(f.length||0):f.type==='boost'?center+(f.length||0)/2:(f.to??center);
    if(f.items?.some(item=>s>=item.s-(item.radius||1)-3&&s<=item.s+(item.radius||1)+3))return true;
    return s>=from-margin&&s<=to+margin;
   });
   if(special)continue;
   const line=Array.from({length:4},(_,i)=>{const lateral=(i-1.5)*Math.min(p.w*.8,13.2)/4;return {id:`${row}-${i}`,s,x:p.x-p.tz*lateral,z:p.z+p.tx*lateral,y:p.y+lateral*p.bank};});
   if(!line.every(b=>track.surfaceAt(b.x,b.z)===ROAD))continue;
   boxes.push(...line);found=true;break;
  }
  if(!found)throw new RangeError('赛道没有合适的道具箱路面');
 }
 return boxes;
}
export function rollItem(rankFraction,random) {
 const p=Math.max(0,Math.min(1,rankFraction)),weights=[['missile',.05+.4*p],['mine',.4-.3*p],['nitro',.25+.1*p],['shield',.3-.2*p]];
 let value=random();for(const [kind,weight] of weights){value-=weight;if(value<0)return kind;}return 'shield';
}
export const mineAlive=(mine,time)=>time<mine.placedAt+30;
export function mineHits(mine,car,id,time) {
 const dx=car.x-mine.x,dz=car.z-mine.z;
 return mineAlive(mine,time)&&time>=mine.placedAt+.6&&(id!==mine.from||time>=mine.placedAt+1.5)&&dx*dx+dz*dz<=1.6*1.6;
}
// 横向跟随目标，落在断口时向前寻找路面；不依赖随机源或模拟状态。
export function mineThrowTarget(self,target,track) {
 const car=target??self,origin=track.at(car.s),lateral=(car.x-origin.x)*-origin.tz+(car.z-origin.z)*origin.tx;
 const vx=target?.vx??0,vz=target?.vz??0,ahead=target?clamp(Math.sqrt(vx*vx+vz*vz),12,45):40;
 for(let offset=0;offset<track.length;offset++){
  const raw=car.s+ahead+offset,s=raw-Math.floor(raw/track.length)*track.length,p=track.at(s),side=clamp(lateral,-p.w*.4,p.w*.4);
  for(let i=0;i<=8;i++){
   const d=side*(1-i/8),x=p.x-p.tz*d,z=p.z+p.tx*d;
   if(track.surfaceAt(x,z)===ROAD)return {x,z};
  }
 }
 throw new RangeError('赛道没有可投掷水雷的路面');
}

export const raceProgress=(car,trackLength)=>(car.lap-1)*trackLength+car.s;
export const itemTargetValid=car=>!!car&&!car.finished&&!car.ghost&&!car.stale&&car.connected!==false;
export function pickMissileTarget(self,cars,trackLength) {
 let target=null,nearest=Infinity;
 for(const car of cars){
  const ahead=raceProgress(car,trackLength)-raceProgress(self,trackLength);
  if(car.id!==self.id&&itemTargetValid(car)&&ahead>0&&ahead<=200&&ahead<nearest){nearest=ahead;target=car;}
 }
 return target;
}
// 发射点高度固定在路面上方，末端跟随目标当帧的显示位置。
export function missilePosition(missile,target,time) {
 const p=Math.max(0,Math.min(1,(time-missile.firedAt)/1.5)),blend=target?p*p*(3-2*p):0;
 const x=missile.x+sin(missile.yaw)*120*p,z=missile.z+cos(missile.yaw)*120*p,y=(missile.y??0)+1.5;
 return {x:x+((target?.x??x)-x)*blend,y:y+((target?.y??0)+.8-y)*blend,z:z+((target?.z??z)-z)*blend};
}
