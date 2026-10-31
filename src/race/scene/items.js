import * as THREE from 'three';
import { missilePosition,pickMissileTarget } from '../sim/items.js';
import { createItemMaterials } from './item-materials.js';
import { createItemParticles } from './item-particles.js';
// 仅表现层：命名、轨迹与状态入口保持不变，所有拥有的资源集中释放。
export function createItemFx(scene,items,track) {
 const resources=new Set(),own=resource=>{resources.add(resource);return resource;};
 const root=new THREE.Group();root.name='party-items';scene.add(root);
 const boxes=new THREE.Group(),bursts=new THREE.Group();boxes.name='item-boxes';bursts.name='item-bursts';root.add(boxes,bursts);
 const mats=createItemMaterials(own),particles=createItemParticles(root,own);
 const sphere=own(new THREE.SphereGeometry(1,24,16)),capsule=own(new THREE.CylinderGeometry(.73,.73,1.5,6)),cap=own(new THREE.CylinderGeometry(.79,.79,.13,6)),core=own(new THREE.OctahedronGeometry(.3)),torus=own(new THREE.TorusGeometry(.43,.025,6,32)),flame=own(new THREE.ConeGeometry(.25,2.3,12)),ring=own(new THREE.RingGeometry(.83,1,48)),bubbleGeo=own(new THREE.SphereGeometry(.09,8,6));
 const bodyGeo=own(new THREE.CylinderGeometry(.16,.18,1.55,16)),noseGeo=own(new THREE.ConeGeometry(.16,.6,16)),finGeo=own(new THREE.BoxGeometry(.52,.055,.45));
 const mesh=(geometry,material,parent,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
 const group=(name,parent=root)=>{const g=new THREE.Group();g.name=name;parent.add(g);return g;};
 for(const b of items.boxes){
  const g=group('item-box-'+b.id,boxes);g.position.set(b.x,b.y+1.25,b.z);mesh(capsule,mats.crystal,g);
  for(const side of [-1,1])mesh(cap,mats.metal,g,0,side*.77,0);
  const inner=group('capsule-core',g);mesh(core,mats.glow,inner);const hoop=mesh(torus,mats.copper,inner);hoop.rotation.x=Math.PI/3;
 }
 const aimCanvas=document.createElement('canvas');aimCanvas.width=aimCanvas.height=128;
 const ctx=aimCanvas.getContext('2d');ctx.strokeStyle='#ff354c';ctx.lineWidth=7;ctx.beginPath();ctx.arc(64,64,37,0,Math.PI*2);
 for(const [x,z,dx,dz] of [[8,64,32,64],[96,64,120,64],[64,8,64,32],[64,96,64,120]]){ctx.moveTo(x,z);ctx.lineTo(dx,dz);}ctx.stroke();
 const aimTexture=own(new THREE.CanvasTexture(aimCanvas));aimTexture.colorSpace=THREE.SRGBColorSpace;
 const aimMaterial=own(new THREE.SpriteMaterial({map:aimTexture,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false,fog:false,toneMapped:false})),aim=new THREE.Sprite(aimMaterial);aim.name='item-aim';aim.renderOrder=1000;aim.visible=false;root.add(aim);
 aim.onBeforeRender=(_renderer,_scene,camera)=>{aim.scale.setScalar(38*2*Math.tan(camera.fov*Math.PI/360)/(globalThis.innerHeight||900));aim.updateMatrixWorld();};
 // 16 个爆炸槽循环复用；球壳与冲击波独立淡出，不在命中时新建资源。
 const burstPool=Array.from({length:16},()=>{
  const g=new THREE.Group(),ballMat=mats.burst(),ringMat=own(new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));
  mesh(sphere,ballMat,g);const wave=mesh(ring,ringMat,g);wave.rotation.x=-Math.PI/2;return g;
 });let burstIndex=0;
 const ground=mine=>track.heightAt(mine.x,mine.z)+.65;
 function impact(x,y,z,time,kind){
  const g=burstPool[burstIndex++%burstPool.length];g.userData.born=time;g.userData.kind=kind;g.position.set(x,y,z);g.scale.setScalar(1);bursts.add(g);
  const color=kind==='fire'?0xff782d:0x8eeaff;g.children[0].material.color.setHex(color);g.children[1].material.color.setHex(color);g.children[0].material.uniforms.shielded.value=kind==='shield'?1:0;g.children[0].visible=kind!=='water';
  particles.emit(kind==='fire'?'sparks':'water',time,x,y,z,kind==='water'?28:kind==='shield'?16:36,kind==='shield'?1.5:3);
  if(kind==='fire'){particles.emit('smoke',time,x,y,z,10,1.2);particles.emit('debris',time,x,y,z,16,3);}
  animateBurst(g,time);
 }
 function burst(mine,time){impact(mine.x,ground(mine),mine.z,time,'water');}
 function explode(state,time,shielded){impact(state.x,state.y+.8,state.z,time,shielded?'shield':'fire');}
 function animateBurst(g,time){
  const age=time-g.userData.born,u=Math.max(0,age/.5);if(u>=1){g.removeFromParent();return;}
  const [ball,wave]=g.children;ball.scale.setScalar(.35+Math.sin(Math.min(1,u*1.7)*Math.PI/2)*2);ball.material.uniforms.fade.value=(1-u)**2*.9;ball.material.uniforms.time.value=time;
  wave.scale.setScalar(.5+u*5);wave.material.opacity=(1-u)*.8;
 }
 const mineMeshes=new Map(),missileMeshes=new Map(),cars=new Map();
 function waterBall(name,parent){
  const g=group(name,parent);mesh(sphere,mats.water,g);
  for(let i=0;i<4;i++){const bubble=mesh(bubbleGeo,mats.water,g);bubble.userData.phase=i*.25;}
  return g;
 }
 function bubbles(g,time){for(let i=1;i<g.children.length;i++){const b=g.children[i],phase=b.userData.phase;b.position.set(Math.sin(phase*19+time)*.37,((time*.22+phase)%1)*1.4-.7,Math.cos(phase*17+time*.5)*.37);}}
 function addFlame(g,x,z){
  const outer=mesh(flame,mats.outer,g,x,0,z),inner=mesh(flame,mats.inner,g,x,0,z+.15);outer.rotation.x=inner.rotation.x=-Math.PI/2;inner.scale.set(.48,.72,.48);return outer;
 }
 function emitTrail(g,time,kind,count=1,offset=1.6){
  const tick=Math.floor(time*36);if(g.userData.trailTick===tick)return;g.userData.trailTick=tick;
  const x=g.position.x-Math.sin(g.rotation.y)*offset,z=g.position.z-Math.cos(g.rotation.y)*offset;
  particles.emit(kind,time,x,g.position.y,z,count,.3);
 }
 function update(selfId,time,states,aimState){
  mats.update(time);
  const slot=items.slot?.(selfId),canAim=aimState&&slot&&time>=slot.readyAt&&(slot.kind==='missile'||slot.kind==='mine'&&!aimState.back),target=canAim?pickMissileTarget(aimState.self,aimState.cars,track.length):null,state=target&&states.get(target.id);
  aim.visible=!!state;if(state){aim.position.set(state.x,state.y+3.2,state.z);aimMaterial.rotation=time*1.8;}
  boxes.children.forEach((g,i)=>{const b=items.boxes[i];g.visible=items.visible(selfId,b.id,time);g.rotation.set(0,time*.25+i*.3,Math.sin(time+i)*.05);g.position.y=b.y+1.25+Math.sin(time*2+i)*.15;g.children[3].rotation.set(time*.4,time*.8,0);});
  for(const [id,g] of mineMeshes)if(!items.mines.has(id)){g.removeFromParent();mineMeshes.delete(id);}
  for(const [id,mine] of items.mines){
   if(!mineMeshes.has(id))mineMeshes.set(id,waterBall('mine-'+id,root));
   const g=mineMeshes.get(id),age=time-mine.placedAt;
   if(age<.6&&mine.ox!==undefined&&mine.oz!==undefined){
    const p=Math.max(0,age/.6),y=ground(mine),oy=ground({x:mine.ox,z:mine.oz});
    g.position.set(mine.ox+(mine.x-mine.ox)*p,oy+(y-oy)*p+16*p*(1-p),mine.oz+(mine.z-mine.oz)*p);
   }else g.position.set(mine.x,ground(mine)+Math.sin(time*5)*.10,mine.z);
   g.scale.set(.7+Math.sin(time*7)*.05,.7,.7);g.rotation.z=Math.sin(time*5)*.18;g.visible=age>=0;bubbles(g,time);
  }
  for(const [id,g] of missileMeshes)if(!items.missiles?.has(id)){g.removeFromParent();missileMeshes.delete(id);}
  for(const [id,m] of items.missiles??[]){
   if(!missileMeshes.has(id)){
    const g=group('missile-'+id),body=mesh(bodyGeo,mats.paint,g),nose=mesh(noseGeo,mats.copper,g,0,0,1.075);body.rotation.x=nose.rotation.x=Math.PI/2;
    for(let i=0;i<4;i++){const angle=i*Math.PI/2,fin=mesh(finGeo,mats.metal,g,Math.cos(angle)*.2,Math.sin(angle)*.2,-.6);fin.rotation.z=angle;fin.name='missile-fin';}
    addFlame(g,0,-1.45);missileMeshes.set(id,g);
   }
   const g=missileMeshes.get(id),target=m.invalid?null:states.get(m.target),origin={...m,y:track.heightAt(m.x,m.z)},p=missilePosition(origin,target,time),next=missilePosition(origin,target,time+.01);
   g.position.set(p.x,p.y,p.z);g.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);g.visible=time>=m.firedAt&&time<m.firedAt+1.5;
   g.children[6].scale.y=1+Math.sin(time*70)*.18;if(g.visible){emitTrail(g,time,'smoke',2);particles.emit('sparks',time,p.x,p.y,p.z,1,.2);}
  }
  for(const [id,g] of cars)if(!states.has(id)){g.removeFromParent();cars.delete(id);}
  for(const [id,state] of states){
   if(!cars.has(id)){
    const g=group('item-car-'+id),shell=mesh(sphere,mats.shield,g),bubble=waterBall('trap-'+id,g),jet=group('nitro-'+id,g),daze=group('sparks-'+id,g);shell.name='shield-'+id;
    shell.scale.set(1.55,1.3,2.65);bubble.scale.set(1.55,1.5,2.65);jet.position.set(0,-.35,-2.5);for(const x of [-.65,.65])addFlame(jet,x,-.65);
    const arc=mesh(torus,mats.glow,daze);arc.scale.set(3.2,3.2,3.2);arc.rotation.x=Math.PI/2-.15;daze.position.y=1.25;
    for(let i=0;i<3;i++){const point=mesh(core,mats.glow,daze,Math.cos(i*Math.PI*2/3)*1.4,0,Math.sin(i*Math.PI*2/3)*1.4);point.scale.setScalar(.35);}
    cars.set(id,g);
   }
   const g=cars.get(id);g.visible=!state.stale;g.position.set(state.x,state.y+.8,state.z);g.rotation.y=state.yaw;
   const [shell,bubble,jet,daze]=g.children;shell.visible=!!state.shield;bubble.visible=!!state.trapped;bubble.rotation.z=Math.sin(time*8)*.04;bubbles(bubble,time);jet.visible=!!state.boost;jet.scale.z=1+Math.sin(time*61)*.12;daze.visible=!!state.spinning;daze.rotation.y=time*4;daze.rotation.z=Math.sin(time*7)*.12;
   if(jet.visible&&g.visible)emitTrail(g,time,'sparks',3,3.6);
  }
  for(const g of [...bursts.children])animateBurst(g,time);particles.update(time);
 }
 let disposed=false;
 return {update,burst,explode,dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();mineMeshes.clear();missileMeshes.clear();cars.clear();for(const resource of resources)resource.dispose();resources.clear();}};
}
