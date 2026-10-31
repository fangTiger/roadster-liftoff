/** 豪华发布会展厅：独立渲染器、可滚动展区与投影铭牌。 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSeatLoader, disposeGarageObject, disposeGarageCar } from './garage-cars.js';
import { createBoostFx } from '../scene/boostfx.js';
import { readyEnvelope, cameraProgress, frontThreeQuarterYaw, readyTurn } from './garage-motion.js';
import { measureCarCorners, projectCarBounds, placePlate } from './garage-layout.js';
import { createScreenGeometry, createScreenMaterial, configureScreenTexture } from './garage-screen.js';
import { trackPreview } from './track-previews.js';
export const GARAGE_WALL_DEPTH = -41;
const SEAT_COUNT = 6;
const PODIUM_RADIUS = 2.45;
const PODIUM_HEIGHT = .28;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 协议席位不变，仅按本机身份调整展厅坐标。 */
export function seatPosition(index, selfSeat = null) {
 if(selfSeat===null){const x=(index-2.5)*5.65;return {x,z:27-Math.sqrt(729-x*x)-6,angle:0};}
 if(index===selfSeat)return {x:0,z:0,angle:0};
 const rank=index<selfSeat?index:index-1;
 const x=[-6.8,6.8,-10.5,10.5,-7.7][rank],z=[-8,-8,-16,-16,-34][rank];
 return {x,z,angle:-Math.sign(x)*.12};
}

/** 主车近景优先；侧后方弧形席位仍可横向浏览。 */
export function fitGarageCamera(camera, width, height) {
 camera.aspect=width/height;camera.fov=40;
 camera.position.set(0,7.2,16.4);const target=new THREE.Vector3(0,1.9,-1.8);
 camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();return target;
}
export function buildSeatLayout(room, selfId) {
  const layout = Array(SEAT_COUNT).fill(null);
  if (!room) return layout;
  for (const p of room.players) {
    const s = p.seat;
    if (s >= 0 && s < SEAT_COUNT) {
      layout[s] = {
        id: p.id,
        name: p.name,
        color: p.color,
        ready: !!p.ready,
        bot: !!p.bot,
        difficulty: p.difficulty || 'normal',
        connected: p.connected !== false,
        isHost: p.id === room.hostId,
        isSelf: p.id === selfId,
      };
    }
  }
  return layout;
}

// ── 纯函数：布局差分 ─────────────────────────────────────────────────────────

/**
 * 对比旧新布局，返回 { added, removed, changed } 席位索引数组。
 * 颜色或 id 变化 → 视为移除 + 添加（需重新加载车型）。
 */
export function diffLayouts(prev, next) {
  const added = [], removed = [], changed = [];
  for (let i = 0; i < SEAT_COUNT; i++) {
    const p = prev[i], n = next[i];
    if (!p && n)  { added.push(i);   continue; }
    if (p  && !n) { removed.push(i); continue; }
    if (p  && n) {
      if (p.id !== n.id || p.color !== n.color) {
        removed.push(i); added.push(i); continue;
      }
      if (
        p.ready !== n.ready ||
        p.connected !== n.connected ||
        p.name !== n.name ||
        p.isHost !== n.isHost ||
        p.isSelf !== n.isSelf ||
        p.bot !== n.bot ||
        p.difficulty !== n.difficulty
      ) {
        changed.push(i);
      }
    }
  }
  return { added, removed, changed };
}

// ── 纯函数：铭牌数据提取 ─────────────────────────────────────────────────────

/**
 * 从 seatData（buildSeatLayout 的单格）中提取铭牌所需字段。
 * 纯函数，供测试直接调用。
 */
export function extractPlateData(seatData, t) {
  if (!seatData) return null;
  const tk = (key, params) => (typeof t === 'function' ? t(key, params) : key);
  return {
    id: seatData.id,
    name: seatData.name || tk('room.emptySeat'),
    isHost: seatData.isHost,
    isSelf: seatData.isSelf,
    isBot: seatData.bot,
    difficulty: seatData.difficulty,
    ready: seatData.ready,
    connected: seatData.connected,
    color: seatData.color,
  };
}


const element = (tag, className) => { const node = document.createElement(tag); node.className = className; return node; };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** 柔边光池只用透明平面，避免六个点光源增加每个车漆像素的计算。 */
function glowTexture() {
 const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
 const context = canvas.getContext('2d'), gradient = context.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,'#ffffffa0'); gradient.addColorStop(.5,'#ffffff40'); gradient.addColorStop(1,'#ffffff00');
 context.fillStyle = gradient; context.fillRect(0,0,128,128);
 return new THREE.CanvasTexture(canvas);
}

