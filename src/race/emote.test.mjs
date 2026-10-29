import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as emote from './emote.js';
test('车顶表情使用 canvas 精灵，重发替换，持续两秒且末 0.3 秒淡出，销毁释放资源',()=>{
 const previous=globalThis.document,text=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillText:s=>text.push(s)})})};
 try{
  assert.equal(typeof emote.createEmote,'function');const root=new THREE.Group(),fx=emote.createEmote(root),sprite=root.children.find(c=>c.isSprite);assert.ok(sprite);assert.equal(sprite.visible,false);assert.ok(sprite.position.y>2.3);
  for(let id=1;id<=6;id++)fx.show(id);assert.deepEqual(text,['👍','😂','🔥','😱','😎','🙏']);assert.equal(root.children.length,1);assert.equal(sprite.visible,true);
  fx.update(1.7);assert.equal(sprite.material.opacity,1);fx.update(.15);assert.ok(Math.abs(sprite.material.opacity-.5)<1e-9);fx.update(.15);assert.equal(sprite.visible,false);
  fx.show(1);assert.equal(sprite.material.opacity,1);fx.update(.5);fx.show(2);fx.update(1.6);assert.equal(sprite.material.opacity,1);
  let texture=0,material=0;sprite.material.map.addEventListener('dispose',()=>texture++);sprite.material.addEventListener('dispose',()=>material++);fx.dispose();assert.equal(root.children.length,0);assert.equal(texture,1);assert.equal(material,1);
 }finally{globalThis.document=previous;}
});
