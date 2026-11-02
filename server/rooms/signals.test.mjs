import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

for(const signal of ['SIGTERM','SIGINT'])test(`${signal} 实际入口发送维护并以 1012 关闭后退出`,{timeout:10000},async t=>{
 const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const child=spawn(process.execPath,[fileURLToPath(new URL('./server.js',import.meta.url))],{env:{...process.env,ROOMS_HOST:'127.0.0.1',ROOMS_PORT:String(port),ROOMS_ALLOWED_ORIGINS:'',ROOMS_MAX_PER_IP:'10',ROOMS_MAX_CONNECTIONS:'500'},stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 const exited=once(child,'exit');
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(new Error(`子进程提前退出：${code}`)));child.stdout.on('data',data=>{if(data.toString().includes('房间服务已启动'))resolve();});});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/rooms`);t.after(()=>ws.terminate());await once(ws,'open');
 const message=once(ws,'message'),closed=once(ws,'close');child.kill(signal);
 assert.deepEqual(JSON.parse((await message)[0].toString()),{type:'maintenance'});assert.equal((await closed)[0],1012);assert.deepEqual(await exited,[0,null]);
});
