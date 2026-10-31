import * as B from './sim/input-bits.js';
// 只限制实时键盘；录像与模拟继续接受原始输入位。
export function createKeyMap(trackId) {
 return {KeyW:B.THROTTLE,ArrowUp:B.THROTTLE,KeyS:B.BRAKE,ArrowDown:B.BRAKE,KeyA:B.LEFT,ArrowLeft:B.LEFT,KeyD:B.RIGHT,ArrowRight:B.RIGHT,...(trackId===3?{Space:B.JET}:{}),ShiftLeft:B.DRIFT,ShiftRight:B.DRIFT,Backspace:B.RESET,KeyT:B.RESET};
}
