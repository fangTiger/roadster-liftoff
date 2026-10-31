import * as THREE from 'three';
// 固定容量与原位缓冲写入；烟迹、水花、火星共用一套更新路径。
export function createItemParticles(root,own) {
 let seed=193;const rnd=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 const pools=new Map();
 for(const [kind,count,color,additive] of [['smoke',192,0x667078,false],['sparks',384,0xffc374,true],['water',192,0x9fefff,true]]){
  const geometry=own(new THREE.BufferGeometry()),position=new THREE.Float32BufferAttribute(new Float32Array(count*3),3),alpha=new THREE.Float32BufferAttribute(new Float32Array(count),1),size=new THREE.Float32BufferAttribute(new Float32Array(count),1);
  for(const attr of [position,alpha,size])attr.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',position);geometry.setAttribute('alpha',alpha);geometry.setAttribute('size',size);
  const material=own(new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(color)}},vertexShader:`attribute float alpha;attribute float size;varying float opacity;void main(){opacity=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*300./max(1.,-p.z),1.,96.);gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform vec3 color;varying float opacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(color,opacity*pow(1.-d*d,2.));\n#include <colorspace_fragment>\n}`,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,toneMapped:false}));
  const points=new THREE.Points(geometry,material);points.name='item-'+kind;points.frustumCulled=false;points.renderOrder=additive?7:4;root.add(points);
  pools.set(kind,{points,position,alpha,size,cursor:0,slots:Array.from({length:count},()=>({born:-Infinity,life:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:1}))});
 }
 const debrisGeometry=own(new THREE.TetrahedronGeometry(.16)),debrisMaterial=own(new THREE.MeshStandardMaterial({color:0x8f6751,metalness:.75,roughness:.4})),debris=own(new THREE.InstancedMesh(debrisGeometry,debrisMaterial,64)),dummy=new THREE.Object3D();debris.name='item-debris';debris.frustumCulled=false;debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(debris);
 const shards=Array.from({length:64},()=>({born:-Infinity,life:.5,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:1}));let shardIndex=0;
 function emit(kind,time,x,y,z,count=1,force=1){
  const pool=pools.get(kind);
  if(kind==='debris'){for(let i=0;i<count;i++){const p=shards[shardIndex++%shards.length],angle=rnd()*Math.PI*2;p.born=time;p.x=x;p.y=y;p.z=z;p.vx=Math.cos(angle)*force;p.vy=(1+rnd()*2)*force;p.vz=Math.sin(angle)*force;p.size=.5+rnd();}return;}
  for(let i=0;i<count;i++){
   const p=pool.slots[pool.cursor++%pool.slots.length],angle=rnd()*Math.PI*2,speed=(.6+rnd()*3)*force;
   p.born=time;p.life=kind==='smoke'?.65+rnd()*.4:.35+rnd()*.25;p.x=x;p.y=y;p.z=z;p.vx=Math.cos(angle)*speed;p.vz=Math.sin(angle)*speed;p.vy=(.5+rnd()*3)*force;p.size=kind==='smoke'?.5+rnd()*.5:kind==='water'?.2+rnd()*.2:.06+rnd()*.12;
  }
 }
 function update(time){
  shards.forEach((p,i)=>{const age=time-p.born,u=age/p.life,alive=age>=0&&u<1;dummy.position.set(alive?p.x+p.vx*age:0,alive?p.y+p.vy*age-7*age*age:0,alive?p.z+p.vz*age:0);dummy.rotation.set(alive?i+age*8:0,alive?i*.7+age*5:0,0);dummy.scale.setScalar(alive?p.size*(1-u):0);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);});debris.instanceMatrix.needsUpdate=true;
  for(const [kind,pool] of pools){
   pool.slots.forEach((p,i)=>{const age=time-p.born,alive=age>=0&&age<p.life,t=age/p.life;pool.alpha.array[i]=alive?(1-t)*(kind==='smoke'?.36:1):0;pool.size.array[i]=alive?p.size*(kind==='smoke'?1+t*2:1-t*.6):0;
    if(alive)pool.position.setXYZ(i,p.x+p.vx*age,p.y+p.vy*age-(kind==='smoke'?0:4)*age*age,p.z+p.vz*age);
   });pool.position.needsUpdate=pool.alpha.needsUpdate=pool.size.needsUpdate=true;
  }
 }
 return {emit,update};
}
