import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRaceMenu } from './menu.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(key,value){this.attrs[key]=value;}
 focus(){} remove(){}
}
test('房间菜单提示比赛继续，首页链接先 leave，单人选图链接不出现在房间菜单',()=>{
 const before={document:globalThis.document,window:globalThis.window},container=new Element('div');let left=0;
 globalThis.document={createElement:tag=>new Element(tag),activeElement:null};globalThis.window={dispatchEvent(){},addEventListener(){},removeEventListener(){}};
 try{
  const menu=mountRaceMenu(container,{roomMode:true,onLeave:()=>left++,onPauseChange(){}}),card=container.children[1].children[0],links=card.children.filter(el=>el.tag==='a');
  assert.equal(links.length,1);assert.equal(links[0].href,'/');links[0].onclick();assert.equal(left,1);assert.ok(card.children.some(el=>/联网比赛会继续/.test(el.textContent)));menu.destroy();
  const solo=new Element('div'),normal=mountRaceMenu(solo,{onPauseChange(){}});assert.equal(solo.children[1].children[0].children.filter(el=>el.tag==='a').length,2);normal.destroy();
 }finally{Object.assign(globalThis,before);}
});
