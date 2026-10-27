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
import { createDesertSky } from './scene/sky.js';
import { createSkidmarks } from './scene/skidmarks.js';
import { createBoostFx } from './scene/boostfx.js';
import { MODES } from './sim/tuning.js';
const capture=new URLSearchParams(location.search).has('capture');
// 加载画面：素材加载、着色器预编译完成之前盖住页面，倒数从加载完成后才开始
const loading=document.createElement('div');loading.id='race-loading';loading.textContent='加载赛道…';
Object.assign(loading.style,{position:'fixed',inset:'0',zIndex:'50',display:'grid',placeItems:'center',background:'#0b0f14',color:'#cfd8e3',font:'500 15px/1 system-ui,sans-serif',letterSpacing:'.2em',transition:'opacity .6s'});
document.body.append(loading);
// 难度：新手（限速 220、入弯自动减速、自动回正）/ 标准 / 专业（撞墙损失更大、二次加速窗口更短）；记住上次的选择
const DIFFICULTY={rookie:['新手','最高 220 km/h，入弯自动减速，偏离路线时自动回正。成绩计入新手榜。'],standard:['标准','完整手感，没有辅助。'],pro:['专业','撞墙损失更大，二次加速时机更严格。']};
const stored=(()=>{try{return localStorage.getItem('race.difficulty');}catch{return null;}})();
let difficulty=new URLSearchParams(location.search).get('mode')||(MODES[stored]?stored:'standard');if(!MODES[difficulty])difficulty='standard';
const engine=createEngine(capture?{pixelRatio:1}:{}),track=buildTrack(desertLoop),hash=trackHash(desertLoop);
let session=createSession(track,{mode:difficulty}),recorder=createRecorder();
engine.camera.far=1800;engine.camera.updateProjectionMatrix();
const scene=createGreybox(engine.scene,track),hud=createHud(track),camera=createRaceCamera(engine.camera,engine.renderer.domElement);
const sky=await createDesertSky(engine.scene,engine.renderer),skid=createSkidmarks(engine.scene),car=await createCar();engine.scene.add(car.root);
const boostFx=createBoostFx(engine.scene,car);let seenEvents=0;
let previous=session.snapshot,current=previous,lastBits=0,wheelAngle=0,accumulator=0,lastTime;
const keys=new Set(),map={KeyW:B.THROTTLE,ArrowUp:B.THROTTLE,KeyS:B.BRAKE,ArrowDown:B.BRAKE,KeyA:B.LEFT,ArrowLeft:B.LEFT,KeyD:B.RIGHT,ArrowRight:B.RIGHT,Space:B.JET,ShiftLeft:B.DRIFT,ShiftRight:B.DRIFT,Backspace:B.RESET,KeyT:B.RESET};
addEventListener('keydown',e=>{if(map[e.code]){e.preventDefault();keys.add(e.code);}if(e.code==='KeyC'&&!e.repeat)camera.setMode();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
function simulate(bits){previous=current;lastBits=bits;if(!current.race.finished)recorder.record(bits);session.step(bits);current=session.snapshot;wheelAngle+=Math.hypot(current.car.vx,current.car.vz)*DT/.34;}
function render(alpha=1,dt=1/60){const a=previous.car,b=current.car,blend=(x,y)=>x+(y-x)*alpha;
 const c={...b,x:blend(a.x,b.x),y:blend(a.y,b.y),z:blend(a.z,b.z)};
 let delta=b.yaw-a.yaw;delta-=Math.PI*2*Math.floor((delta+Math.PI)/(Math.PI*2));const yaw=a.yaw+delta*alpha;
 car.root.position.set(c.x,c.y,c.z);car.root.rotation.y=yaw+Math.PI;car.chassis.rotation.x=c.pitch;car.chassis.rotation.z=-c.steer*Math.min(.06,Math.hypot(c.vx,c.vz)*.001);
 car.setRoll(c.roll);car.setThrust((lastBits&B.THROTTLE)||c.boostTime>0?1:0,current.step*DT);car.setLift(lastBits&B.JET&&c.fuel>0?1:0,current.step*DT);
 const rcs=c.drifting?.65:0;car.setRCS(c.steer<0?rcs:0,c.steer>0?rcs:0,c.steer>0?rcs:0,c.steer<0?rcs:0,current.step*DT);   // 左转时前右、后左喷气
 car.setBrake(lastBits&B.BRAKE?1:0);car.setSteer(c.steer);for(const wheel of car.wheels){wheel.spin.rotation.x=-wheelAngle;if(wheel.front)wheel.steer.rotation.y=c.steer*.35;}
 for(;seenEvents<current.events.length;seenEvents++)if(current.events[seenEvents].type==='counterBoost'){boostFx.trigger(c);camera.kick();}
 boostFx.update(dt,current.step*DT);
 camera.update(c,dt);sky.update(engine.camera,car.root.position);skid.update(c);scene.update(current);hud.update(current);engine.render();
}
await engine.renderer.compileAsync(engine.scene,engine.camera);render();render();
loading.style.opacity='0';setTimeout(()=>loading.remove(),700);
// 普通游玩也全程录制；控制台可导出本局，便于复盘和服务器核实。
window.__raceReplay=()=>recorder.encode({track:hash,laps:3,mode:difficulty});
if(capture){window.__race={step(bits,n=1){for(let i=0;i<n;i++)simulate(bits);render(1,Math.max(DT,n*DT));return current;},auto(n=1){for(let i=0;i<n;i++)simulate(autopilot(current,track));render(1,Math.max(DT,n*DT));return current;},snap:()=>session.snapshot,replay:()=>recorder.encode({track:hash,laps:3,mode:difficulty}),cam(mode){const value=camera.setMode(mode);render();return value;},render:()=>render()};document.title='ready';}
else{
 // 开赛前选择难度（1/2/3 或点击），选完重建会话再开始倒数
 const pick=document.createElement('div');pick.id='race-pick';
 pick.innerHTML=`<style>#race-pick{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:#0b0f14b8;backdrop-filter:blur(4px);font:15px 'Helvetica Neue','PingFang SC',sans-serif;color:#f4eee1}#race-pick h2{text-align:center;font-weight:600;letter-spacing:.2em;margin:0 0 22px}#race-pick .cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 16px}#race-pick button{all:unset;cursor:pointer;width:220px;padding:20px 22px;border-radius:12px;background:#17232ae6;border:1px solid #ffffff26;line-height:1.6}#race-pick button:hover,#race-pick button.on{border-color:#4bc8e5;box-shadow:0 0 0 2px #4bc8e555}#race-pick b{display:block;font-size:22px;margin-bottom:6px}#race-pick small{color:#aab7bd}#race-pick kbd{float:right;color:#4bc8e5}</style><div><h2>选择难度</h2><div class="cards">${Object.entries(DIFFICULTY).map(([k,[name,desc]],i)=>`<button data-k="${k}" class="${k===difficulty?'on':''}"><kbd>${i+1}</kbd><b>${name}</b><small>${desc}</small></button>`).join('')}</div></div>`;
 document.body.append(pick);
 const choose=k=>{difficulty=k;try{localStorage.setItem('race.difficulty',k);}catch{}session=createSession(track,{mode:k});recorder=createRecorder();previous=current=session.snapshot;seenEvents=0;
  const tag=document.querySelector('#race-hud header small');if(tag)tag.textContent=`MARS ROADSTER · ${desertLoop.name.zh} · ${DIFFICULTY[k][0]}`;
  pick.remove();removeEventListener('keydown',onPick);requestAnimationFrame(frame);};
 const onPick=e=>{const k=Object.keys(DIFFICULTY)[Number(e.key)-1];if(k)choose(k);else if(e.key==='Enter')choose(difficulty);};
 addEventListener('keydown',onPick);pick.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.k)));
 function frame(time){const elapsed=lastTime===undefined?0:Math.min(.1,(time-lastTime)/1000);lastTime=time;accumulator+=elapsed;let bits=0;for(const code of keys)bits|=map[code]||0;while(accumulator>=DT){simulate(bits);accumulator-=DT;}render(accumulator/DT,elapsed);requestAnimationFrame(frame);}
}