class SeatObject {
 constructor(index, scene, geometry, poolTexture) {
  const { x, z } = seatPosition(index);
  this.root = new THREE.Group(); this.root.position.set(x,0,z); scene.add(this.root);
  this.fxScene=new THREE.Group();this.root.add(this.fxScene);
  this.index = index; this.car = null; this.outgoing = []; this.age = 0; this.ready = false;
  this.color = new THREE.Color('#55707b');
  this.podium = new THREE.Mesh(geometry.podium, new THREE.MeshStandardMaterial({color:0x252d34,roughness:.24,metalness:.85,envMapIntensity:.4}));
  this.ring = new THREE.Mesh(geometry.ring, new THREE.MeshBasicMaterial({color:this.color}));
  this.ring.rotation.x = Math.PI / 2; this.ring.position.y = PODIUM_HEIGHT;
  this.top = new THREE.Mesh(geometry.top, new THREE.MeshStandardMaterial({color:0x151c22,metalness:.7,roughness:.3,envMapIntensity:.28}));
  this.top.rotation.x = -Math.PI / 2; this.top.position.y = PODIUM_HEIGHT + .002;
  this.pool = new THREE.Mesh(geometry.pool,new THREE.MeshBasicMaterial({map:poolTexture,color:this.color,transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending}));
  this.pool.rotation.x = -Math.PI / 2; this.pool.position.y = .005;
  this.light = new THREE.Mesh(geometry.indicator,new THREE.MeshBasicMaterial({color:this.color}));
  this.light.rotation.x = -Math.PI / 2; this.light.position.set(0,PODIUM_HEIGHT+.012,1.94);
  this.root.add(this.podium,this.ring,this.top,this.pool,this.light);
 }
 setData(data, animate = true) {
  const changed = this.ready !== !!data?.ready;
  this.ready = !!data?.ready; this.data = data;
  this.color.set(data?.color || '#52616e');
  this.ring.material.color.copy(this.color).multiplyScalar(data ? (this.ready ? 2.4 : .9) : .35);
  this.light.material.color.set(this.ready ? '#a6ffd9' : data ? '#bd884d' : '#35424d');
  this.pool.material.color.copy(this.color); this.pool.material.opacity = data ? (this.ready ? .7 : .35) : .1;
  if (changed && this.ready && animate) {this.pulse=.7;this.feedback=0;this.onReady?.();}
  this.hero=!!data?.isSelf;this.podium.scale.set(this.hero?2.05:1.18,1,this.hero?2.05:1.18);
  for(const mesh of [this.ring,this.top])mesh.scale.setScalar(this.hero?2.05:1.18);
  this.light.position.z=this.hero?4.3:2.3;
  if (this.car) this.car.visible = true;
 }
 attach(car, data) {
  this.car = car; this.age = 0;
  // 在添加尾焰前缓存车身局部包围盒，供每帧投影与名牌避让。
  this.carBounds=measureCarCorners(car);
  this.lamps=[];const materials=new Set();
  car.traverse(o=>{for(const m of [o.material].flat().filter(Boolean)){materials.add(m);if(/headlights|Glass_Clear/.test(m.name)&&m.emissive)this.lamps.push(m);}});
  for(const material of materials)if(material.color&&!data?.isSelf)material.color.multiplyScalar(.68);
  this.fx=createBoostFx(this.fxScene,{body:car});
  // 大厅仅保留火焰；六席各一盏动态点光会让所有车漆像素额外计算六次。
  for(const light of car.children.filter(o=>o.isPointLight)){light.removeFromParent();light.dispose();}
  car.position.set(0,PODIUM_HEIGHT,0);this.root.add(car);
  this.setData(data,false);
 }
 detach(car) {
  if (this.car === car) {this.car = null;this.fx=null;this.lamps=[];disposeGarageObject(this.fxScene);this.fxScene=new THREE.Group();this.root.add(this.fxScene);}
  if (reducedMotion()) disposeGarageCar(car);
  else this.outgoing.push({car,time:0});
  this.setData(null,false);
 }
 update(dt, motion, camera) {
  this.age += dt;
  if (this.car) {
   this.feedback=(this.feedback??3)+dt;
   this.car.rotation.y=frontThreeQuarterYaw(this.root.position.x,this.root.position.z,camera.position)+readyTurn(this.feedback,!motion);
   const entering = motion ? Math.max(0,1-this.age/.65) : 0;
   this.car.position.y = PODIUM_HEIGHT + entering ** 3 * 2;
   this.car.scale.setScalar((this.hero?2.1:1.15)*(1-entering**3*.18));
   const feedback=readyEnvelope(this.feedback);
   for(const lamp of this.lamps)lamp.emissiveIntensity=feedback.headlights;
   this.fx?.update(dt,this.age,feedback.boost);
  }
  for (const item of this.outgoing) {
   item.time += dt;
   const progress = motion ? Math.min(1,item.time/.45) : 1;
   item.car.position.y = PODIUM_HEIGHT + progress * progress * 2;
   item.car.scale.setScalar(1-progress*.4);
   if (progress === 1) disposeGarageCar(item.car);
  }
  this.outgoing = this.outgoing.filter(item=>!item.car.userData.garageDisposed);
  if (this.pulse) {
   this.pulse = motion ? Math.max(0,this.pulse-dt) : 0;
   this.pool.scale.setScalar(1+Math.sin(this.pulse/.6*Math.PI)*.16);
  }
 }
 dispose() { for (const item of this.outgoing) disposeGarageCar(item.car); this.outgoing=[]; }
}

