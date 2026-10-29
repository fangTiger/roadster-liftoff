import { createSession } from './sim/session.js';
import { createBotDriver } from './bot-driver.js';
import { gridSpawn } from './grid.js';
// 与真人上报相同的白名单；本地碰撞与显示也直接读取当前状态。
export function carState(car,race,ghost=false) {
 return {x:car.x,y:car.y,z:car.z,yaw:car.yaw,pitch:car.pitch,vx:car.vx,vz:car.vz,steer:car.steer,drifting:!!car.drifting,boost:car.boostTime>0,ghost,shield:car.shieldTime>0,trapped:car.trapTime>0,air:!car.grounded,lap:race.lap,s:car.near.s};
}
export function createRoomBots({players,ownerId,track,laps,contacts}) {
 const bots=new Map();
 for(const player of players.filter(p=>p.bot&&p.ownerId===ownerId&&p.connected)){
  const session=createSession(track,{laps,spawn:gridSpawn(track,player.seat),contactId:player.id,contacts:step=>contacts(player.id,step)});
  bots.set(player.id,{session,driver:createBotDriver(player.difficulty),step:0,sequence:0,lastSend:-Infinity,lastFinish:-Infinity});
 }
 return bots;
}
