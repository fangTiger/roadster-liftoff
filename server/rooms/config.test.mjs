import test from 'node:test';
import assert from 'node:assert/strict';

test('默认配置保留本地开发监听与来源行为',async()=>{
 const {readConfig}=await import('./config.js');
 assert.deepEqual(readConfig({}),{port:8933,host:undefined,allowedOrigins:[],maxPerIP:10,maxConnections:500,trustProxy:false});
});
test('环境配置优先级、白名单清理与显式代理信任',async()=>{
 const {readConfig}=await import('./config.js');
 assert.equal(readConfig({PORT:'9000'}).port,9000);
 assert.deepEqual(readConfig({ROOMS_PORT:'9001',PORT:'9000',ROOMS_HOST:'127.0.0.1',ROOMS_ALLOWED_ORIGINS:' https://a.example, ,https://b.example ',ROOMS_MAX_PER_IP:'2',ROOMS_MAX_CONNECTIONS:'20',ROOMS_TRUST_PROXY:'true'}),{port:9001,host:'127.0.0.1',allowedOrigins:['https://a.example','https://b.example'],maxPerIP:2,maxConnections:20,trustProxy:true});
 assert.equal(readConfig({ROOMS_TRUST_PROXY:'TRUE'}).trustProxy,false);
});
test('非法、非整数、非正数与越界数字回落默认值',async()=>{
 const {readConfig}=await import('./config.js');
 for(const value of ['bad','0','-1','1.2','Infinity','9007199254740992']){
  const config=readConfig({ROOMS_PORT:value,PORT:'9000',ROOMS_MAX_PER_IP:value,ROOMS_MAX_CONNECTIONS:value});
  assert.equal(config.port,8933);assert.equal(config.maxPerIP,10);assert.equal(config.maxConnections,500);
 }
 assert.equal(readConfig({ROOMS_PORT:'65536'}).port,8933);
 assert.equal(readConfig({ROOMS_PORT:'',PORT:'9000'}).port,9000);
});
