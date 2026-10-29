import { autopilot } from './sim/autopilot.js';
import { LEFT,RIGHT } from './sim/input-bits.js';
const LEVELS={easy:{cruise:.82,cornerGrip:.8,reaction:18},normal:{cruise:.9,cornerGrip:.9,reaction:10},hard:{cruise:1,cornerGrip:1,reaction:4}};
// 反应延迟以 120Hz 物理步计，只延迟转向，油门、刹车和喷气即时生效。
export function createBotDriver(difficulty) {
 const opts=LEVELS[difficulty];if(!opts)throw new RangeError('机器人难度无效');
 const queue=Array(opts.reaction).fill(0),mask=LEFT|RIGHT;let cursor=0;
 return (state,track)=>{const bits=autopilot(state,track,opts),steer=queue[cursor];queue[cursor]=bits&mask;cursor=(cursor+1)%queue.length;return (bits&~mask)|steer;};
}
