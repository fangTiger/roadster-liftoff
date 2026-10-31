/** 展示时钟不接入比赛模拟；准备只在 false → true 时触发一次。 */
export function readyEnvelope(age) {
 const headlights=age<.1||(age>=.2&&age<.3)?5:age<.4?.2:1.2;
 return {headlights,boost:age>=.55&&age<1.45};
}
/** 模型车头为 -Z；以镜头水平视线为基准，向左偏转四十度。 */
export function frontThreeQuarterYaw(x,z,camera) {
 return Math.PI+Math.atan2(camera.x-x,camera.z-z)-40*Math.PI/180;
}
/** 灯闪阶段保持前脸，随后露出车尾，最后回到同一展示角度。 */
export function readyTurn(age,reduced=false) {
 if(reduced||age<=.3||age>=2.2)return 0;
 const smooth=p=>p*p*(3-2*p);
 const p=age<.85?smooth((age-.3)/.55):age<1.35?1:1-smooth((age-1.35)/.85);
 return -1.8*p;
}
export function cameraProgress(age,duration,reduced) {
 const p=reduced?1:Math.min(1,Math.max(0,age/duration));
 return 1-(1-p)**3;
}
