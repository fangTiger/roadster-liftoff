// 真实房间截图与交互回归：不摆拍房间数据，不连接钱包。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.GARAGE_SHOTS||'/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/visuals-2';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],warnings=[],checks=[],shots=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:860},deviceScaleFactor:2});
 await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 const host=await context.newPage();
 const monitor=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());if(e.type()==='warning')warnings.push(e.text());});page.setDefaultTimeout(60000);};monitor(host);
 await host.goto('http://localhost:8932/?race&room');await host.locator('[data-rm-name]').fill('Captain');await host.locator('[data-rm-create]').click();await host.locator('[data-rm-room-code]').waitFor();
 const code=await host.locator('[data-rm-room-code]').innerText();
 async function capture(state){
  for(const [device,viewport] of [['desktop',{width:1440,height:860}],['mobile',{width:390,height:844}]]){
   await host.setViewportSize(viewport);await host.bringToFront();await host.waitForTimeout(1000);
   const geometry=await host.evaluate(()=>{
    const stage=document.querySelector('.grg-stage'),canvas=stage.querySelector('canvas'),panel=document.querySelector('[data-rm-lobby]').getBoundingClientRect(),view=document.querySelector('.grg-viewport'),r=view.getBoundingClientRect(),plates=[...document.querySelectorAll('.grg-plate')].map(p=>{const r=p.getBoundingClientRect();return{x:r.x+view.scrollLeft,y:r.y,width:r.width,height:r.height};});
    view.scrollLeft=0;
    return {width:innerWidth,height:innerHeight,dpr:canvas.width/parseFloat(stage.style.width),scrollWidth:view.scrollWidth,clientWidth:view.clientWidth,panel:{x:panel.x,y:panel.y},view:{right:r.right,bottom:r.bottom},plates};
   });
   assert.ok(geometry.dpr<=1.501);
   if(device==='desktop')assert.ok(geometry.view.right<=geometry.panel.x,'展区在右列左侧');else assert.ok(geometry.view.bottom<=geometry.panel.y+1,'展区在抽屉上方');
   const plates=geometry.plates;for(let i=1;i<plates.length;i++)assert.ok(plates[i].x>=plates[i-1].x+plates[i-1].width+3,'名牌不能重叠');
   for(const plate of plates)assert.ok(plate.y+plate.height<geometry.view.bottom,'铭牌不得落进面板');
   const name=`${device}-${state}.png`;await host.screenshot({scale:'css',path:`${out}/${name}`});shots.push(name);checks.push({state,device,...geometry});console.log('截图',name);
   if(device==='mobile'&&state==='6-full'){await host.locator('.grg-viewport').evaluate(e=>e.scrollLeft=e.scrollWidth);await host.screenshot({scale:'css',path:`${out}/mobile-6-full-right.png`});shots.push('mobile-6-full-right.png');}
  }
  await host.setViewportSize({width:1440,height:860});
 }
 await host.waitForFunction(()=>document.querySelectorAll('.grg-plate').length===6);await host.waitForTimeout(1200);await capture('1-driver');
 const peer=await context.newPage();monitor(peer);await peer.addInitScript(()=>localStorage.setItem('race.room.name','Starman'));await peer.goto(`http://localhost:8932/?race&room=${code}`);await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===2);
 await host.locator('[data-rm-difficulty]').selectOption('hard');await host.locator('.grg-plate__add').first().click();await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===3);await capture('3-with-bot');
 // 台前 × 真的发送现有 removeBot 协议；再次添加仍取下拉框的困难值。
 await host.locator('.grg-plate__remove').click();await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===2);await host.locator('.grg-plate__add').first().click();
 for(const difficulty of ['easy','normal','hard']){await host.locator('[data-rm-difficulty]').selectOption(difficulty);await host.locator('[data-rm-add-bot]').click();}
 await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===6);await capture('6-full');
 await peer.locator('[data-rm-ready]').click();await host.waitForFunction(()=>[...document.querySelectorAll('.grg-plate--ready')].some(p=>!p.querySelector('.grg-plate__remove')));await capture('ready');
 // 英文铭牌不残留中文键，减少运动不引入额外动画。
 await host.emulateMedia({reducedMotion:'reduce'});await host.locator('#race-tools .lang-toggle').click();await host.waitForFunction(()=>document.querySelector('[data-rm-garage-title]').textContent==='Before the green light');await host.screenshot({scale:'css',path:`${out}/desktop-ready-en-reduced-motion.png`});shots.push('desktop-ready-en-reduced-motion.png');
 const frames=await host.evaluate(async()=>{let last;const times=[];for(let i=0;i<121;i++)await new Promise(resolve=>requestAnimationFrame(now=>{if(last)times.push(now-last);last=now;resolve();}));return{meanMs:times.reduce((a,b)=>a+b)/times.length,p95Ms:times.sort((a,b)=>a-b)[Math.floor(times.length*.95)]};});checks.push({frames});assert.ok(frames.meanMs<33.34,`满员大厅平均帧间隔 ${frames.meanMs.toFixed(2)}ms 超过 30 FPS 门槛`);
 await host.locator('[data-rm-leave]').click();assert.equal(await host.locator('.grg-canvas').count(),0);assert.equal(await host.locator('.grg-plate').count(),0);assert.deepEqual(errors,[]);
}finally{await writeFile(`${out}/browser-result.json`,JSON.stringify({errors,warnings,shots,checks},null,2));await browser.close();}
