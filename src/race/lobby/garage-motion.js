/** 展示时钟不接入比赛模拟；准备只在 false → true 时触发一次。 */
export function readyEnvelope(age) {
 const headlights=age<.1||(age>=.2&&age<.3)?5:age<.4?.2:1.2;
 return {headlights,boost:age>=.12&&age<.65};
}
export function cameraProgress(age,duration,reduced) {
 const p=reduced?1:Math.min(1,Math.max(0,age/duration));
 return 1-(1-p)**3;
}
