import { createEngine } from '../game/engine.js';
import { createCar } from '../game/car.js';
import { createRecorder } from './sim/replay.js';
import { buildTrack,trackHash } from './track/build.js';
import desertLoop from './track/data/desert-loop.js';
import { createSession } from './sim/session.js';
import { DT } from './sim/physics.js';
import { autopilot } from './sim/autopilot.js';
import * as B from './sim/input-bits.js';
import { createGreybox } from './scene/greybox.js';
import { createRaceCamera } from './camera.js';
import { createHud } from './hud.js';
const capture=new URLSearchParams(location.search).has('capture');
const engine=createEngine(capture?{pixelRatio:1}:{}),track=buildTrack(desertLoop),session=createSession(track),recorder=createRecorder(),hash=trackHash(desertLoop);
engine.camera.far=1800;engine.camera.updateProjectionMatrix();engine.renderer.toneMappingExposure=1;
const scene=createGreybox(engine.scene,track),hud=createHud(),camera=createRaceCamera(engine.camera,engine.renderer.domElement);
const car=await createCar();engine.scene.add(car.root);
let previous=session.snapshot,current=previous,lastBits=0,wheelAngle=0,accumulator=0,lastTime;
const keys=new Set(),map={KeyW:B.THROTTLE,ArrowUp:B.THROTTLE,KeyS:B.BRAKE,ArrowDown:B.BRAKE,KeyA:B.LEFT,ArrowLeft:B.LEFT,KeyD:B.RIGHT,ArrowRight:B.RIGHT,Space:B.JET,KeyR:B.ROLL,ShiftLeft:B.DRIFT,ShiftRight:B.DRIFT,Backspace:B.RESET,KeyT:B.RESET};
addEventListener('keydown',e=>{if(map[e.code]){e.preventDefault();keys.add(e.code);}if(e.code==='KeyC'&&!e.repeat)camera.setMode();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
function simulate(bits){previous=current;lastBits=bits;if(!current.race.finished)recorder.record(bits);session.step(bits);current=session.snapshot;wheelAngle+=Math.hypot(current.car.vx,current.car.vz)*DT/.34;}
function render(alpha=1,dt=1/60){const a=previous.car,b=current.car,blend=(x,y)=>x+(y-x)*alpha;
 const c={...b,x:blend(a.x,b.x),y:blend(a.y,b.y),z:blend(a.z,b.z)};
 let delta=b.yaw-a.yaw;delta-=Math.PI*2*Math.floor((delta+Math.PI)/(Math.PI*2));const yaw=a.yaw+delta*alpha;
 car.root.position.set(c.x,c.y,c.z);car.root.rotation.y=yaw+Math.PI;car.chassis.rotation.x=c.pitch;car.chassis.rotation.z=-c.steer*Math.min(.06,Math.hypot(c.vx,c.vz)*.001);
 car.setRoll(c.roll);car.setThrust((lastBits&B.THROTTLE)||c.boostTime>0?1:0,current.step*DT);car.setLift(lastBits&B.JET&&c.fuel>0?1:0,current.step*DT);
 const rcs=c.drifting?.65:0;car.setRCS(c.steer>0?rcs:0,c.steer<0?rcs:0,c.steer<0?rcs:0,c.steer>0?rcs:0,current.step*DT);
 car.setBrake(lastBits&B.BRAKE?1:0);car.setSteer(c.steer);for(const wheel of car.wheels){wheel.spin.rotation.x=-wheelAngle;if(wheel.front)wheel.steer.rotation.y=-c.steer*.35;}
 camera.update(c,dt);scene.update(current);hud.update(current);engine.render();
}
render();
// 普通游玩也全程录制；控制台可导出本局，便于复盘和服务器核实。
window.__raceReplay=()=>recorder.encode({track:hash,laps:3});
if(capture){window.__race={step(bits,n=1){for(let i=0;i<n;i++)simulate(bits);render(1,Math.max(DT,n*DT));return current;},auto(n=1){for(let i=0;i<n;i++)simulate(autopilot(current,track));render(1,Math.max(DT,n*DT));return current;},snap:()=>session.snapshot,replay:()=>recorder.encode({track:hash,laps:3}),cam(mode){const value=camera.setMode(mode);render();return value;},render:()=>render()};document.title='ready';}
else{function frame(time){const elapsed=lastTime===undefined?0:Math.min(.1,(time-lastTime)/1000);lastTime=time;accumulator+=elapsed;let bits=0;for(const code of keys)bits|=map[code]||0;while(accumulator>=DT){simulate(bits);accumulator-=DT;}render(accumulator/DT,elapsed);requestAnimationFrame(frame);}requestAnimationFrame(frame);}
