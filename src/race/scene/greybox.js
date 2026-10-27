import * as THREE from 'three';
import { coinPositions } from '../sim/physics.js';
const COLORS=[0x343a40,0xe9d7c5,0xb98456,0x8b8378,0xe4dbbf,0x804d3b,0x593f33];
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
 const terrain=new THREE.BufferGeometry();terrain.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));terrain.setAttribute('color',new THREE.Float32BufferAttribute(col,3));terrain.setIndex(idx);terrain.computeVertexNormals();const ground=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.receiveShadow=true;scene.add(ground);
 const gap=track.features.find(f=>f.type==='gap');
 function ribbon(path,left,right,color,skipGap=false){const p=[],indices=[];let count=0;
  for(let s=0;s<path.length;s+=2){if(skipGap&&gap&&s+2>=gap.from&&s<=gap.to)continue;const a=path.at(s),b=path.at(Math.min(path.length,s+2));for(const [q,l] of [[a,left(a)],[a,right(a)],[b,left(b)],[b,right(b)]])p.push(q.x-q.tz*l,q.y+l*q.bank+.04,q.z+q.tx*l);indices.push(count,count+2,count+1,count+1,count+2,count+3);count+=4;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();scene.add(new THREE.Mesh(g,material(color,{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4})));
 }
 for(const path of [{at:track.at,length:track.length},...track.branches]){ribbon(path,p=>-p.w/2,p=>p.w/2,0x30383d,path.length===track.length);for(const side of [-1,1])ribbon(path,p=>side*p.w/2,p=>side*(p.w/2+.65),0xeee1d1,path.length===track.length);}
 // 交替红白路肩，单独用实例避免上千个 draw call。
 const curbGeo=new THREE.BoxGeometry(1,.08,2),curbs=[];
 for(let s=0;s<track.length;s+=4){if(gap&&s>=gap.from&&s<=gap.to)continue;const p=track.at(s);for(const side of [-1,1])curbs.push({x:p.x-p.tz*side*(p.w/2+.32),y:p.y+side*(p.w/2+.32)*p.bank+.08,z:p.z+p.tx*side*(p.w/2+.32),yaw:Math.atan2(p.tx,p.tz)});}
 const curbMesh=new THREE.InstancedMesh(curbGeo,material(0xb44839,{polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6}),curbs.length),dummy=new THREE.Object3D();curbs.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.yaw;dummy.updateMatrix();curbMesh.setMatrixAt(i,dummy.matrix);});scene.add(curbMesh);
 const wallGeo=new THREE.BoxGeometry(1,1,1),wallMesh=new THREE.InstancedMesh(wallGeo,material(0x77685e),track.walls.length);
 track.walls.forEach((w,i)=>{const x=(w.a.x+w.b.x)/2,z=(w.a.z+w.b.z)/2,n=track.nearest(x,z),height=w.type==='slot'?7:1.1;dummy.position.set(x,n.y+height/2,z);dummy.rotation.set(0,Math.atan2(w.b.x-w.a.x,w.b.z-w.a.z),0);dummy.scale.set(.35,height,Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z));dummy.updateMatrix();wallMesh.setMatrixAt(i,dummy.matrix);});scene.add(wallMesh);
 for(const g of track.checkpointGates){const yaw=Math.atan2(g.tx,g.tz);box(g.x,g.y+7.2,g.z,14,.22,.3,0x77cbb0,yaw);   // 只留门顶横杆作标记，半透明门面会挡视线}
 for(const f of track.features){const yaw=Math.atan2(f.tx,f.tz);
  if(f.type==='boost')box(f.x,f.y+.1,f.z,f.width,.06,f.length,0x21b6ec,yaw,{emissive:0x087cbb,emissiveIntensity:1.5});
  if(f.type==='cones')for(const item of f.items){const n=track.nearest(item.x,item.z);mesh(item.kind==='concrete'?new THREE.CylinderGeometry(item.radius,item.radius,1.4,10):new THREE.ConeGeometry(.38,1,8),item.kind==='concrete'?0xaaa69c:0xf07826,item.x,n.y+.7,item.z);}
  if(f.type==='tunnel'){for(let s=f.from;s<f.to;s+=8){const p=track.at(s);box(p.x,p.y+f.height+.3,p.z,p.w+3,.6,8.5,0x756e65,Math.atan2(p.tx,p.tz));}}
  if(f.type==='slot')for(const side of [-1,1])box(f.x-f.tz*side*(f.width/2+f.rockRadius),f.y+3.5,f.z+f.tx*side*(f.width/2+f.rockRadius),2*f.rockRadius,7,2*f.rockRadius,0x84513b,yaw);
 }
 if(gap)for(const s of [gap.from-1,gap.to+1]){const p=track.at(s);box(p.x,p.y-2,p.z,p.w,4,1,0x9b8c7a,Math.atan2(p.tx,p.tz));}
 const coins=coinPositions(track).map(c=>({data:c,mesh:mesh(new THREE.CylinderGeometry(.5,.5,.13,12),0xffc640,c.x,c.y,c.z,{metalness:.65,roughness:.25,emissive:0x5e3700})}));for(const c of coins)c.mesh.rotation.z=Math.PI/2;
 const rocks=track.features.filter(f=>f.type==='rockfall').map(f=>mesh(new THREE.SphereGeometry(f.radius,12,8),f.kind==='tumbleweed'?0x967d4e:0x655649,0,-100,0));
 function update(snapshot){for(const c of coins){c.mesh.visible=snapshot.car.picked[c.data.id]!==snapshot.car.lap;c.mesh.rotation.y=snapshot.step/60;}for(const r of rocks)r.visible=false;for(const p of snapshot.hazards){const r=rocks[p.id];r.visible=true;r.position.set(p.x,p.y,p.z);r.rotation.z=snapshot.step/25;}}
 return {update};
}
