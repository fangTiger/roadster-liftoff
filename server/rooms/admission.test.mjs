import test from 'node:test';
import assert from 'node:assert/strict';

test('空白名单不校验；启用后必须提供完整且匹配的 Origin',async()=>{
 const {originAllowed}=await import('./admission.js');
 assert.equal(originAllowed(undefined,[]),true);
 for(const origin of [undefined,'','null','https://other.example','https://game.example/path','https://game.example.evil'])assert.equal(originAllowed(origin,['https://game.example']),false);
 assert.equal(originAllowed('https://game.example',['https://game.example']),true);
});
test('通配仅匹配域名标签内字符，协议与端口严格一致且转义正则字符',async()=>{
 const {originAllowed}=await import('./admission.js'),patterns=['https://mars-roadster-*.vercel.app'];
 assert.equal(originAllowed('https://mars-roadster-preview-123.vercel.app',patterns),true);
 for(const origin of ['https://mars-roadster-a.b.vercel.app','http://mars-roadster-a.vercel.app','https://mars-roadster-a.vercel.app:8443','https://mars-roadster-aXvercel.app','https://mars-roadster-.vercel.app'])assert.equal(originAllowed(origin,patterns),false,origin);
 assert.equal(originAllowed('https://game.example:8443',['https://game.example:8443']),true);
 assert.equal(originAllowed('https://game.example',['https://game.example:8443']),false);
 assert.equal(originAllowed('https://game.example',['*://game.example','https://game.example/path']),false);
});
test('单 IP 上限独立计数，拒绝不占名额，释放后允许重连',async()=>{
 const {createAdmission}=await import('./admission.js'),admission=createAdmission({maxPerIP:1,maxConnections:3});
 assert.equal(admission.tryAcquire('a'),true);assert.equal(admission.tryAcquire('a'),false);assert.equal(admission.tryAcquire('b'),true);
 admission.release('a');admission.release('a');admission.release('unknown');
 assert.equal(admission.tryAcquire('b'),false);assert.equal(admission.tryAcquire('a'),true);assert.equal(admission.tryAcquire('c'),true);assert.equal(admission.tryAcquire('d'),false);
});
test('全服上限涵盖不同 IP，释放只归还已有连接',async()=>{
 const {createAdmission}=await import('./admission.js'),admission=createAdmission({maxPerIP:3,maxConnections:2});
 assert.equal(admission.tryAcquire('a'),true);assert.equal(admission.tryAcquire('b'),true);assert.equal(admission.tryAcquire('c'),false);admission.release('c');assert.equal(admission.tryAcquire('c'),false);admission.release('b');assert.equal(admission.tryAcquire('c'),true);
});
