// 键盘输入：W/↑ 加速，S/↓ 刹车，A/D/←/→ 转向，空格 底部推进器；录制模式下由外部脚本直接写入
export function createInput() {
  const keys = new Set();
  // 触控与键盘分开记录，防止一种输入松开时覆盖另一种。
  const touch = new Set();
  const setTouch = (action, pressed) => {
    if (!Object.values(map).includes(action)) return;
    if (pressed) touch.add(action); else touch.delete(action);
  };
  const clearTouch = () => touch.clear();
  const map = { KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jet' };
  addEventListener('keydown', e => { if (map[e.code]) { keys.add(map[e.code]); e.preventDefault(); } });
  addEventListener('keyup', e => { if (map[e.code]) keys.delete(map[e.code]); });
  addEventListener('blur', () => { keys.clear(); clearTouch(); });
  const state = () => ({ throttle: (keys.has('throttle') || touch.has('throttle')), brake: (keys.has('brake') || touch.has('brake')), left: (keys.has('left') || touch.has('left')), right: (keys.has('right') || touch.has('right')), jet: (keys.has('jet') || touch.has('jet')) });
  return { state, keys, setTouch, clearTouch };
}
