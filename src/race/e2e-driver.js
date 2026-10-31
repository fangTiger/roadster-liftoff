import { createBotDriver } from './bot-driver.js';

// 固定个性参数便于复现；只产生正常按键，不改变车辆或计时规则。
export function createE2eDriver() {
  return createBotDriver('hard', { random: () => .5 });
}
