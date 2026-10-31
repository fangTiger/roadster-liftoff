/** 豪华发布会展厅：独立渲染器、可滚动展区与投影铭牌。 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSeatLoader, disposeGarageObject, disposeGarageCar } from './garage-cars.js';
const SEAT_COUNT = 6;
const PODIUM_RADIUS = 2.45;
const PODIUM_HEIGHT = .28;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 等距浅弧，避免外侧展台在透视下挤压相邻铭牌。 */
export function seatPosition(index) {
 const x = (index - 2.5) * 5.65;
 const z = 27 - Math.sqrt(27 * 27 - x * x) - 6;
 return { x, z, angle: Math.atan2(x, 27 - z - 6) };
}

/** 从展台边界拟合透视镜头；reserve 由外层可视展区精确扣除。 */
export function fitGarageCamera(camera, width, height) {
 camera.aspect = width / height;
 const target = new THREE.Vector3(0, 1, -3.5), point = new THREE.Vector3();
 let distance = 24;
 for (; distance < 140; distance += .25) {
  camera.position.copy(target).add(new THREE.Vector3(0, .45, .893).multiplyScalar(distance));
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  let fits = true;
  for (let i = 0; i < 6; i++) {
   const { x, z } = seatPosition(i);
   for (const dx of [-2.7, 2.7]) for (const y of [-1.4, 3.5]) for (const dz of [-2.6, 3.2]) {
    point.set(x + dx, y, z + dz).project(camera);
    if (Math.abs(point.x) > .93 || Math.abs(point.y) > .78) fits = false;
   }
  }
  if (fits) break;
 }
 return target;
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
  if (changed && animate && !reducedMotion()) this.pulse = .6;
  if (this.car) this.car.visible = true;
 }
 attach(car, data) {
  this.car = car; this.age = 0; this.rotation = -.55 + this.index * .15;
  car.position.set(0,PODIUM_HEIGHT,0); car.rotation.y = this.rotation; this.root.add(car);
  this.setData(data,false);
 }
 detach(car) {
  if (this.car === car) this.car = null;
  if (reducedMotion()) disposeGarageCar(car);
  else this.outgoing.push({car,time:0});
  this.setData(null,false);
 }
 update(dt, motion) {
  this.age += dt;
  if (this.car) {
   if (motion) this.rotation += dt * Math.PI / 25;
   this.car.rotation.y = this.rotation;
   const entering = motion ? Math.max(0,1-this.age/.65) : 0;
   this.car.position.y = PODIUM_HEIGHT + entering ** 3 * 2;
   this.car.scale.setScalar(1 - entering ** 3 * .18);
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
 // 建筑墙的竖向渐变与立柱，留出真正的后景距离。
 const wallCanvas = document.createElement('canvas');wallCanvas.width=8;wallCanvas.height=256;
 const ctx=wallCanvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
 gradient.addColorStop(0,'#080d15');gradient.addColorStop(.64,'#1c3446');gradient.addColorStop(1,'#0d1721');ctx.fillStyle=gradient;ctx.fillRect(0,0,8,256);
 const wallTexture=new THREE.CanvasTexture(wallCanvas);wallTexture.colorSpace=THREE.SRGBColorSpace;
 const wall=new THREE.Mesh(new THREE.PlaneGeometry(110,30),new THREE.MeshBasicMaterial({map:wallTexture}));wall.position.set(0,13,-19);scene.add(wall);
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
 for (const x of [-18,-12,-6,0,6,12,18]) {
  const rib=new THREE.Mesh(new THREE.BoxGeometry(.05,18,.12),metal);rib.position.set(x,8,-18.8);scene.add(rib);
 }
 // 地面嵌缝和后沿灯带让透视方向可读，亮度保持克制。
 const seams=new THREE.MeshBasicMaterial({color:'#26323c'});
 for (let x=-40;x<=40;x+=6) {
  const seam=new THREE.Mesh(new THREE.PlaneGeometry(.018,80),seams);seam.rotation.x=-Math.PI/2;seam.position.set(x,-.008,0);scene.add(seam);
 }
 const horizon=new THREE.Mesh(new THREE.BoxGeometry(44,.035,.04),strip);horizon.position.set(0,.16,-17);scene.add(horizon);
 return environment;
}

/** API 保留 update/resize/dispose；底部抽屉或右列尺寸通过 reserve 更新。 */
export function createGarage({container,loadCar,t=k=>k,onAddBot=()=>{},onRemoveBot=()=>{},reserve={}}={}) {
 if (!container) throw new Error('展厅缺少容器');
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
 const viewport=element('div','grg-viewport'),stage=element('div','grg-stage'),overlay=element('div','grg-overlay');
 renderer.domElement.className='grg-canvas';stage.append(renderer.domElement,overlay);viewport.append(stage);container.append(viewport);
 const scene=new THREE.Scene(),environment=buildEnvironment(scene,renderer);
 const poolTexture=glowTexture();
 const geometry={
  podium:new THREE.LatheGeometry([[0,0],[2.4,0],[2.52,.06],[2.52,.19],[2.43,.28],[0,.28]].map(([x,y])=>new THREE.Vector2(x,y)),80),
  ring:new THREE.TorusGeometry(PODIUM_RADIUS,.024,6,80),top:new THREE.CircleGeometry(2.37,80),pool:new THREE.PlaneGeometry(9,9),indicator:new THREE.RingGeometry(.1,.17,24),
 };
 const seats=Array.from({length:6},(_,i)=>new SeatObject(i,scene,geometry,poolTexture));
 const plates=seats.map((_,i)=>{const plate=element('div','grg-plate');plate.dataset.seat=i;overlay.append(plate);return plate;});
 const camera=new THREE.PerspectiveCamera(38,1,.1,160),projected=new THREE.Vector3();
 let layout=Array(6).fill(null),room=null,selfId=null,connected=false,disposed=false,raf=0,lastTime=0,visible=true,width=1,height=1;
 const loader=createSeatLoader(loadCar,(car,i,data)=>seats[i].attach(car,data),(car,i)=>seats[i].detach(car),(error,i)=>{plates[i].dataset.loadError='true';console.error('展厅车辆加载失败',error);});
 function positionPlates() {
  camera.updateMatrixWorld();
  const positions=[];
  for(let i=0;i<6;i++) {
   const {x,z}=seatPosition(i);projected.set(x,-.18,z+2.6).project(camera);
   positions.push((projected.x*.5+.5)*width);
   plates[i].style.left=`${(projected.x*.5+.5)*width}px`;plates[i].style.top=`${(-projected.y*.5+.5)*height+8}px`;
  }
  const spacing=Math.min(...positions.slice(1).map((x,i)=>x-positions[i]));stage.style.setProperty('--grg-plate-width',`${Math.min(142,Math.floor(spacing-10))}px`);
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
 function shouldRun() { return !disposed&&!!room&&room.phase==='lobby'&&visible&&!document.hidden; }
 function stop() { if(raf) cancelAnimationFrame(raf);raf=0; }
 function render(now) {
  raf=0;if(!shouldRun())return;
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  for(const seat of seats)seat.update(dt,!reducedMotion());
  renderer.render(scene,camera);raf=requestAnimationFrame(render);
 }
 function resume() { if(shouldRun()&&!raf){lastTime=performance.now();raf=requestAnimationFrame(render);}else if(!shouldRun())stop(); }
 function resize(nextReserve) {
  if(disposed)return;if(nextReserve)reserve=nextReserve;
  const W=container.clientWidth||800,H=container.clientHeight||600;
  const right=Math.max(0,reserve.right||0),bottom=Math.max(0,reserve.bottom||0),freeWidth=Math.max(1,W-right);
  width=freeWidth<900?Math.max(1050,freeWidth):freeWidth;height=Math.max(260,H-bottom);
  viewport.style.right=`${right}px`;viewport.style.bottom=`${bottom}px`;stage.style.width=`${width}px`;stage.style.height=`${height}px`;
  renderer.setSize(width,height,false);fitGarageCamera(camera,width,height);positionPlates();
 }
 const observer=new ResizeObserver(()=>resize());observer.observe(container);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;resume();});intersection.observe(container);
 const visibility=()=>resume();document.addEventListener('visibilitychange',visibility);
 resize();
 return {
  update(nextRoom,nextSelfId,nextConnected) {
   if(disposed)return;room=nextRoom;selfId=nextSelfId;connected=nextConnected;
   layout=buildSeatLayout(room,selfId);loader.update(layout);
   for(let i=0;i<6;i++)seats[i].setData(layout[i]);paintPlates();positionPlates();resume();
  },
  resize,
  dispose() {
   if(disposed)return;disposed=true;stop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);
   loader.dispose();for(const seat of seats)seat.dispose();disposeGarageObject(scene);scene.clear();seats.length=0;plates.length=0;environment.dispose();renderer.dispose();renderer.forceContextLoss();viewport.remove();room=null;layout=[];
  },
 };
}