function buildEnvironment(scene, renderer) {
 const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
 const environment = pmrem.fromScene(room,.04); scene.environment = environment.texture;
 room.dispose(); pmrem.dispose();
 scene.environmentIntensity = .55;
 scene.background = new THREE.Color('#080f17'); scene.fog = new THREE.Fog('#080f17',48,105);
 scene.add(new THREE.HemisphereLight('#e7f3ff','#26313f',.6));
 for (const [color,intensity,x,y,z] of [['#eff5ff',1.4,0,12,3],['#ffdab2',.7,-18,7,-2],['#acddff',.9,16,9,-8]]) {
  const light = new THREE.DirectionalLight(color,intensity); light.position.set(x,y,z); scene.add(light);
 }
 const floor = new THREE.Mesh(new THREE.PlaneGeometry(180,160),new THREE.MeshStandardMaterial({color:'#101820',roughness:.26,metalness:.6,envMapIntensity:.16}));
 floor.rotation.x = -Math.PI/2; floor.position.y = -.015; scene.add(floor);
 // 保留建筑立柱，后景让地面雾融入背景色，不再设置与地面硬相交的实体墙。
 const metal=new THREE.MeshStandardMaterial({color:'#25333e',roughness:.38,metalness:.7});
 const strip=new THREE.MeshBasicMaterial({color:'#efdab8'});
 for (const z of [-12,-19,-28]) {
  const arch=new THREE.Group();arch.position.z=z;scene.add(arch);
  for (const x of [-22,22]) {
   const pillar=new THREE.Mesh(new THREE.BoxGeometry(.32,13,.4),metal);pillar.position.set(x,6.5,0);arch.add(pillar);
   const lamp=new THREE.Mesh(new THREE.BoxGeometry(.045,12,.08),strip);lamp.position.set(x+(x<0?.22:-.22),6.5,.25);arch.add(lamp);
  }
  const beam=new THREE.Mesh(new THREE.BoxGeometry(44,.3,.4),metal);beam.position.y=13;arch.add(beam);
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(43,.035,.12),strip);lamp.position.set(0,12.76,.2);arch.add(lamp);
 }
 // 地面嵌缝和后沿灯带让透视方向可读，亮度保持克制。
 const seams=new THREE.MeshBasicMaterial({color:'#26323c'});
 for (let x=-40;x<=40;x+=6) {
  const seam=new THREE.Mesh(new THREE.PlaneGeometry(.018,80),seams);seam.rotation.x=-Math.PI/2;seam.position.set(x,-.008,0);scene.add(seam);
 }
 return environment;
}

