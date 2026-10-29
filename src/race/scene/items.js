import * as THREE from 'three';
// 箱子、球壳与水球共用几何和材质，离开本局时统一释放。
export function createItemFx(scene,items,track) {
 const root=new THREE.Group();root.name='party-items';scene.add(root);
 const boxes=new THREE.Group(),bursts=new THREE.Group();boxes.name='item-boxes';bursts.name='item-bursts';root.add(boxes,bursts);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#12323f';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#8ef0ff';ctx.lineWidth=8;ctx.strokeRect(4,4,120,120);ctx.fillStyle='#ffffff';ctx.font='bold 92px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',64,68);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const cube=new THREE.BoxGeometry(1.3,1.3,1.3),sphere=new THREE.SphereGeometry(1,20,12),hex=new THREE.IcosahedronGeometry(1,1),flame=new THREE.ConeGeometry(.22,2.8,10);
 const boxMaterial=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0x8ef0ff,emissiveIntensity:1.2,roughness:.25});
 const water=new THREE.MeshBasicMaterial({color:0x42b9ff,transparent:true,opacity:.42,depthWrite:false,toneMapped:false});
 const shield=new THREE.MeshBasicMaterial({color:0x8ef0ff,transparent:true,opacity:.14,depthWrite:false,toneMapped:false});
 const wire=new THREE.MeshBasicMaterial({color:0x8ef0ff,wireframe:true,transparent:true,opacity:.38,depthWrite:false,toneMapped:false});
 const fire=new THREE.MeshBasicMaterial({color:0xffc46b,transparent:true,opacity:.8,depthWrite:false,toneMapped:false});
 const burstMaterial=new THREE.MeshBasicMaterial({color:0x8ef0ff,transparent:true,opacity:.4,wireframe:true,depthWrite:false,toneMapped:false});
 for(const b of items.boxes){const mesh=new THREE.Mesh(cube,boxMaterial);mesh.position.set(b.x,b.y+1.25,b.z);boxes.add(mesh);}
 const mineMeshes=new Map(),cars=new Map();
 const ground=mine=>track.heightAt(mine.x,mine.z)+.65;
 function burst(mine,time){const mesh=new THREE.Mesh(hex,burstMaterial.clone());mesh.position.set(mine.x,ground(mine),mine.z);mesh.userData.born=time;bursts.add(mesh);}
 function update(selfId,time,states){
  boxes.children.forEach((mesh,i)=>{const b=items.boxes[i];mesh.visible=items.visible(selfId,b.id,time);mesh.rotation.set(.25,time*1.4+i*.3,.2);mesh.position.y=b.y+1.25+Math.sin(time*3+i)*.15;});
  for(const [id,mesh] of mineMeshes)if(!items.mines.has(id)){mesh.removeFromParent();mineMeshes.delete(id);}
  for(const [id,mine] of items.mines){
   if(!mineMeshes.has(id)){const mesh=new THREE.Mesh(sphere,water);root.add(mesh);mineMeshes.set(id,mesh);}
   const mesh=mineMeshes.get(id),age=time-mine.placedAt;mesh.position.set(mine.x,ground(mine)+Math.sin(time*5)*.10,mine.z);mesh.scale.set(.7+Math.sin(time*7)*.05,.7,.7);mesh.rotation.z=Math.sin(time*5)*.18;mesh.visible=age>=0;
  }
  for(const [id,g] of cars)if(!states.has(id)){g.removeFromParent();cars.delete(id);}
  for(const [id,state] of states){
   if(!cars.has(id)){
    const g=new THREE.Group(),shell=new THREE.Mesh(hex,shield),lines=new THREE.Mesh(hex,wire),bubble=new THREE.Mesh(sphere,water),jet=new THREE.Mesh(flame,fire);
    shell.name='shield-'+id;bubble.name='trap-'+id;lines.name='shield-lines-'+id;jet.name='nitro-'+id;
    shell.scale.set(1.55,1.3,2.65);lines.scale.copy(shell.scale);bubble.scale.set(1.55,1.5,2.65);jet.rotation.x=-Math.PI/2;jet.position.set(0,-.35,-3.3);g.add(shell,lines,bubble,jet);root.add(g);cars.set(id,g);
   }
   const g=cars.get(id);g.visible=!state.stale;g.position.set(state.x,state.y+.8,state.z);g.rotation.y=state.yaw;
   g.children[0].visible=g.children[1].visible=!!state.shield;g.children[2].visible=!!state.trapped;g.children[2].rotation.z=Math.sin(time*8)*.04;g.children[3].visible=!!state.boost;
  }
  for(const mesh of [...bursts.children]){const age=time-mesh.userData.born;if(age>=.4){mesh.removeFromParent();mesh.material.dispose();}else{mesh.scale.setScalar(.6+age*7);mesh.material.opacity=.5*(1-age/.4);}}
 }
 return {update,burst,dispose(){root.removeFromParent();for(const mesh of bursts.children)mesh.material.dispose();for(const geometry of [cube,sphere,hex,flame])geometry.dispose();for(const material of [boxMaterial,water,shield,wire,fire,burstMaterial])material.dispose();texture.dispose();}};
}
