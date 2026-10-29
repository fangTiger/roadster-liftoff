import { t,onLangChange } from '../i18n/i18n.js';
import { TRACKS } from './track/data/index.js';
const format=value=>value===null||value===undefined?'—':`${Math.floor(value/60)}:${(value%60).toFixed(3).padStart(6,'0')}`;
export function invitationURL(code,href=location.href){const url=new URL(href);url.searchParams.set('race','');url.searchParams.set('room',code);for(const key of ['capture','map'])url.searchParams.delete(key);return url.href;}
export function standings(players,states,length){return [...players].sort((a,b)=>{const x=states.get(a.id),y=states.get(b.id);return (y?y.lap*length+y.s:0)-(x?x.lap*length+x.s:0)||a.seat-b.seat;});}
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
export function mountRoomUI({client,roomCode='',onReturn=()=>{}}) {
 const root=node('div',undefined,'rm-root');root.id='rm-room';
 root.innerHTML=`<section class="rm-overlay" data-rm-lobby role="dialog" aria-modal="true" aria-labelledby="rm-title"><div class="rm-card"><p class="rm-eyebrow">MARS ROADSTER · LIVE</p><h1 id="rm-title"></h1><p class="rm-note" data-rm-intro></p>
<form class="rm-form"><label><span data-rm-name-label></span><input data-rm-name maxlength="32" autocomplete="nickname"></label><label><span data-rm-code-label></span><input data-rm-code maxlength="6" autocomplete="off" spellcheck="false" class="rm-code-input"></label><div class="rm-actions"><button type="button" data-rm-create></button><button type="submit" data-rm-join></button></div></form>
<div data-rm-inside hidden><div class="rm-invite"><strong data-rm-room-code></strong><button data-rm-copy></button></div><ol class="rm-players" data-rm-players></ol><fieldset class="rm-tracks"><legend data-rm-track-label></legend>${TRACKS.map(({def})=>`<button type="button" data-rm-track="${def.id}"></button>`).join('')}</fieldset><p class="rm-note" data-rm-hint></p><button class="rm-primary" data-rm-ready></button></div>
<p class="rm-status" role="status" aria-live="polite" data-rm-status></p><div class="rm-actions"><button data-rm-leave hidden></button><a href="/" data-rm-home></a></div></div></section>
<aside class="rm-standings" data-rm-standings hidden aria-label="${t('room.standings')}"><h2 data-rm-standings-title></h2><ol data-rm-ranks></ol></aside>
<section class="rm-overlay" data-rm-results hidden role="dialog" aria-modal="true" aria-labelledby="rm-results-title"><div class="rm-card rm-result-card"><p class="rm-eyebrow">MARS ROADSTER · LIVE</p><h2 id="rm-results-title"></h2><div class="rm-table-wrap"><table class="rm-table"><thead><tr><th data-rm-rank-label></th><th data-rm-player-label></th><th data-rm-elapsed-label></th><th data-rm-best-label></th></tr></thead><tbody data-rm-result-rows></tbody></table></div><div class="rm-actions"><button class="rm-primary" data-rm-rematch></button><button data-rm-return></button></div></div></section>`;
 document.body.append(root);const $=q=>root.querySelector(q),name=$('[data-rm-name]'),code=$('[data-rm-code]');code.value=roomCode;
 try{name.value=localStorage.getItem('race.room.name')||'';}catch{/* 隐私模式使用内存昵称。 */}
 let room=null,view='lobby',busy=false,connection=false,error='',copied=false,results=null,lastRanks=[];
 function paintPlayers(){
  $('[data-rm-players]').replaceChildren();
  for(const p of room?.players||[]){const row=node('li'),swatch=node('i',undefined,'rm-swatch');swatch.style.background=p.color;const info=node('span',p.name,'rm-player-name'),badges=node('span',`${p.id===room.hostId?t('room.host')+' · ':''}${p.connected?(p.ready?t('room.ready'):t('room.waiting')):t('room.disconnected')}`,'rm-badges');row.append(swatch,info,badges);$('[data-rm-players]').append(row);}
 }
 function paintRanks(){
  $('[data-rm-ranks]').replaceChildren();lastRanks.forEach((p,i)=>{const row=node('li',undefined,p.id===client.id?'rm-self':'rm-peer'),swatch=node('i',undefined,'rm-swatch');swatch.style.background=p.color;row.append(node('b',i+1),swatch,node('span',p.name),node('small',p.connected?'':t('room.disconnected')));$('[data-rm-ranks]').append(row);});
 }
 function paintResults(){
  $('[data-rm-result-rows]').replaceChildren();
  for(const p of results||[]){const row=node('tr',undefined,p.id===client.id?'rm-self':'rm-peer');row.dataset.rmResultId=p.id;row.dataset.rank=p.rank;row.append(node('td',p.rank),node('td',p.name),node('td',p.dnf?t('room.dnf'):format(p.elapsed)),node('td',format(p.bestLap)));$('[data-rm-result-rows]').append(row);}
 }
 function paint(){
  const labels={'#rm-title':'room.title','[data-rm-intro]':'room.intro','[data-rm-name-label]':'room.name','[data-rm-code-label]':'room.code','[data-rm-create]':'room.create','[data-rm-join]':'room.join','[data-rm-track-label]':'room.track','[data-rm-home]':'race.home','[data-rm-leave]':'room.leave','[data-rm-standings-title]':'room.standings','#rm-results-title':'room.results','[data-rm-rank-label]':'room.rank','[data-rm-player-label]':'room.player','[data-rm-elapsed-label]':'room.elapsed','[data-rm-best-label]':'race.bestLap','[data-rm-return]':'room.return','[data-rm-rematch]':'room.rematch'};
  for(const [selector,key] of Object.entries(labels))$(selector).textContent=t(key);
  $('[data-rm-copy]').textContent=t(copied?'room.copied':'room.copy');
  $('[data-rm-lobby]').hidden=view!=='lobby';$('[data-rm-results]').hidden=view!=='results';$('[data-rm-standings]').hidden=view!=='racing';
  $('.rm-form').hidden=!!room;$('[data-rm-inside]').hidden=!room;$('[data-rm-leave]').hidden=!room;
  for(const el of [$('[data-rm-create]'),$('[data-rm-join]')])el.disabled=busy;
  $('[data-rm-room-code]').textContent=room?.code||'';
  const self=room?.players.find(p=>p.id===client.id);$('[data-rm-ready]').textContent=t(self?.ready?'room.unready':'room.ready');$('[data-rm-ready]').disabled=!connection||room?.phase!=='lobby';$('[data-rm-ready]').setAttribute('aria-pressed',String(!!self?.ready));
  for(const button of root.querySelectorAll('[data-rm-track]')){const id=Number(button.dataset.rmTrack);button.textContent=t('race.track'+id);button.disabled=!connection||room?.hostId!==client.id||room?.phase!=='lobby';button.setAttribute('aria-pressed',String(id===room?.trackId));}
  $('[data-rm-hint]').textContent=t(room?.phase==='countdown'?'room.loading':'room.hint');
  $('[data-rm-status]').textContent=error?t('room.error.'+error):busy?t('room.connecting'):room&&!connection?t('room.reconnecting'):'';
  paintPlayers();paintRanks();paintResults();
 }
 function join(joinCode){
  error='';busy=true;const nickname=name.value.trim()||t('room.driver');try{localStorage.setItem('race.room.name',nickname);}catch{/* 无存储时继续加入。 */}
  client.connect({name:nickname,...(joinCode?{roomCode:joinCode.toUpperCase()}:{} )});paint();
 }
 $('[data-rm-create]').onclick=()=>join('');$('.rm-form').onsubmit=event=>{event.preventDefault();if(code.value.trim())join(code.value.trim());};
 $('[data-rm-ready]').onclick=()=>client.send({type:'ready',on:!room?.players.find(p=>p.id===client.id)?.ready});
 for(const button of root.querySelectorAll('[data-rm-track]'))button.onclick=()=>client.send({type:'pickTrack',trackId:Number(button.dataset.rmTrack)});
 $('[data-rm-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(invitationURL(room.code));copied=true;paint();}catch{error='COPY_FAILED';paint();}};
 function leave(){client.leave();room=null;results=null;busy=false;error='';view='lobby';onReturn();paint();}
 $('[data-rm-leave]').onclick=leave;$('[data-rm-home]').onclick=()=>client.leave();
 function returnToLobby(){results=null;view='lobby';onReturn();paint();}
 $('[data-rm-return]').onclick=returnToLobby;
 $('[data-rm-rematch]').onclick=()=>{returnToLobby();client.send({type:'ready',on:true});};
 const unsubs=[client.on('welcome',()=>{busy=false;error='';}),client.on('room',m=>{room=m;busy=false;paint();}),client.on('connection',m=>{connection=m.connected;paint();}),client.on('error',m=>{error=m.code;busy=false;if(m.code==='NO_ROOM'){room=null;view='lobby';onReturn();}paint();}),client.on('results',m=>{results=m.results;view='results';paint();}),onLangChange(paint)];
 paint();if(roomCode)join(roomCode);
 return {
  get room(){return room;},get view(){return view;},
  racing(){view='racing';results=null;error='';paint();},
  update(players,states,length){lastRanks=standings(players,states,length);paintRanks();},
  fail(){error='LOAD_FAILED';view='lobby';paint();},
  destroy(){unsubs.forEach(fn=>fn());root.remove();},
 };
}
