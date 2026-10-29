import { DT } from './sim/physics.js';
import { atan2 } from './sim/fmath.js';
// 每排用赛道上的切线与法线定位，弯道发车位仍落在当前路面。
export function gridSpawn(track,seat) {
 if(!Number.isInteger(seat)||seat<0||seat>5)throw new RangeError('座位必须为 0 到 5');
 const s=track.length-12-Math.floor(seat/2)*8,p=track.at(s),side=seat%2===0?-2.5:2.5;
 return {...p,x:p.x-p.tz*side,z:p.z+p.tx*side,y:p.y+(p.bank||0)*side,yaw:atan2(p.tx,p.tz),s};
}
export function targetSteps(serverNow,startAt,step) {
 return Math.max(step,Math.min(step+240,Math.max(0,Math.floor((serverNow-startAt)/1000/DT))));
}
