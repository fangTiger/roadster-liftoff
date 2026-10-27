import * as THREE from 'three';
import { coinPositions } from '../sim/physics.js';
// 地表配色（高山草甸）：路面、路肩、路外草地、碎石、开阔平地、岩壁、峡谷
// 顶点色作为草地贴图的染色：路外草地保持原色，开阔平地略亮，碎石、岩壁偏灰
const COLORS=[0x343a40,0xe9d7c5,0x9fbf6e,0xb4ae9c,0xaecb7a,0x9d978d,0x5a554c];
export function createGreybox(scene,track) {
 // 天空、环境光与太阳见 sky.js
 const materials=new Map();
 const material=(color,extra={})=>{const key=color+JSON.stringify(extra);if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.85,...extra}));return materials.get(key);};
 function mesh(geometry,color,x,y,z,extra){const o=new THREE.Mesh(geometry,material(color,extra));o.position.set(x,y,z);scene.add(o);return o;}
 function box(x,y,z,w,h,d,color,yaw=0,extra){const o=mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,extra);o.rotation.y=yaw;return o;}
 // 高度场低分辨率网格；保留道路下方间隙，桥面单独生成。
 const hf=track.heightfield,stride=4,nx=Math.ceil((hf.width-1)/stride),nz=Math.ceil((hf.height-1)/stride),pos=[],col=[],idx=[];
 for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const x=hf.x0+Math.min(ix*stride,hf.width-1)*hf.step,z=hf.z0+Math.min(iz*stride,hf.height-1)*hf.step,n=track.nearest(x,z);let y=track.heightAt(x,z)-.12;
  // 粗网格在弯道处会把地面插值顶穿路面（拐角闪烁的来源之一）：路面附近的顶点一律压到路面以下
  if(n.distance<n.w/2+10)y=Math.min(y,n.y+n.lateral*n.bank-.35);
  pos.push(x,y,z);const color=new THREE.Color(COLORS[track.surfaceAt(x,z)]);col.push(color.r,color.g,color.b);
 }
 for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const a=iz*(nx+1)+ix,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d);}
 const terrain=new THREE.BufferGeometry();terrain.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));terrain.setAttribute('color',new THREE.Float32BufferAttribute(col,3));terrain.setIndex(idx);terrain.computeVertexNormals();
 // 临时草地贴图（第一版用过的 Poly Haven Grass Ground），按世界坐标每 7 米平铺一次；正式地形在第 3 批
 const uv=[];for(let i=0;i<pos.length;i+=3)uv.push(pos[i]/7,pos[i+2]/7);terrain.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 const grass=new THREE.TextureLoader().load('/assets/tex/grass_ground_diff.webp');grass.colorSpace=THREE.SRGBColorSpace;grass.wrapS=grass.wrapT=THREE.RepeatWrapping;grass.anisotropy=8;
 const ground=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({vertexColors:true,map:grass,roughness:1}));ground.receiveShadow=true;scene.add(ground);
 const gap=track.features.find(f=>f.type==='gap');
 // 沿路带：left/right 为横向范围（米），UV 按世界米数（u 横向、v 沿路），贴图按米平铺
 function ribbon(path,left,right,mat,skipGap=false,lift=0){const p=[],uv=[],indices=[];let count=0;
  for(let s=0;s<path.length;s+=2){if(skipGap&&gap&&s+2>=gap.from&&s<=gap.to)continue;const s2=Math.min(path.length,s+2),a=path.at(s),b=path.at(s2);for(const [q,l,v] of [[a,left(a),s],[a,right(a),s],[b,left(b),s2],[b,right(b),s2]]){p.push(q.x-q.tz*l,q.y+l*q.bank+.04+lift,q.z+q.tx*l);uv.push(l,v);}indices.push(count,count+2,count+1,count+1,count+2,count+3);count+=4;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);
 }
 const tl=new THREE.TextureLoader(),offset={polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4};
 // 真实赛道柏油（Poly Haven Asphalt Track，颜色 + 法线 + 粗糙度），每 5 米平铺
 const pbr=(base,metres)=>{const maps={};for(const [k,f] of [['map','diff'],['normalMap','nor'],['roughnessMap','rough']]){const t=tl.load(`${base}_${f}.webp`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/metres,1/metres);t.anisotropy=8;if(k==='map')t.colorSpace=THREE.SRGBColorSpace;maps[k]=t;}return maps;};
 const asphalt=new THREE.MeshStandardMaterial({...pbr('/assets/race/tex/asphalt_track',5),side:THREE.DoubleSide,...offset});
 // 路肩：红白相间，每 1.5 米换色；白色边线
 const stripe=document.createElement('canvas');stripe.width=8;stripe.height=64;{const g=stripe.getContext('2d');g.fillStyle='#c8302a';g.fillRect(0,0,8,32);g.fillStyle='#efece6';g.fillRect(0,32,8,32);}
 const stripeTex=new THREE.CanvasTexture(stripe);stripeTex.colorSpace=THREE.SRGBColorSpace;stripeTex.wrapS=stripeTex.wrapT=THREE.RepeatWrapping;stripeTex.repeat.set(1,1/3);stripeTex.magFilter=THREE.NearestFilter;
 const curbMat=new THREE.MeshStandardMaterial({map:stripeTex,roughness:.55,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6});
 const lineMat=new THREE.MeshStandardMaterial({color:0xcfccc4,roughness:.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-8});
 for(const path of [{at:track.at,length:track.length},...track.branches]){const main=path.length===track.length;ribbon(path,p=>-p.w/2,p=>p.w/2,asphalt,main);
  for(const side of [-1,1]){ribbon(path,p=>side*(p.w/2-.55),p=>side*(p.w/2-.3),lineMat,main,.005);ribbon(path,p=>side*p.w/2,p=>side*(p.w/2+.95),curbMat,main,.02);}}
 const dummy=new THREE.Object3D();
 // 护墙：水泥质感
 const concrete=pbr('/assets/race/tex/brushed_concrete',2);
 const wallGeo=new THREE.BoxGeometry(1,1,1),wallMesh=new THREE.InstancedMesh(wallGeo,new THREE.MeshStandardMaterial({...concrete,color:0xd8d4cb}),track.walls.length);wallMesh.castShadow=wallMesh.receiveShadow=true;
 track.walls.forEach((w,i)=>{const x=(w.a.x+w.b.x)/2,z=(w.a.z+w.b.z)/2,n=track.nearest(x,z),height=w.type==='slot'?7:1.1;dummy.position.set(x,n.y+height/2,z);dummy.rotation.set(0,Math.atan2(w.b.x-w.a.x,w.b.z-w.a.z),0);dummy.scale.set(.35,height,Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z));dummy.updateMatrix();wallMesh.setMatrixAt(i,dummy.matrix);});scene.add(wallMesh);
 for(const g of track.checkpointGates){const yaw=Math.atan2(g.tx,g.tz);box(g.x,g.y+7.2,g.z,14,.22,.3,0x77cbb0,yaw);/* 只留门顶横杆作标记，半透明门面会挡视线 */}
 const chev=document.createElement('canvas');chev.width=64;chev.height=64;{const g=chev.getContext('2d');g.fillStyle='#0b4f9c';g.fillRect(0,0,64,64);g.strokeStyle='#e9f6ff';g.lineWidth=9;g.lineJoin='miter';g.beginPath();g.moveTo(8,44);g.lineTo(32,20);g.lineTo(56,44);g.stroke();}
 const boostTex=new THREE.CanvasTexture(chev);boostTex.colorSpace=THREE.SRGBColorSpace;boostTex.wrapS=boostTex.wrapT=THREE.RepeatWrapping;boostTex.repeat.set(1,5);boostTex.anisotropy=8;
 const boostMat=new THREE.MeshStandardMaterial({map:boostTex,emissive:0x2a8cff,emissiveMap:boostTex,emissiveIntensity:.3,roughness:.4,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-10});
 for(const f of track.features){const yaw=Math.atan2(f.tx,f.tz);
  if(f.type==='boost'){const pad=new THREE.Mesh(new THREE.PlaneGeometry(f.width,f.length),boostMat);pad.rotation.set(-Math.PI/2,yaw+Math.PI,0,'YXZ');/* 放平后转向：贴图上方（箭头尖）指向行进方向 */pad.position.set(f.x,f.y+.07,f.z);scene.add(pad);}
  if(f.type==='cones')for(const item of f.items){const n=track.nearest(item.x,item.z);mesh(item.kind==='concrete'?new THREE.CylinderGeometry(item.radius,item.radius,1.4,10):new THREE.ConeGeometry(.38,1,8),item.kind==='concrete'?0xaaa69c:0xf07826,item.x,n.y+.7,item.z);}
  if(f.type==='tunnel'){for(let s=f.from;s<f.to;s+=8){const p=track.at(s);box(p.x,p.y+f.height+.3,p.z,p.w+3,.6,8.5,0x756e65,Math.atan2(p.tx,p.tz));}}
  if(f.type==='slot')for(const side of [-1,1])box(f.x-f.tz*side*(f.width/2+f.rockRadius),f.y+3.5,f.z+f.tx*side*(f.width/2+f.rockRadius),2*f.rockRadius,7,2*f.rockRadius,0x84513b,yaw);
 }
 if(gap)for(const s of [gap.from-1,gap.to+1]){const p=track.at(s);box(p.x,p.y-2,p.z,p.w,4,1,0x9b8c7a,Math.atan2(p.tx,p.tz));}
 const coins=coinPositions(track).map(c=>({data:c,mesh:mesh(new THREE.CylinderGeometry(.5,.5,.13,12),0xffc640,c.x,c.y,c.z,{metalness:.65,roughness:.25,emissive:0x5e3700})}));for(const c of coins)c.mesh.rotation.z=Math.PI/2;
 const rocks=track.features.filter(f=>f.type==='rockfall').map(f=>mesh(new THREE.SphereGeometry(f.radius,12,8),f.kind==='tumbleweed'?0x967d4e:0x655649,0,-100,0));
 function update(snapshot){boostTex.offset.y=-snapshot.step/120*1.6;for(const c of coins){c.mesh.visible=snapshot.car.picked[c.data.id]!==snapshot.car.lap;c.mesh.rotation.y=snapshot.step/60;}for(const r of rocks)r.visible=false;for(const p of snapshot.hazards){const r=rocks[p.id];r.visible=true;r.position.set(p.x,p.y,p.z);r.rotation.z=snapshot.step/25;}}
 return {update};
}