/** API 保留 update/resize/dispose；底部抽屉或右列尺寸通过 reserve 更新。 */
export function createGarage({container,loadCar,t=k=>k,onAddBot=()=>{},onRemoveBot=()=>{},playSound=()=>{},reserve={}}={}) {
 if (!container) throw new Error('展厅缺少容器');
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 const viewport=element('div','grg-viewport'),stage=element('div','grg-stage'),overlay=element('div','grg-overlay');
 renderer.domElement.className='grg-canvas';stage.append(renderer.domElement,overlay);viewport.append(stage);container.append(viewport);
 const scene=new THREE.Scene(),environment=buildEnvironment(scene,renderer);
 const poolTexture=glowTexture();
 // 唯一主聚光不投实时阴影；柔光池与透明锥体承担体积感，避免后处理开销。
 const spot=new THREE.SpotLight('#fff0d8',55,45,.46,.8,1.2);spot.position.set(0,14,4);spot.target.position.set(0,0,0);scene.add(spot,spot.target);
 const beam=new THREE.Mesh(new THREE.ConeGeometry(5.8,15,32,1,true),new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,vertexShader:'varying vec2 vUv;varying vec3 vNormal,vView;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalMatrix*normal;vView=-p.xyz;gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec2 vUv;varying vec3 vNormal,vView;void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),3.);float fade=sin(vUv.y*3.14159);gl_FragColor=vec4(.55,.8,1.,edge*fade*.035);}'}));beam.position.set(0,7.5,0);scene.add(beam);
 const heroPool=new THREE.Mesh(new THREE.PlaneGeometry(23,23),new THREE.MeshBasicMaterial({map:poolTexture,color:'#8de9ff',transparent:true,opacity:.38,depthWrite:false,blending:THREE.AdditiveBlending}));heroPool.rotation.x=-Math.PI/2;heroPool.position.y=.008;scene.add(heroPool);
 const wallBack=new THREE.Mesh(createScreenGeometry(),createScreenMaterial());wallBack.position.set(0,7.5,GARAGE_WALL_DEPTH);scene.add(wallBack);
 const wallFront=new THREE.Mesh(wallBack.geometry,createScreenMaterial());wallFront.position.copy(wallBack.position);wallFront.position.z+=.02;scene.add(wallFront);
 const screenGlow=new THREE.Mesh(new THREE.PlaneGeometry(76,28),new THREE.MeshBasicMaterial({map:poolTexture,color:'#79c9e8',transparent:true,opacity:.11,depthWrite:false,blending:THREE.AdditiveBlending}));screenGlow.position.set(0,16,GARAGE_WALL_DEPTH-.5);scene.add(screenGlow);
 const floorGlow=new THREE.Mesh(new THREE.PlaneGeometry(70,30),screenGlow.material);floorGlow.rotation.x=-Math.PI/2;floorGlow.position.set(0,.004,GARAGE_WALL_DEPTH+8);scene.add(floorGlow);
 const wallLoader=new THREE.TextureLoader();
 function loadWall(id){
  const generation=++wallGeneration;
  wallLoader.load(trackPreview(id).image,texture=>{
   if(disposed||generation!==wallGeneration){texture.dispose();return;}
   configureScreenTexture(texture,renderer.capabilities.getMaxAnisotropy());
   const previous=wallBack.material.uniforms.map.value,current=wallFront.material.uniforms.map.value;
   wallBack.material.uniforms.map.value=current;
   if(previous&&previous!==current)previous.dispose();
   wallFront.material.uniforms.map.value=texture;wallFade=reducedMotion()?1:0;
  },undefined,()=>{if(!disposed)console.warn('地图实景加载失败');});
 }
 const geometry={
  podium:new THREE.LatheGeometry([[0,0],[2.4,0],[2.52,.06],[2.52,.19],[2.43,.28],[0,.28]].map(([x,y])=>new THREE.Vector2(x,y)),80),
  ring:new THREE.TorusGeometry(PODIUM_RADIUS,.024,6,80),top:new THREE.CircleGeometry(2.37,80),pool:new THREE.PlaneGeometry(9,9),indicator:new THREE.RingGeometry(.1,.17,24),
 };
 const seats=Array.from({length:6},(_,i)=>new SeatObject(i,scene,geometry,poolTexture));
 for(const seat of seats)seat.onReady=()=>playSound('garageReady');
 const plates=seats.map((_,i)=>{const plate=element('div','grg-plate');plate.dataset.seat=i;overlay.append(plate);return plate;});
 const camera=new THREE.PerspectiveCamera(38,1,.1,160),projected=new THREE.Vector3();
 const enteredAt=performance.now();
 let selfSeat=0,entryAge=0,mapAge=5,trackId=-1,wallGeneration=0,wallFade=0,transitionAge=null,transitionStart=0;
 let layout=Array(6).fill(null),room=null,selfId=null,connected=false,disposed=false,raf=0,lastTime=0,visible=true,width=1,height=1;
 const loader=createSeatLoader(loadCar,(car,i,data)=>seats[i].attach(car,data),(car,i)=>seats[i].detach(car),(error,i)=>{plates[i].dataset.loadError='true';console.error('展厅车辆加载失败',error);});
 function positionPlates() {
  camera.updateMatrixWorld();scene.updateMatrixWorld(true);
  const boxes=seats.map(seat=>seat.car?projectCarBounds(seat.carBounds,seat.car.matrixWorld,camera,width,height):null);
  stage.style.setProperty('--grg-plate-width','112px');
  const sizes=plates.map(plate=>({width:plate.offsetWidth,height:plate.offsetHeight}));
  const anchors=seats.map((_,i)=>{
   const {x,z}=seatPosition(i,selfSeat);projected.set(x,-.18,z+(i===selfSeat?5.1:3.4)).project(camera);
   return {i,x:(projected.x*.5+.5)*width,y:Math.min(height-sizes[i].height-12,(-projected.y*.5+.5)*height+10),...sizes[i]};
  }).sort((a,b)=>a.y-b.y);
  const occupied=boxes.filter(Boolean);
  for(const anchor of anchors){
   const i=anchor.i,rect=placePlate(anchor,occupied,width,height);occupied.push(rect);
   plates[i].style.left=`${rect.left+sizes[i].width/2}px`;plates[i].style.top=`${rect.top}px`;
  }
 }
 function paintPlates() {
  const isHost=room?.hostId===selfId,canManage=isHost&&room?.phase==='lobby',disabled=connected?'':' disabled';
  for(let i=0;i<6;i++) {
   const data=layout[i],plate=plates[i];plate.className=`grg-plate${data?'':' grg-plate--empty'}${data?.ready?' grg-plate--ready':''}${data?.isSelf?' grg-plate--self':''}${data?.connected===false?' grg-plate--disconnected':''}`;
   plate.style.setProperty('--seat-color',new THREE.Color(data?.color||'#647887').getStyle());
   if(!data) plate.innerHTML=`<span class="grg-plate__seat">0${i+1}</span><span class="grg-plate__name">${escapeHtml(t('room.emptySeat'))}</span>${canManage?`<button class="grg-plate__add"${disabled}>${escapeHtml(t('room.addBotSeat'))}</button>`:''}`;
   else {
    const name=data.bot?t('room.botName',{difficulty:t('race.'+data.difficulty)}):data.name;
    const label=data.bot?t('room.bot'):name;
    plate.innerHTML=`<div class="grg-plate__header"><span class="grg-plate__dot"></span><span class="grg-plate__name" title="${escapeHtml(name)}">${escapeHtml(label)}</span>${data.isHost?`<span class="grg-plate__crown" title="${escapeHtml(t('room.host'))}">♛</span>`:''}${data.isSelf?`<span class="grg-plate__you">${escapeHtml(t('room.you'))}</span>`:''}${canManage&&data.bot?`<button class="grg-plate__remove" aria-label="${escapeHtml(t('room.removeBot',{name}))}"${disabled}>×</button>`:''}</div><div class="grg-plate__footer">${data.bot?`<span>${escapeHtml(t('race.'+data.difficulty))}</span>`:''}<span class="grg-plate__status">${escapeHtml(t(!data.connected?'room.disconnected':data.ready?'room.readyState':'room.waiting'))}</span></div>`;
   }
   plate.querySelector('.grg-plate__add')?.addEventListener('click',onAddBot);
   plate.querySelector('.grg-plate__remove')?.addEventListener('click',()=>onRemoveBot(data.id));
  }
 }
 // 与单人 capture 一样，仅显式验收模式暴露只读渲染诊断。
 const captureFrames=[];let captureLast=0;
 const captureEnabled=new URLSearchParams(location.search).has('garageCapture');
 if(captureEnabled)renderer.domElement.garageProbe={
  reset(){captureFrames.length=0;captureLast=0;},
  read(){
   const carBoxes=seats.map((seat,i)=>({seat:i,...(seat.car?projectCarBounds(seat.carBounds,seat.car.matrixWorld,camera,width,height):{})}));
   const mean=captureFrames.reduce((a,b)=>a+b,0)/captureFrames.length;
   const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
   const texture=wallFront.material.uniforms.map.value;
   return {wallImage:texture?.image?.src,wallOpacity:wallFade,wallSize:{width:texture?.image?.width,height:texture?.image?.height},anisotropy:texture?.anisotropy,mipmaps:texture?.generateMipmaps,colorSpace:texture?.colorSpace,carBoxes,feedback:seats[selfSeat].feedback,headlights:seats[selfSeat].lamps?.map(lamp=>lamp.emissiveIntensity),pixelRatio:renderer.getPixelRatio(),fps:1000/mean,meanMs:mean,p95Ms:[...captureFrames].sort((a,b)=>a-b)[Math.floor(captureFrames.length*.95)],frames:captureFrames.length,heroHeight:carBoxes[selfSeat].bottom-carBoxes[selfSeat].top,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  }
 };
 function shouldRun() { return !disposed&&!!room&&(room.phase==='lobby'||room.phase==='countdown'||room.phase==='racing')&&visible&&!document.hidden; }
 function stop() { if(raf) cancelAnimationFrame(raf);raf=0; }
 function render(now) {
  raf=0;if(!shouldRun())return;
  if(captureEnabled){if(captureLast)captureFrames.push(now-captureLast);captureLast=now;}
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  entryAge=Math.max(0,(now-enteredAt)/1000);mapAge+=dt;if(transitionAge!==null)transitionAge=Math.max(0,(now-transitionStart)/1000);
  const reduced=reducedMotion(),entry=cameraProgress(entryAge,1.2,reduced),push=(1-cameraProgress(mapAge,1.1,reduced))*.9;
  const rush=transitionAge===null||reduced?0:cameraProgress(transitionAge,.8,false);
  camera.position.set(0,7.2-rush*3+(1-entry)*4,16.4+(1-entry)*10+push-rush*10);
  camera.lookAt(0,1.9,-1.8+rush*2);camera.updateMatrixWorld();
  for(const seat of seats)seat.update(dt,!reduced,camera);
  positionPlates();
  wallFade=wallFront.material.uniforms.map.value?Math.min(1,wallFade+dt*1.5):0;
  wallFront.material.uniforms.opacity.value=wallFade;wallBack.material.uniforms.opacity.value=wallBack.material.uniforms.map.value?1-wallFade:0;
  renderer.render(scene,camera);raf=requestAnimationFrame(render);
 }
 function resume() { if(shouldRun()&&!raf){lastTime=performance.now();raf=requestAnimationFrame(render);}else if(!shouldRun())stop(); }
 function resize(nextReserve) {
  if(disposed)return;if(nextReserve)reserve=nextReserve;
  const oldWidth=width,oldHeight=height;
  const W=container.clientWidth||800,H=container.clientHeight||600;
  const right=Math.max(0,reserve.right||0),bottom=Math.max(0,reserve.bottom||0),freeWidth=Math.max(1,W-right);
  width=freeWidth<900?Math.max(1050,freeWidth):freeWidth;height=Math.max(260,H-bottom);
  viewport.style.right=`${right}px`;viewport.style.bottom=`${bottom}px`;stage.style.width=`${width}px`;stage.style.height=`${height}px`;
  renderer.setSize(width,height,false);fitGarageCamera(camera,width,height);positionPlates();
  if(freeWidth<900&&(oldWidth!==width||oldHeight!==height))viewport.scrollLeft=(width-freeWidth)/2;
 }
 const observer=new ResizeObserver(()=>resize());observer.observe(container);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;resume();});intersection.observe(container);
 const visibility=()=>resume();document.addEventListener('visibilitychange',visibility);
 resize();
 return {
  update(nextRoom,nextSelfId,nextConnected) {
   if(disposed)return;room=nextRoom;selfId=nextSelfId;connected=nextConnected;
   layout=buildSeatLayout(room,selfId);selfSeat=Math.max(0,layout.findIndex(p=>p?.isSelf));
   for(let i=0;i<6;i++){const p=seatPosition(i,selfSeat);seats[i].root.position.set(p.x,0,p.z);}
   loader.update(layout);
   if((room.trackId||1)!==trackId){trackId=room.trackId||1;mapAge=0;loadWall(trackId);}
   if(room.phase==='lobby')transitionAge=null;
   for(let i=0;i<6;i++)seats[i].setData(layout[i]);paintPlates();positionPlates();resume();
  },
  resize,
  transition(){transitionStart=performance.now();transitionAge=0;resume();},
  dispose() {
   if(disposed)return;disposed=true;stop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);
   loader.dispose();for(const seat of seats)seat.dispose();
   for(const texture of new Set([wallBack.material.uniforms.map.value,wallFront.material.uniforms.map.value]))texture?.dispose();
   disposeGarageObject(scene);scene.clear();seats.length=0;plates.length=0;environment.dispose();renderer.dispose();renderer.forceContextLoss();viewport.remove();room=null;layout=[];
  },
 };
}
