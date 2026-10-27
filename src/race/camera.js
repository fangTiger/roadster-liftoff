import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// 竞速镜头：追尾时镜头固定挂在车后方，只平滑朝向和高度（平滑位置会让镜头按「车速 ÷ 平滑速率」落后，越开越远）；
// 速度感交给视野角，距离几乎不变。C 键切换自由环绕。
export function createRaceCamera(camera,element){
 const orbit=new OrbitControls(camera,element);orbit.enabled=false;orbit.enableDamping=true;orbit.maxDistance=160;orbit.minDistance=4;
 let mode='follow',initialized=false,camYaw=0,camY=0;const look=new THREE.Vector3();
 function setMode(next){mode=next||(mode==='follow'?'orbit':'follow');orbit.enabled=mode==='orbit';initialized=false;return mode;}
 function update(c,dt=1/60){
  if(mode==='orbit'){orbit.target.set(c.x,c.y+1,c.z);if(!initialized){camera.position.set(c.x+15,c.y+9,c.z+15);initialized=true;}orbit.update();return;}
  const speed=Math.hypot(c.vx,c.vz),k=Math.min(1,speed/83);
  // 漂移、横滑时镜头偏向实际行进方向，低速时跟车头
  const heading=speed>8?Math.atan2(c.vx,c.vz):c.yaw,target=c.yaw+Math.atan2(Math.sin(heading-c.yaw),Math.cos(heading-c.yaw))*.35;
  if(!initialized){camYaw=target;camY=c.y;initialized=true;}
  camYaw+=Math.atan2(Math.sin(target-camYaw),Math.cos(target-camYaw))*Math.min(1,dt*6);
  camY+=(c.y-camY)*Math.min(1,dt*(c.grounded?10:4));
  const back=6.6+k*.9,height=1.75+k*.2+(c.grounded?0:.5),fx=Math.sin(camYaw),fz=Math.cos(camYaw);
  camera.position.set(c.x-fx*back,camY+height,c.z-fz*back);
  look.set(c.x+Math.sin(c.yaw)*6,camY+.75,c.z+Math.cos(c.yaw)*6);camera.lookAt(look);
  const fov=52+k*14;if(Math.abs(camera.fov-fov)>.01){camera.fov+=(fov-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();}
 }
 return {update,setMode};
}
