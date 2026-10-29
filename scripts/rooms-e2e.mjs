// 前提：已手动启动 npm run rooms 与 Vite。URL 默认 http://localhost:8932。
// 可选：SCENARIO=bots（道具赛，一个真人加普通、困难机器人），默认保留双页场景。
// 可选：URL、ROOMS_E2E_TIMEOUT（毫秒）、ROOMS_E2E_CHANNEL（例如 chrome）。不连接钱包。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildTrack } from '../src/race/track/build.js';
import { itemBoxes } from '../src/race/sim/items.js';
import meadow from '../src/race/track/data/meadow.js';
const url=new URL(process.env.URL||'http://localhost:8932');url.searchParams.set('race','');url.searchParams.set('room','');url.searchParams.set('autopilot','');
const bots=process.env.SCENARIO==='bots',count=bots?3:2;
const timeout=Number(process.env.ROOMS_E2E_TIMEOUT||900000);
let browser,pages=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.ROOMS_E2E_CHANNEL?{channel:process.env.ROOMS_E2E_CHANNEL}:{}),args:[...(process.platform==='darwin'?['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const errors=[],used=new Set(),boxS=bots?itemBoxes(buildTrack(meadow)).map(b=>b.s):[],contexts=await Promise.all(Array.from({length:bots?1:2},()=>browser.newContext({viewport:{width:1280,height:900}})));
 for(const context of contexts)await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 // 抽取专用固定随机序列，避免机器人早早保留导弹导致本批三类道具的验收随机漏测。
 if(bots)await contexts[0].addInitScript(()=>{const original=Math.random,values=[.6,.95,.46];let draw=0;Math.random=function(){return new Error().stack?.includes('rollItem')?values[draw++%values.length]:original();};});
 const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));pages=[a,b].filter(Boolean);console.log('浏览器已启动');
 for(const [i,page] of pages.entries()){page.on('websocket',socket=>socket.on('framesent',({payload})=>{let m;try{m=JSON.parse(String(payload));}catch{return;}if(m.type==='item'&&m.botId&&m.kind==='mine')used.add('mine');if(m.type==='botState'&&m.shield)used.add('shield');if(m.type==='botState'&&m.boost&&boxS.some(s=>m.s>=s&&m.s<s+16))used.add('nitro');}));page.on('pageerror',error=>errors.push(`页面 ${i+1}：${error.message}`));page.on('request',req=>{if(new URL(req.url()).pathname==='/api/verify')errors.push('房间赛不应调用 /api/verify');});page.setDefaultTimeout(60000);}
 await a.goto(url.href);await a.locator('[data-rm-name]').fill('机器人 A');await a.locator('[data-rm-create]').click();
 await a.locator('[data-rm-room-code]').waitFor({state:'visible'});const code=await a.locator('[data-rm-room-code]').innerText();console.log(`已建房 ${code}`);assert.match(code,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
 if(bots){
  await a.locator('[data-rm-mode="items"]').click();assert.equal(await a.locator('[data-rm-mode="items"]').getAttribute('aria-pressed'),'true');
  for(const difficulty of ['normal','hard']){await a.locator('[data-rm-difficulty]').selectOption(difficulty);await a.locator('[data-rm-add-bot]').click();}
 }else{
  await b.goto(url.href);await b.locator('[data-rm-name]').fill('机器人 B');await b.locator('[data-rm-code]').fill(code);await b.locator('[data-rm-join]').click();
 }
 await Promise.all(pages.map(page=>page.waitForFunction(expected=>document.querySelectorAll('[data-rm-players] li').length===expected,count)));
 console.log(bots?'一个真人和两个机器人已加入':'两位玩家已加入');
 for(const page of pages)await page.locator('[data-rm-ready]').click();
 await a.locator('[data-rm-track="1"]').click();console.log(`房间 ${code}：${count} 位参赛者开始比赛`);
 await Promise.all(pages.map(page=>page.locator('[data-rm-results]').waitFor({state:'visible',timeout})));
 const read=page=>page.locator('[data-rm-result-rows] tr').evaluateAll(rows=>rows.map(row=>({id:row.dataset.rmResultId,rank:Number(row.dataset.rank),cells:[...row.cells].map(c=>c.textContent)})));
 const results=await Promise.all(pages.map(read)),ra=results[0];assert.equal(ra.length,count);if(!bots)assert.deepEqual(ra,results[1],'两页最终名次与计时必须一致');assert.ok(ra.every(row=>!row.cells.includes('未完成')),'所有参赛者均须完赛');assert.deepEqual(ra.map(row=>row.rank),Array.from({length:count},(_,i)=>i+1));if(bots)assert.equal(ra.filter(row=>row.id.startsWith('b')).length,2);
 for(const page of pages){assert.equal(await page.locator('#race-chain-slot').count(),0);await page.locator('[data-rm-return]').click();await page.locator('[data-rm-lobby]').waitFor({state:'visible'});assert.equal(await page.locator('[data-rm-ready]').getAttribute('aria-pressed'),'false');}
 if(bots){assert.deepEqual([...used].sort(),['mine','nitro','shield']);console.log('机器人已使用：',JSON.stringify([...used]));}
 assert.deepEqual(errors,[]);console.log(bots?'机器人场景结算：':'双页结算一致：',JSON.stringify(ra));console.log('房间端到端验证通过');
}catch(error){console.error('房间端到端验证失败：',error.message);for(const [i,page] of pages.entries())try{console.error(`页面 ${i+1} 状态：`,await page.locator('#rm-room').innerText({timeout:5000}));}catch{}process.exitCode=1;}
finally{await browser?.close();}
