// 仅验收大厅修复：真实双页、选图关闭、重连提示与房主开赛，不连接钱包。
// 前提：8932 的 Vite 和 8933 的房间服务已经运行；ROOMS_SHOTS 指定截图目录。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import WebSocket from 'ws';
const out=process.env.ROOMS_SHOTS||'/private/tmp/rooms-fix';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.ROOMS_E2E_CHANNEL||'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const errors=[],checks=[],messages=new Map(),sent=new Map();
const url=process.env.URL||'http://localhost:8932/?race&room';
async function page(name){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 const p=await context.newPage();p.setDefaultTimeout(30000);messages.set(p,[]);sent.set(p,[]);
 p.on('pageerror',error=>errors.push(error.message));
 p.on('websocket',socket=>{
  socket.on('framereceived',({payload})=>{try{messages.get(p).push(JSON.parse(String(payload)));}catch{}});
  socket.on('framesent',({payload})=>{try{sent.get(p).push(JSON.parse(String(payload)));}catch{}});
 });
 await p.goto(url);await p.locator('[data-rm-name]').fill(name);return p;
}
const shot=(p,name)=>p.screenshot({path:`${out}/${name}.png`,scale:'css'});
const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(label);};
async function closePicker(p){
 const summary=p.locator('[data-rm-track-summary]'),details=p.locator('.rm-track-details'),picker=p.locator('.rm-track-picker');
 for(const method of ['close','outside','escape']){
  await summary.click();await picker.waitFor({state:'visible'});
  if(method==='close'){
   if(p.viewportSize().width<700){
    await picker.evaluate(el=>{const options=el.querySelector('.rm-track-options')||el;options.scrollLeft=options.scrollWidth;});
    const box=await p.getByRole('button',{name:'关闭地图选择',exact:true}).boundingBox();
    assert.ok(box&&box.x>=0&&box.x+box.width<=p.viewportSize().width,'手机横向滚动后关闭按钮仍在可视区');
    await shot(p,'02-mobile-picker-scrolled');
   }
   await p.getByRole('button',{name:'关闭地图选择',exact:true}).click();
  }
  else if(method==='outside')await p.locator('[data-rm-room-code]').click();
  else await p.keyboard.press('Escape');
  assert.equal(await details.getAttribute('open'),null);assert.equal(await picker.isVisible(),false);
 }
}
async function startRace(host,pages,label,count){
 const before=messages.get(host).filter(m=>m.type==='start').length;
 await host.getByRole('button',{name:'开始比赛',exact:true}).click();
 await wait(()=>pages.every(p=>messages.get(p).some(m=>m.type==='room'&&m.phase==='countdown')),`${label} 没有倒计时`);
 await wait(()=>messages.get(host).filter(m=>m.type==='start').length===before+1,`${label} 没有开赛消息`);
 const start=messages.get(host).filter(m=>m.type==='start').at(-1);assert.equal(start.grid.length,count);assert.equal(start.trackId,1);
 for(const p of pages)assert.deepEqual(messages.get(p).find(m=>m.type==='start'),start);
 await host.locator('[data-rm-lobby]').waitFor({state:'hidden'});
 await host.locator('.grg-transition').waitFor({state:'hidden'});
 // 服务器倒计时已由真实消息确认；截图等待转场结束，避免加载耗时导致错过数字帧。
 await shot(host,`${label}-race`);
 for(const [i,p] of pages.entries()){await p.locator('[data-rm-lobby]').waitFor({state:'hidden'});await shot(p,`${label}-page-${i+1}`);}
 assert.deepEqual(sent.get(host).filter(m=>m.type==='ready'),[],'房主不能通过准备发起比赛');
 checks.push({label,phase:'countdown',entrants:count,startAt:start.startAt});
}
try{
 const host=await page('房主甲');await host.locator('[data-rm-create]').click();await host.locator('[data-rm-room-code]').waitFor({state:'visible'});
 assert.equal(await host.getByRole('button',{name:'开始比赛',exact:true}).isDisabled(),true);
 assert.equal(await host.locator('[data-rm-start-reason]').innerText(),'至少需要 2 名参赛者');
 assert.match(await host.locator('[data-rm-track-summary]').innerText(),/草甸/);
 await host.locator('.grg-plate__status').first().waitFor();assert.equal(await host.locator('.grg-plate__status').first().innerText(),'房主');
 await shot(host,'01-solo');await closePicker(host);
 await host.locator('[data-rm-track-summary]').click();await host.locator('.rm-track-picker').waitFor({state:'visible'});await shot(host,'02-track-picker');await host.locator('[data-rm-track="2"]').click();assert.equal(await host.locator('.rm-track-details').getAttribute('open'),null);
 await host.locator('[data-rm-track-summary]').click();await host.locator('[data-rm-track="1"]').click();
 const code=await host.locator('[data-rm-room-code]').innerText(),peer=await page('玩家乙');
 await peer.locator('[data-rm-code]').fill(code);await peer.locator('[data-rm-join]').click();
 await host.waitForFunction(()=>document.querySelector('[data-rm-start-reason]')?.textContent==='等待 1 人准备');
 // 用真实第三连接制造宽限期，并按服务器令牌恢复，不伪造房间状态。
 const endpoint=new URL('/rooms',url);endpoint.protocol='ws:';
 async function probe(resumeToken){
  const socket=new WebSocket(endpoint),received=[];
  socket.on('message',raw=>received.push(JSON.parse(String(raw))));
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.send(JSON.stringify({type:'hello',name:'重连玩家',roomCode:code,...(resumeToken?{resumeToken}:{})}));
  await wait(()=>received.some(m=>m.type==='welcome'),'重连探针未入房');
  return {socket,token:received.find(m=>m.type==='welcome').resumeToken};
 }
 const disconnected=await probe();disconnected.socket.terminate();
 await host.waitForFunction(()=>document.querySelector('[data-rm-start-reason]')?.textContent==='等待 重连玩家 重连');
 assert.equal(await host.locator('[data-rm-ready]').isDisabled(),true);await shot(host,'03-wait-reconnect');
 const resumed=await probe(disconnected.token);resumed.socket.send(JSON.stringify({type:'leave'}));resumed.socket.close();
 await host.waitForFunction(()=>document.querySelector('[data-rm-start-reason]')?.textContent==='等待 1 人准备');
 checks.push('断线宽限期显示等待指定玩家重连并禁止开赛，真实连接恢复成功');
 await closePicker(peer);await peer.setViewportSize({width:390,height:844});await closePicker(peer);await peer.setViewportSize({width:1440,height:900});
 checks.push('房主和非房主桌面、非房主手机：关闭按钮、外部点击、Esc 均关闭；选图自动收起');
 await shot(host,'03-wait-ready');await peer.getByRole('button',{name:'准备',exact:true}).click();
 await host.waitForFunction(()=>!document.querySelector('[data-rm-ready]').disabled);assert.equal(messages.get(host).some(m=>m.type==='start'),false);
 await shot(host,'04-ready-host-start');await shot(peer,'05-peer-ready');await startRace(host,[host,peer],'06-two-pages',2);
 await host.context().close();await peer.context().close();
 const bots=await page('机器人房主');await bots.locator('[data-rm-create]').click();await bots.locator('[data-rm-room-code]').waitFor({state:'visible'});
 for(const difficulty of ['normal','hard']){await bots.locator('[data-rm-difficulty]').selectOption(difficulty);await bots.locator('[data-rm-add-bot]').click();}
 await bots.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===3);await shot(bots,'07-host-two-bots');await startRace(bots,[bots],'08-two-bots',3);
 assert.deepEqual(errors,[]);console.log('大厅端到端验证通过',JSON.stringify(checks));
}catch(error){errors.push(error.message);throw error;}finally{await writeFile(`${out}/browser-result.json`,JSON.stringify({errors,checks},null,2));await browser.close();}
