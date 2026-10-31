// 前提：8933 房间服务和 8932 Vite 已运行；仅验证列表到倒计时，不连接钱包。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import WebSocket from 'ws';
const base=new URL(process.env.URL||'http://localhost:8932/?race&room');
base.searchParams.set('race','');base.searchParams.set('room','');
const output=process.env.ROOMS_SCREENSHOTS||'/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/rooms-browser';
const sockets=[],pages=[],errors=[],messages=[];
let browser;
function noPasswords(value){
 if(!value||typeof value!=='object')return;
 for(const [key,entry] of Object.entries(value)){assert.ok(!/password|^pw$/i.test(key),`协议泄露字段：${key}`);noPasswords(entry);}
}
async function pin(page,value){const inputs=page.locator('.rb-modal .rb-pin-box');for(let i=0;i<4;i++)await inputs.nth(i).fill(value[i]);}
async function screenshot(page,name){await page.locator('#race-loading').waitFor({state:'detached'});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:`${output}/${name}.png`,fullPage:false,animations:'disabled'});}
async function fullRoom(){
 const endpoint=new URL(process.env.ROOMS_WS||'ws://localhost:8933/rooms'),ws=new WebSocket(endpoint);sockets.push(ws);const received=[];
 ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);received.push(m);});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 ws.send(JSON.stringify({type:'hello',name:'满员房主',create:{name:'六席已满 · 稍候再来',locked:false}}));
 const wait=async predicate=>{for(let i=0;i<100;i++){const found=received.find(predicate);if(found)return found;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('满员房间协议超时');};
 const room=await wait(m=>m.type==='room');
 for(let i=0;i<5;i++)ws.send(JSON.stringify({type:'addBot',difficulty:'normal'}));
 await wait(m=>m.type==='room'&&m.players.length===6);return room.code;
}
try{
 await mkdir(output,{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.ROOMS_E2E_CHANNEL?{channel:process.env.ROOMS_E2E_CHANNEL}:{}),args:[...(process.platform==='darwin'?['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']})));
 for(const context of contexts)await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));pages.push(a,b);
 for(const page of pages){page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{messages.push(JSON.parse(String(payload)));}catch{}}));}
 console.log('浏览器已启动');await a.goto(new URL('/',base).href);await a.getByRole('button',{name:'多人房间',exact:true}).click();await a.locator('.rb-header__title').waitFor({state:'visible'});
 await a.locator('[data-rm-name]').fill('车手 A');await a.locator('.rb-header').getByRole('button',{name:'建房',exact:true}).click();
 console.log('已打开建房弹框',await a.locator('.rb-modal').count());await a.getByRole('textbox',{name:'房间名称（可选）',exact:true}).fill('深夜展厅 · 密码竞速');
 await a.getByRole('button',{name:'加锁',exact:true}).click();await pin(a,'2468');await screenshot(a,'03-create-form');
 await a.getByRole('button',{name:'确认创建',exact:true}).click();await a.locator('[data-rm-room-code]').waitFor({state:'visible'});
 const code=await a.locator('[data-rm-room-code]').innerText();assert.match(code,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
 await a.locator('[data-rm-copy]').click();const invitation=await a.evaluate(()=>navigator.clipboard.readText());assert.equal(new URL(invitation).searchParams.get('pw'),'2468');
 const fullCode=await fullRoom();
 await b.goto(base.href);await b.locator('[data-rm-name]').fill('车手 B');const row=b.locator(`.rb-row[data-code="${code}"]`),full=b.locator(`.rb-row[data-code="${fullCode}"]`);
 await row.waitFor({state:'visible'});assert.equal(await row.locator('.rb-lock-icon').count(),1);await full.waitFor({state:'visible'});assert.ok(await full.getByRole('button',{name:'加入',exact:true}).isDisabled());assert.match(await full.innerText(),/已满/);
 await screenshot(b,'01-room-list');await b.setViewportSize({width:390,height:844});
 await screenshot(b,'04-mobile-list');assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'手机列表不应横向溢出');
 await b.setViewportSize({width:1280,height:900});await row.getByRole('button',{name:'加入',exact:true}).click();await pin(b,'0000');await b.getByRole('button',{name:'确认',exact:true}).click();
 await b.getByText('密码错误',{exact:true}).first().waitFor({state:'visible'});await screenshot(b,'02-password-dialog');
 await pin(b,'2468');await b.getByRole('button',{name:'确认',exact:true}).click();await b.locator('[data-rm-room-code]').waitFor({state:'visible'});assert.equal(await b.locator('[data-rm-room-code]').innerText(),code);
 // 离房后通过分享链接直接加入，并检查地址清理与房内再次复制。
 await b.locator('[data-rm-leave]').click();await b.locator('.rb-header__title').waitFor({state:'visible'});
 const directInvite=new URL(invitation);directInvite.searchParams.delete('race');await b.goto(directInvite.href);await b.locator('[data-rm-room-code]').waitFor({state:'visible'});assert.equal(new URL(b.url()).searchParams.has('pw'),false);assert.equal(await b.locator('.rb-modal').count(),0);await b.setViewportSize({width:390,height:844});await b.locator('[data-rm-garage-title]').waitFor({state:'visible'});assert.match(await b.locator('[data-rm-garage-title]').innerText(),/🔒.*深夜展厅/);await b.setViewportSize({width:1280,height:900});
 await b.locator('[data-rm-copy]').click();assert.equal(new URL(await b.evaluate(()=>navigator.clipboard.readText())).searchParams.get('pw'),'2468');
 await b.getByRole('button',{name:'准备',exact:true}).click();await a.getByRole('button',{name:'开始比赛',exact:true}).click();
 await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('[data-rm-hint]')?.textContent.includes('正在加载赛道'))));
 assert.ok(messages.some(m=>m.type==='room'&&m.phase==='countdown'));assert.ok(messages.some(m=>m.type==='start'));assert.ok(messages.some(m=>m.type==='rooms'&&m.rooms.some(r=>r.code===code)));
 for(const message of messages)noPasswords(message);
 assert.deepEqual(errors,[]);console.log('通过：双页列表、加锁、错密重试、邀请直入与清理、满员禁用、准备到倒计时、所有消息无密码字段');console.log(`截图：${output}`);
} catch(error){console.error(error);console.error('页面异常：',errors);for(const [i,page] of pages.entries())try{console.error(`页面 ${i+1}：`,await page.locator('body').innerText({timeout:1000}));}catch{}process.exitCode=1;}
finally{
 for(const ws of sockets){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'leave'}));ws.close();}
 for(const page of pages)try{await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));}catch{}
 await browser?.close();
}
