import { t,onLangChange } from '../i18n/i18n.js';
import { playerName } from './room-player.js';
import { createGarage } from './lobby/garage.js';
import { createGarageCarLoader } from './lobby/garage-cars.js';
import { trackPreview } from './lobby/track-previews.js';
import { TRACKS } from './track/data/index.js';
const format=value=>value===null||value===undefined?'—':`${Math.floor(value/60)}:${(value%60).toFixed(3).padStart(6,'0')}`;
export function invitationURL(code,href=location.href){const url=new URL(href);url.searchParams.set('race','');url.searchParams.set('room',code);for(const key of ['capture','map'])url.searchParams.delete(key);return url.href;}
export function standings(players,states,length){return [...players].sort((a,b)=>{const x=states.get(a.id),y=states.get(b.id);return (y?y.lap*length+y.s:0)-(x?x.lap*length+x.s:0)||a.seat-b.seat;});}
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
export function mountRoomUI({client,roomCode='',onReturn=()=>{},playSound=()=>{},setMusicPhase=()=>{},garageFactory=createGarage}) {
 const root=node('div',undefined,'rm-root');root.id='rm-room';
 root.innerHTML=`<section class="rm-overlay" data-rm-lobby role="dialog" aria-modal="true" aria-labelledby="rm-title"><div class="rm-card"><p class="rm-eyebrow">MARS ROADSTER · LIVE</p><h1 id="rm-title"></h1><p class="rm-note" data-rm-intro></p>
<form class="rm-form"><label><span data-rm-name-label></span><input data-rm-name maxlength="32" autocomplete="nickname"></label><label><span data-rm-code-label></span><input data-rm-code maxlength="6" autocomplete="off" spellcheck="false" class="rm-code-input"></label><div class="rm-actions"><button type="button" data-rm-create></button><button type="submit" data-rm-join></button></div></form>
<div data-rm-inside hidden><div class="rm-invite"><strong data-rm-room-code></strong><button data-rm-copy></button></div><ol class="rm-players" data-rm-players></ol><div class="rm-actions rm-bots" data-rm-bots hidden><label><span data-rm-difficulty-label></span> <select data-rm-difficulty><option value="easy" data-rm-difficulty-option="easy"></option><option value="normal" data-rm-difficulty-option="normal"></option><option value="hard" data-rm-difficulty-option="hard"></option></select></label><button data-rm-add-bot></button></div><fieldset class="rm-tracks"><legend data-rm-mode-label></legend><button type="button" data-rm-mode="items"></button><button type="button" data-rm-mode="speed"></button></fieldset><details class="rm-track-details"><summary data-rm-track-summary></summary><fieldset class="rm-tracks rm-track-picker"><legend data-rm-track-label></legend><button type="button" data-rm-track-close>×</button>${TRACKS.map(({def})=>`<button type="button" data-rm-track="${def.id}"></button>`).join('')}</fieldset></details><p class="rm-laps" data-rm-laps></p><p class="rm-note" data-rm-hint></p><button class="rm-primary" data-rm-ready aria-describedby="rm-start-reason"></button><p id="rm-start-reason" class="rm-note" data-rm-start-reason aria-live="polite" hidden></p></div>
<p class="rm-status" role="status" aria-live="polite" data-rm-status></p><div class="rm-actions"><button data-rm-leave hidden></button><a href="/" data-rm-home></a></div></div></section>
<aside class="rm-standings" data-rm-standings hidden aria-label="${t('room.standings')}"><h2 data-rm-standings-title></h2><ol data-rm-ranks></ol></aside>
<section class="rm-overlay" data-rm-results hidden role="dialog" aria-modal="true" aria-labelledby="rm-results-title"><div class="rm-card rm-result-card"><p class="rm-eyebrow">MARS ROADSTER · LIVE</p><h2 id="rm-results-title"></h2><div class="rm-table-wrap"><table class="rm-table"><thead><tr><th data-rm-rank-label></th><th data-rm-player-label></th><th data-rm-elapsed-label></th><th data-rm-best-label></th></tr></thead><tbody data-rm-result-rows></tbody></table></div><div class="rm-actions"><button class="rm-primary" data-rm-rematch></button><button data-rm-return></button></div></div></section>`;
 document.body.append(root);const $=q=>root.querySelector(q),name=$('[data-rm-name]'),code=$('[data-rm-code]');code.value=roomCode;$('[data-rm-difficulty]').value='normal';
 try{name.value=localStorage.getItem('race.room.name')||'';}catch{/* 隐私模式使用内存昵称。 */}
 const garageContainer=node('div');garageContainer.dataset.rmGarage='';garageContainer.hidden=true;root.append(garageContainer);
 const heading=node('header',undefined,'grg-heading');heading.hidden=true;heading.innerHTML='<p>MARS ROADSTER / LIVE GARAGE</p><h2 data-rm-garage-title></h2><small data-rm-garage-count></small>';root.append(heading);
 const scrollHint=node('p',undefined,'grg-scroll-hint');scrollHint.hidden=true;root.append(scrollHint);
 let garage=null,carLoader=null,transitionTimer=null;
 const flash=node('div',undefined,'grg-transition');flash.hidden=true;root.append(flash);
 function garageReserve(){const panel=$('[data-rm-lobby]').getBoundingClientRect();return window.innerWidth<700?{bottom:panel.height}:{right:panel.width+44};}
 const trackPicker=$('.rm-track-picker'),trackDetails=$('.rm-track-details');
 // 当前图紧接邀请码，窄屏首次进入也能看见，无需先滚过模式与机器人设置。
 $('[data-rm-inside]').insertBefore?.(trackDetails,$('[data-rm-bots]'));
 function placeTrackPicker(){
  const mobile=(globalThis.window?.innerWidth||1440)<700;
  (mobile?trackDetails:root).append(trackPicker);
  trackPicker.hidden=!trackDetails.open||view!=='lobby'||!room;
 }
 function closeTrackPicker(focus=false){
  trackDetails.open=false;placeTrackPicker();
  if(focus)$('[data-rm-track-summary]').focus();
 }
 function outsideTrackPicker(event){if(trackDetails.open&&!trackDetails.contains(event.target)&&!trackPicker.contains(event.target))closeTrackPicker();}
 function escapeTrackPicker(event){if(event.key==='Escape'&&trackDetails.open){event.preventDefault();closeTrackPicker(true);}}
 trackDetails.ontoggle=placeTrackPicker;
 $('[data-rm-track-close]').onclick=()=>closeTrackPicker(true);
 document.addEventListener('pointerdown',outsideTrackPicker);
 document.addEventListener('keydown',escapeTrackPicker);
 function resizeGarage(){placeTrackPicker();garage?.resize(garageReserve());}
 function syncGarage(){
  const active=view==='lobby'&&!!room;
  root.className=active?'rm-root grg-layout':'rm-root';garageContainer.hidden=!active;heading.hidden=!active;scrollHint.hidden=!active;
  if(!active){garage?.dispose();garage=null;carLoader?.dispose();carLoader=null;return;}
  // Node 单元测试显式注入场景工厂；浏览器使用真正的 WebGL 场景。
  if(typeof window==='undefined'&&garageFactory===createGarage)return;
  if(!garage){carLoader=createGarageCarLoader();garage=garageFactory({container:garageContainer,playSound,loadCar:color=>carLoader.load(color),t,reserve:garageReserve(),onAddBot:()=>{$('[data-rm-add-bot]').onclick();},onRemoveBot:id=>client.send({type:'removeBot',botId:id})});}
  garage.update(room,client.id,connection);resizeGarage();
 }
 globalThis.window?.addEventListener('resize',resizeGarage);
 let room=null,view='lobby',busy=false,connection=false,error='',copied=false,results=null,lastRanks=[];
 function paintPlayers(){
  $('[data-rm-players]').replaceChildren();
  for(const p of room?.players||[]){const row=node('li'),swatch=node('i',undefined,'rm-swatch');swatch.style.background=p.color;const info=node('span',playerName(p),'rm-player-name'),badges=node('span',`${p.bot?t('room.bot')+' · ':''}${!p.connected?t('room.disconnected'):p.id===room.hostId?t('room.host'):p.ready?t('room.ready'):t('room.waiting')}`,'rm-badges');row.append(swatch,info,badges);
   if(p.bot&&room.hostId===client.id&&room.phase==='lobby'){const remove=node('button','×');remove.dataset.rmRemoveBot=p.id;remove.setAttribute('aria-label',t('room.removeBot',{name:playerName(p)}));remove.disabled=!connection;remove.onclick=()=>client.send({type:'removeBot',botId:p.id});row.append(remove);}
   $('[data-rm-players]').append(row);}
 }
 function paintRanks(){
  $('[data-rm-ranks]').replaceChildren();lastRanks.forEach((p,i)=>{const row=node('li',undefined,p.id===client.id?'rm-self':'rm-peer'),swatch=node('i',undefined,'rm-swatch');swatch.style.background=p.color;row.append(node('b',i+1),swatch,node('span',playerName(p)),node('small',p.connected?'':t('room.disconnected')));$('[data-rm-ranks]').append(row);});
 }
 function paintResults(){
  $('[data-rm-result-rows]').replaceChildren();
  for(const p of results||[]){const row=node('tr',undefined,p.id===client.id?'rm-self':'rm-peer');row.dataset.rmResultId=p.id;row.dataset.rank=p.rank;row.append(node('td',p.rank),node('td',playerName(p)),node('td',p.dnf?t('room.dnf'):format(p.elapsed)),node('td',format(p.bestLap)));$('[data-rm-result-rows]').append(row);}
 }
 function startReason(){
  if(!room)return '';
  const disconnected=room.players.filter(p=>!p.connected);
  if(disconnected.length)return t('room.waitReconnect',{name:disconnected.map(playerName).join('、')});
  if(room.players.length<2)return t('room.needPlayers');
  if(!room.trackId)return t('room.chooseTrack');
  const waiting=room.players.filter(p=>!p.bot&&p.id!==room.hostId&&!p.ready).length;
  return waiting?t('room.waitReady',{count:waiting}):'';
 }
 function paint(){
  const labels={'[data-rm-mode-label]':'room.mode','#rm-title':'room.title','[data-rm-intro]':'room.intro','[data-rm-name-label]':'room.name','[data-rm-code-label]':'room.code','[data-rm-create]':'room.create','[data-rm-join]':'room.join','[data-rm-track-label]':'room.track','[data-rm-home]':'race.home','[data-rm-leave]':'room.leave','[data-rm-standings-title]':'room.standings','#rm-results-title':'room.results','[data-rm-rank-label]':'room.rank','[data-rm-player-label]':'room.player','[data-rm-elapsed-label]':'room.elapsed','[data-rm-best-label]':'race.bestLap','[data-rm-return]':'room.return','[data-rm-rematch]':'room.rematch','[data-rm-add-bot]':'room.addBot','[data-rm-difficulty-label]':'room.botDifficulty'};
  for(const [selector,key] of Object.entries(labels))$(selector).textContent=t(key);
  for(const difficulty of ['easy','normal','hard'])$(`[data-rm-difficulty-option="${difficulty}"]`).textContent=t('race.'+difficulty);
  $('[data-rm-bots]').hidden=room?.hostId!==client.id;
  $('[data-rm-add-bot]').disabled=!connection||room?.phase!=='lobby'||room?.players.length>=6;
  $('[data-rm-difficulty]').disabled=!connection||room?.phase!=='lobby';
  $('[data-rm-copy]').textContent=t(copied?'room.copied':'room.copy');
  $('[data-rm-lobby]').hidden=view!=='lobby';$('[data-rm-results]').hidden=view!=='results';$('[data-rm-standings]').hidden=view!=='racing';
  $('.rm-form').hidden=!!room;$('[data-rm-inside]').hidden=!room;$('[data-rm-leave]').hidden=!room;
  for(const el of [$('[data-rm-create]'),$('[data-rm-join]')])el.disabled=busy;
  $('[data-rm-room-code]').textContent=room?.code||'';
  const self=room?.players.find(p=>p.id===client.id),isHost=!!room&&room.hostId===client.id,reason=isHost?startReason():'';
  $('[data-rm-ready]').textContent=t(isHost?'room.start':self?.ready?'room.unready':'room.ready');
  $('[data-rm-ready]').disabled=!connection||room?.phase!=='lobby'||(isHost&&!!reason);
  $('[data-rm-ready]').setAttribute('aria-pressed',String(!isHost&&!!self?.ready));
  $('[data-rm-start-reason]').textContent=reason;$('[data-rm-start-reason]').hidden=!reason||room?.phase!=='lobby';
  $('[data-rm-track-close]').setAttribute('aria-label',t('room.closeTrackPicker'));
  $('[data-rm-track-close]').disabled=false;
  for(const button of root.querySelectorAll('[data-rm-track]')){const id=Number(button.dataset.rmTrack);
   const preview=trackPreview(id);
   button.innerHTML=`<img class="rm-track-photo" src="${preview.image}" alt="${t('race.track'+id)}" width="1280" height="720"><div class="rm-track-content"><div><strong>${t('race.track'+id)}</strong><span>${t('room.trackLength',{length:preview.length})} · ${t('race.'+preview.difficulty)}</span><small>${t(preview.jet?'room.jetOn':'room.jetOff')}</small></div><svg viewBox="0 0 100 100" aria-hidden="true"><path d="${preview.path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg></div>`;button.disabled=!connection||room?.hostId!==client.id||room?.phase!=='lobby';button.setAttribute('aria-pressed',String(id===room?.trackId));}
  for(const mode of ['items','speed']){const button=$(`[data-rm-mode="${mode}"]`);button.textContent=t('room.mode.'+mode);button.disabled=!connection||room?.hostId!==client.id||room?.phase!=='lobby';button.setAttribute('aria-pressed',String(mode===(room?.mode||'items')));}
  $('[data-rm-hint]').textContent=t(room?.phase==='countdown'?'room.loading':'room.hint');
  $('[data-rm-status]').textContent=error?t('room.error.'+error):busy?t('room.connecting'):room&&!connection?t('room.reconnecting'):'';
  const currentId=room?.trackId,current=TRACKS.some(entry=>entry.def.id===currentId)?trackPreview(currentId):null;
  $('[data-rm-track-summary]').innerHTML=current?`<span class="rm-current-track"><img src="${current.image}" width="1920" height="1080" alt=""><span><small>${t('room.trackPreview')}</small><strong>${t('race.track'+currentId)}</strong><span>${t('room.trackLength',{length:current.length})} · ${t('race.'+current.difficulty)}</span></span><b aria-hidden="true">⌄</b></span>`:t('room.chooseTrack');
  $('[data-rm-laps]').textContent=current?t('room.laps',{count:TRACKS.find(entry=>entry.def.id===currentId).def.laps}):'';
  $('[data-rm-garage-title]').textContent=t('room.garageTitle');$('[data-rm-garage-count]').textContent=t('room.garageCount',{count:room?.players.length||0});scrollHint.textContent=t('room.garageScroll');
  setMusicPhase(!room?'off':view==='lobby'?room.phase:view==='racing'?'racing':'off');
  paintPlayers();paintRanks();paintResults();syncGarage();placeTrackPicker();
 }
 function join(joinCode){
  error='';busy=true;const nickname=name.value.trim()||t('room.driver');try{localStorage.setItem('race.room.name',nickname);}catch{/* 无存储时继续加入。 */}
  client.connect({name:nickname,...(joinCode?{roomCode:joinCode.toUpperCase()}:{} )});paint();
 }
 $('[data-rm-create]').onclick=()=>join('');$('.rm-form').onsubmit=event=>{event.preventDefault();if(code.value.trim())join(code.value.trim());};
 $('[data-rm-add-bot]').onclick=()=>client.send({type:'addBot',difficulty:$('[data-rm-difficulty]').value});
 $('[data-rm-ready]').onclick=()=>client.send(room?.hostId===client.id?{type:'start'}:{type:'ready',on:!room?.players.find(p=>p.id===client.id)?.ready});
 for(const button of root.querySelectorAll('[data-rm-track]'))button.onclick=()=>{client.send({type:'pickTrack',trackId:Number(button.dataset.rmTrack)});closeTrackPicker(true);};
 for(const mode of ['items','speed'])$(`[data-rm-mode="${mode}"]`).onclick=()=>client.send({type:'pickMode',mode});
 $('[data-rm-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(invitationURL(room.code));copied=true;paint();}catch{error='COPY_FAILED';paint();}};
 function leave(){clearTimeout(transitionTimer);flash.hidden=true;closeTrackPicker();client.leave();room=null;results=null;busy=false;error='';view='lobby';onReturn();paint();}
 $('[data-rm-leave]').onclick=leave;$('[data-rm-home]').onclick=()=>{setMusicPhase('off');client.leave();};
 function returnToLobby(){results=null;view='lobby';onReturn();paint();}
 $('[data-rm-return]').onclick=returnToLobby;
 $('[data-rm-rematch]').onclick=()=>{returnToLobby();if(room?.hostId!==client.id)client.send({type:'ready',on:true});};
 const unsubs=[client.on('welcome',()=>{busy=false;error='';}),client.on('room',m=>{room=m;busy=false;paint();}),client.on('connection',m=>{connection=m.connected;paint();}),client.on('error',m=>{error=m.code;busy=false;if(m.code==='NO_ROOM'){room=null;view='lobby';onReturn();}paint();}),client.on('results',m=>{results=m.results;view='results';paint();}),onLangChange(paint)];
 paint();if(roomCode)join(roomCode);
 return {
  get room(){return room;},get view(){return view;},
  racing(){
   setMusicPhase('racing');
   // 此时赛道和远端车辆已就绪，首帧已渲染；保留大厅直到闪白覆盖交接点。
   if(!garage?.transition){view='racing';results=null;error='';paint();return;}
   garage.transition();
   const reduced=globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   flash.hidden=false;flash.className='grg-transition'+(reduced?' grg-transition--reduced':' grg-transition--rush');
   clearTimeout(transitionTimer);transitionTimer=setTimeout(()=>{
    view='racing';results=null;error='';paint();flash.className='grg-transition grg-transition--reveal';
    transitionTimer=setTimeout(()=>{flash.hidden=true;},450);
   },reduced?0:800);
  },
  update(players,states,length){lastRanks=standings(players,states,length);paintRanks();},
  fail(){error='LOAD_FAILED';view='lobby';paint();},
  destroy(){setMusicPhase('off');clearTimeout(transitionTimer);document.removeEventListener('pointerdown',outsideTrackPicker);document.removeEventListener('keydown',escapeTrackPicker);trackDetails.ontoggle=null;unsubs.forEach(fn=>fn());globalThis.window?.removeEventListener('resize',resizeGarage);garage?.dispose();carLoader?.dispose();root.remove();},
 };
}
