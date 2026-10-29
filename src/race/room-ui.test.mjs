import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, invitationURL } from './room-ui.js';
test('实时排名按 lap×长度+s，自己高亮所需 id 保留，无状态仍有稳定位置',()=>{
 const players=[{id:'a',seat:0},{id:'b',seat:1},{id:'c',seat:2}],states=new Map([['a',{lap:1,s:900}],['b',{lap:2,s:1}]]);
 assert.deepEqual(standings(players,states,1000).map(p=>p.id),['b','a','c']);
});
test('邀请链接保留机器人与背景参数，清除单人 capture 和地图参数',()=>{
 const url=new URL(invitationURL('ABC234','https://game.example/?race&room&autopilot&map=hard&capture&sky=dawn'));assert.equal(url.searchParams.get('room'),'ABC234');assert.ok(url.searchParams.has('race'));assert.ok(url.searchParams.has('autopilot'));assert.equal(url.searchParams.get('sky'),'dawn');assert.equal(url.searchParams.has('capture'),false);assert.equal(url.searchParams.has('map'),false);
});
test('结算页再来一局回大厅并发送 ready on，普通返回不准备，房主仍可换图',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];let returned=0;
 const element=()=>({dataset:{},style:{},append(){},replaceChildren(){},remove(){},setAttribute(){},querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';
 globalThis.document={createElement:element,body:{append(){}}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m)};
 try{
  const ui=mountRoomUI({client,onReturn:()=>returned++});handlers.get('connection')({connected:true});handlers.get('room')({code:'ABC234',phase:'lobby',hostId:'a',trackId:1,players:[{id:'a',seat:0,name:'甲',ready:false,connected:true}]});
  handlers.get('results')({results:[]});assert.equal(ui.view,'results');assert.equal(get('[data-rm-rematch]').textContent,'再来一局');setLang('en');assert.equal(get('[data-rm-rematch]').textContent,'Race again');assert.equal(get('[data-rm-return]').textContent,'Back to lobby');setLang('zh');get('[data-rm-rematch]').onclick();assert.equal(ui.view,'lobby');assert.equal(returned,1);assert.deepEqual(sent,[{type:'ready',on:true}]);
  assert.equal(get('[data-rm-track="1"]').disabled,false);get('[data-rm-track="1"]').onclick();assert.deepEqual(sent.at(-1),{type:'pickTrack',trackId:1});
  handlers.get('results')({results:[]});const before=sent.length;get('[data-rm-return]').onclick();assert.equal(sent.length,before);assert.equal(returned,2);ui.destroy();
 }finally{globalThis.document=previous;}
});
