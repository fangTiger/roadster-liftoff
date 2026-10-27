import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export function createRaceCamera(camera,element){
 const orbit=new OrbitControls(camera,element);orbit.enabled=false;orbit.enableDamping=true;orbit.maxDistance=160;orbit.minDistance=4;
 let mode='follow',initialized=false;const target=new THREE.Vector3(),position=new THREE.Vector3();
 function setMode(next){mode=next|| (mode==='follow'?'orbit':'follow');orbit.enabled=mode==='orbit';initialized=false;return mode;}
 function update(c,dt=1/60){const speed=Math.hypot(c.vx,c.vz),fx=Math.sin(c.yaw),fz=Math.cos(c.yaw);target.set(c.x+fx*8,c.y+1.1,c.z+fz*8);
  if(mode==='orbit'){orbit.target.set(c.x,c.y+1,c.z);if(!initialized){camera.position.set(c.x+15,c.y+9,c.z+15);initialized=true;}orbit.update();return;}
  const distance=10+speed*.08,height=5-speed*.025+(c.grounded?0:2),swing=c.steer*speed*.035;
  position.set(c.x-fx*distance+fz*swing,c.y+Math.max(3,height),c.z-fz*distance-fx*swing);
  camera.position.lerp(position,initialized?1-Math.exp(-dt*7):1);camera.lookAt(target);initialized=true;
 }
 return {update,setMode};
}
