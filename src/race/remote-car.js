import * as THREE from 'three';
import { createCar } from '../game/car.js';
import { createCarOpacity } from './car-opacity.js';
export const ROOM_COLORS=['#ef5350','#42b9ff','#ffd34d','#57db85','#c58aff','#ff963e'];
export async function createRemoteCar(player) {return prepareRemoteCar(await createCar(),player);}
// 远端只渲染；克隆材质，保持影子车与本地车的外观不受影响。
export function prepareRemoteCar(car,{name,seat=0,color=ROOM_COLORS[seat]}) {
 const materials=[],geometries=new Set(),textures=new Set();
 car.root.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);
  if(!object.material)return;
  const clone=source=>{const m=source.clone();for(const value of Object.values(m))if(value?.isTexture)textures.add(value);if(m.name==='car_main_paint')m.color.set(color);materials.push(m);return m;};
  object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);
 });
 const setOpacity=createCarOpacity(car.root);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
 const context=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 context.clearRect(0,0,512,96);context.fillStyle='#101a20dd';context.fillRect(0,0,512,96);context.fillStyle=color;context.font='500 42px "PingFang SC", sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(name,256,48,480);
 const labelMaterial=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}),label=new THREE.Sprite(labelMaterial);
 label.position.set(0,2.3,0);label.scale.set(3.2,.6,1);car.root.add(label);
 let opacity=1,wheelAngle=0;
 return {...car,
  update(state,dt){
   if(!state){car.root.visible=false;return;}
   const target=state.stale?0:1;opacity+=Math.sign(target-opacity)*Math.min(Math.abs(target-opacity),Math.max(0,dt)*2);
   car.root.visible=opacity>.001;
   setOpacity(opacity*(state.ghost?.35:1));
   labelMaterial.opacity=opacity;car.root.position.set(state.x,state.y,state.z);car.root.rotation.y=state.yaw+Math.PI;car.chassis.rotation.x=state.pitch;car.chassis.rotation.z=-state.steer*Math.min(.06,Math.hypot(state.vx,state.vz)*.001);
   car.setSteer(state.steer);wheelAngle+=Math.hypot(state.vx,state.vz)*Math.min(.1,dt)/.34;
   for(const wheel of car.wheels){wheel.spin.rotation.x=-wheelAngle;if(wheel.front)wheel.steer.rotation.y=state.steer*.35;}
  },
  dispose(){car.root.removeFromParent();for(const m of materials)m.dispose();for(const geometry of geometries)geometry.dispose();for(const map of textures)map.dispose();texture.dispose();labelMaterial.dispose();},
 };
}
