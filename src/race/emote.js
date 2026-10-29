import * as THREE from 'three';
const EMOJIS=['👍','😂','🔥','😱','😎','🙏'];
// 自己与远端共用车顶精灵；只绘制服务端确认的表情，不依赖外部图片。
export function createEmote(root) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const context=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}),sprite=new THREE.Sprite(material);
 sprite.position.set(0,3.5,0);sprite.scale.set(1.5,1.5,1);sprite.visible=false;root.add(sprite);
 let remaining=0;
 return {
  show(id){
   if(!Number.isInteger(id)||!EMOJIS[id-1])return;
   context.clearRect(0,0,128,128);context.font='96px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(EMOJIS[id-1],64,64);
   texture.needsUpdate=true;remaining=2;material.opacity=1;sprite.visible=true;
  },
  update(dt){remaining=Math.max(0,remaining-Math.max(0,dt));material.opacity=Math.min(1,remaining/.3);sprite.visible=remaining>1e-12;},
  dispose(){sprite.removeFromParent();texture.dispose();material.dispose();},
 };
}
