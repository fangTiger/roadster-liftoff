import test from 'node:test';
import assert from 'node:assert/strict';
import { createShutdown } from './shutdown.js';

function fixture(stuck=false){
 const calls=[],jobs=new Map();let serial=0;
 const sockets=[{readyState:1,send:raw=>calls.push(JSON.parse(raw)),close:code=>calls.push(['close',code])},{readyState:3,send:()=>assert.fail('不能通知已关闭连接'),close:()=>assert.fail('不能重复关闭连接')}];
 const shutdown=createShutdown({server:{close:()=>calls.push('stop')},wss:{clients:new Set(sockets),close:fn=>{calls.push('wss');if(!stuck)fn();}},cleanup:()=>calls.push('cleanup'),exit:code=>calls.push(['exit',code]),setTimeout:(fn,ms)=>{jobs.set(++serial,{fn,ms});return serial;},clearTimeout:id=>jobs.delete(id)});
 const advance=ms=>{for(const [id,job] of [...jobs])if(job.ms===ms){jobs.delete(id);job.fn();}};
 return {shutdown,calls,jobs,advance};
}
test('停监听后通知，500ms 后以 1012 关闭，清理计时器并退出，重复信号无副作用',()=>{
 const f=fixture();f.shutdown();f.shutdown();assert.deepEqual(f.calls,['stop',{type:'maintenance'}]);assert.deepEqual([...f.jobs.values()].map(j=>j.ms).sort((a,b)=>a-b),[500,3000]);
 f.advance(500);assert.deepEqual(f.calls,['stop',{type:'maintenance'},['close',1012],'wss','cleanup',['exit',0]]);assert.equal(f.jobs.size,0);
});
test('连接不完成关闭时三秒兜底清理并强制退出',()=>{
 const f=fixture(true);f.shutdown();f.advance(500);assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='exit'),false);f.advance(3000);assert.deepEqual(f.calls.slice(-2),['cleanup',['exit',1]]);assert.equal(f.jobs.size,0);
});
