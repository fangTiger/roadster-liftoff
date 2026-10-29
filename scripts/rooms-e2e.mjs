// 前提：已手动启动 npm run rooms 与 Vite。URL 默认 http://localhost:8932。
// 可选：URL、ROOMS_E2E_TIMEOUT（毫秒）、ROOMS_E2E_CHANNEL（例如 chrome）。不连接钱包。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=new URL(process.env.URL||'http://localhost:8932');url.searchParams.set('race','');url.searchParams.set('room','');url.searchParams.set('autopilot','');
const timeout=Number(process.env.ROOMS_E2E_TIMEOUT||900000);
let browser,pages=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.ROOMS_E2E_CHANNEL?{channel:process.env.ROOMS_E2E_CHANNEL}:{}),args:[...(process.platform==='darwin'?['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const errors=[],contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:1280,height:900}})]);
 for(const context of contexts)await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));pages=[a,b];console.log('浏览器已启动');
 for(const [i,page] of [a,b].entries()){page.on('pageerror',error=>errors.push(`页面 ${i+1}：${error.message}`));page.on('request',req=>{if(new URL(req.url()).pathname==='/api/verify')errors.push('房间赛不应调用 /api/verify');});page.setDefaultTimeout(60000);}
 await a.goto(url.href);await a.locator('[data-rm-name]').fill('机器人 A');await a.locator('[data-rm-create]').click();
 await a.locator('[data-rm-room-code]').waitFor({state:'visible'});const code=await a.locator('[data-rm-room-code]').innerText();console.log(`已建房 ${code}`);assert.match(code,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
 await b.goto(url.href);await b.locator('[data-rm-name]').fill('机器人 B');await b.locator('[data-rm-code]').fill(code);await b.locator('[data-rm-join]').click();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===2)));
 console.log('两位玩家已加入');await a.locator('[data-rm-ready]').click();console.log('A 已准备');await b.locator('[data-rm-ready]').click();console.log('B 已准备');await a.locator('[data-rm-track="1"]').click();
 console.log(`房间 ${code}：两位机器人开始比赛`);
 await Promise.all([a,b].map(page=>page.locator('[data-rm-results]').waitFor({state:'visible',timeout})));
 const read=page=>page.locator('[data-rm-result-rows] tr').evaluateAll(rows=>rows.map(row=>({id:row.dataset.rmResultId,rank:Number(row.dataset.rank),cells:[...row.cells].map(c=>c.textContent)})));
 const [ra,rb]=await Promise.all([read(a),read(b)]);assert.equal(ra.length,2);assert.deepEqual(ra,rb,'两页最终名次与计时必须一致');assert.ok(ra.every(row=>!row.cells.includes('未完成')),'两位机器人均须完赛');assert.deepEqual(ra.map(row=>row.rank),[1,2]);
 for(const page of [a,b]){assert.equal(await page.locator('#race-chain-slot').count(),0);await page.locator('[data-rm-return]').click();await page.locator('[data-rm-lobby]').waitFor({state:'visible'});assert.equal(await page.locator('[data-rm-ready]').getAttribute('aria-pressed'),'false');}
 assert.deepEqual(errors,[]);console.log('双页结算一致：',JSON.stringify(ra));console.log('房间端到端验证通过');
}catch(error){console.error('房间端到端验证失败：',error.message);for(const [i,page] of pages.entries())try{console.error(`页面 ${i+1} 状态：`,await page.locator('#rm-room').innerText({timeout:5000}));}catch{}process.exitCode=1;}
finally{await browser?.close();}
