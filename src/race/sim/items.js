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
