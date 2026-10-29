import { t } from '../i18n/i18n.js';
// 服务端仅保存难度，所有显示位置共用当前语言的机器人名字。
export const playerName=player=>player.bot?t('room.botName',{difficulty:t('race.'+player.difficulty)}):player.name;
