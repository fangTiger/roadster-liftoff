// 键盘输入：W/↑ 加速，S/↓ 刹车，A/D/←/→ 转向；录制模式下由外部脚本直接写入
export function createInput() {
  const keys = new Set();
  const map = { KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  addEventListener('keydown', e => { if (map[e.code]) { keys.add(map[e.code]); e.preventDefault(); } });
  addEventListener('keyup', e => { if (map[e.code]) keys.delete(map[e.code]); });
  addEventListener('blur', () => keys.clear());
  const state = () => ({ throttle: keys.has('throttle'), brake: keys.has('brake'), left: keys.has('left'), right: keys.has('right') });
  return { state, keys };
}
