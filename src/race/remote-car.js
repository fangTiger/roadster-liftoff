import { spinRotation } from './sim/effects.js';
import T from './sim/tuning.js';
import { onLangChange } from '../i18n/i18n.js';
import { playerName } from './room-player.js';
import * as THREE from 'three';
import { createCar } from '../game/car.js';
export const ROOM_COLORS=['#ef5350','#42b9ff','#ffd34d','#57db85','#c58aff','#ff963e'];
export async function createRemoteCar(player) {return prepareRemoteCar(await createCar(),player);}
// 远端只渲染；克隆材质，保持影子车与本地车的外观不受影响。
export function prepareRemoteCar(car,player) {
 const {seat=0,color=ROOM_COLORS[seat]}=player;
 const materials=[],geometries=new Set(),textures=new Set();
 car.root.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);
  if(!object.material)return;
  const clone=source=>{const m=source.clone();for(const value of Object.values(m))if(value?.isTexture)textures.add(value);if(m.name==='car_main_paint')m.color.set(color);materials.push(m);return m;};
  object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);
 });
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const context=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const paintLabel=()=>{context.clearRect(0,0,512,128);context.fillStyle='#101a20dd';context.fillRect(0,0,512,96);context.fillStyle=color;context.font='500 42px "PingFang SC", sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(playerName(player),256,48,480);context.beginPath();context.moveTo(232,100);context.lineTo(280,100);context.lineTo(256,128);context.closePath();context.fill();texture.needsUpdate=true;};
 paintLabel();const unsubscribe=onLangChange(paintLabel);
 const labelMaterial=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false,fog:false,toneMapped:false}),label=new THREE.Sprite(labelMaterial);
 // 按实际视角换算屏幕尺寸，文字约 110×20 像素，底部箭头约 7 像素。
 const labelSize=(fov=52)=>{const unit=2*Math.tan(fov*Math.PI/360)/(globalThis.innerHeight||900);label.scale.set(110*unit,27.5*unit,1);};
 label.position.set(0,2.3,0);label.renderOrder=999;labelSize();label.onBeforeRender=(_renderer,_scene,camera)=>{labelSize(camera.fov);label.updateMatrixWorld();};car.root.add(label);
 let wheelAngle=0,spinElapsed=0,wasSpinning=false;
 return {...car,
  update(state,dt){
   if(!state){car.root.visible=false;return;}
   car.root.visible=true;
   if(state.spinning){if(!wasSpinning)spinElapsed=0;spinElapsed+=Math.max(0,dt);}else spinElapsed=0;wasSpinning=!!state.spinning;
   car.root.position.set(state.x,state.y,state.z);car.root.rotation.y=state.yaw+Math.PI+(state.spinning?spinRotation(T.spinTime-spinElapsed%T.spinTime):0);car.chassis.rotation.x=state.pitch;car.chassis.rotation.z=-state.steer*Math.min(.06,Math.hypot(state.vx,state.vz)*.001);
   car.setSteer(state.steer);wheelAngle+=Math.hypot(state.vx,state.vz)*Math.min(.1,dt)/.34;
   for(const wheel of car.wheels){wheel.spin.rotation.x=-wheelAngle;if(wheel.front)wheel.steer.rotation.y=state.steer*.35;}
  },
  dispose(){unsubscribe();car.root.removeFromParent();for(const m of materials)m.dispose();for(const geometry of geometries)geometry.dispose();for(const map of textures)map.dispose();texture.dispose();labelMaterial.dispose();},
 };
}
