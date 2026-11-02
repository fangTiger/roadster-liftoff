import * as THREE from 'three';
import { createCoinModel } from '../../game/coin-model.js';
import { coinPositions } from '../sim/physics.js';

// 只消费本地车快照；拾取判定和每圈恢复规则仍由模拟层决定。
export function createRaceCoins(scene, track) {
 const positions = coinPositions(track);
 if (!positions.length) return { update() {}, dispose() {} };
 const model = createCoinModel();
 const body = new THREE.InstancedMesh(model.geometry, model.material, positions.length);
 const faces = new THREE.InstancedMesh(model.faceGeometry, model.faceMaterial, positions.length);
 body.name = 'race-coins'; faces.name = 'race-coin-faces'; body.castShadow = true;
 body.frustumCulled = faces.frustumCulled = false;
 faces.instanceMatrix = body.instanceMatrix;
 body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 const dummy = new THREE.Object3D();
 let disposed = false;
 function update(snapshot) {
  if (disposed) return;
  for (const [i, coin] of positions.entries()) {
   // y 已包含赛道高度和 feature.height，不能再次叠加地形高度。
   dummy.position.set(coin.x, coin.y, coin.z);
   dummy.rotation.set(0, snapshot.step / 60, 0);
   dummy.scale.setScalar(snapshot.car.picked[coin.id] !== snapshot.car.lap ? 1.5 : 0);
   dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix);
  }
  body.instanceMatrix.needsUpdate = true;
 }
 update({ step: 0, car: { picked: {}, lap: 1 } });
 scene.add(body, faces);
 return { update, dispose() {
  if (disposed) return;
  disposed = true;
  body.removeFromParent(); faces.removeFromParent();
  body.dispose(); faces.dispose(); model.dispose();
 } };
}

// 本地与远端共用流光；粒子固定池，掉落坐标保留在世界空间，不随车身移动。
export function createCoinTrail(parent) {
 const root=new THREE.Group();root.name='coin-trail';parent.add(root);
 const geometry=new THREE.PlaneGeometry(.24,1),material=new THREE.ShaderMaterial({transparent:true,blending:THREE.NormalBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  uniforms:{strength:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.x*=.65+.35*uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
  fragmentShader:'uniform float strength;varying vec2 vUv;void main(){float edge=pow(max(0.,1.-abs(vUv.x-.5)*2.),1.5);float fade=smoothstep(0.,.18,vUv.y);vec3 gold=mix(vec3(.28,.12,.015),vec3(1.,.78,.18),smoothstep(.1,.65,edge));gl_FragColor=vec4(gold,fade*strength);}'
 });
 const ribbons=[-.65,.65].map(x=>{const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.45,3);root.add(mesh);return mesh;});
 const points=new THREE.BufferGeometry(),positions=new Float32Array(36);points.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const sparkMaterial=new THREE.PointsMaterial({color:0xffdf83,size:.11,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),sparks=new THREE.Points(points,sparkMaterial);root.add(sparks);
 const lossGeometry=new THREE.CylinderGeometry(.17,.17,.045,12),lossMaterial=new THREE.MeshBasicMaterial({color:0xffcf48,toneMapped:false,transparent:true});
 const burst=new THREE.InstancedMesh(lossGeometry,lossMaterial,10);burst.name='coin-loss';burst.frustumCulled=false;burst.visible=false;root.add(burst);
 const dummy=new THREE.Object3D(),origin=new THREE.Vector3(),inverse=new THREE.Matrix4();let before,age=1,time=0,disposed=false;
 function update(state,dt){
  if(disposed)return;const coins=Math.max(0,Math.min(10,state.coins??0)),k=coins/10;time+=Math.max(0,dt);
  root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();
  if(before!==undefined&&coins<before){age=0;burst.count=before-coins;origin.set(0,.7,0).applyMatrix4(root.matrixWorld);burst.visible=true;}before=coins;
  age+=Math.max(0,dt);root.visible=coins>0||age<.8;
  for(const ribbon of ribbons){ribbon.visible=coins>0;ribbon.scale.x=.8+1.8*k;ribbon.scale.y=2+5*k;ribbon.position.z=2.2+ribbon.scale.y/2;}
  material.opacity=.7+.3*k;material.uniforms.strength.value=material.opacity;sparks.visible=coins===10;
  for(let i=0;i<12;i++){const t=(time*2+i/12)%1;positions[i*3]=Math.sin(i*2.4+time)*(.3+t*.7);positions[i*3+1]=.4+Math.cos(i*1.3+time)*.15;positions[i*3+2]=2.3+t*6;}points.attributes.position.needsUpdate=true;
  if(age<.8){for(let i=0;i<burst.count;i++){const angle=i*Math.PI*2/burst.count;dummy.position.copy(origin).add(new THREE.Vector3(Math.cos(angle)*age*4,age*4-age*age*6,Math.sin(angle)*age*4)).applyMatrix4(inverse);dummy.rotation.set(age*9,angle+age*6,age*4);dummy.updateMatrix();burst.setMatrixAt(i,dummy.matrix);}burst.instanceMatrix.needsUpdate=true;lossMaterial.opacity=1-age/.8;}
  else burst.visible=false;
  root.userData.coins=coins;root.userData.length=coins?2+5*k:0;root.userData.lossCount=burst.visible?burst.count:0;
 }
 update({},0);
 return {root,update,dispose(){if(disposed)return;disposed=true;root.removeFromParent();burst.dispose();for(const resource of [geometry,material,points,sparkMaterial,lossGeometry,lossMaterial])resource.dispose();}};
}
