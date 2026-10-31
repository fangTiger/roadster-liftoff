import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIP } from './connection-ip.js';
test('只有显式信任代理时才使用 X-Forwarded-For 的第一个 IP',()=>{
 const request={socket:{remoteAddress:'::ffff:192.0.2.3'},headers:{'x-forwarded-for':'198.51.100.7, 198.51.100.8'}};
 assert.equal(clientIP(request),'192.0.2.3');
 assert.equal(clientIP(request,true),'198.51.100.7');
 request.headers['x-forwarded-for']='伪造, 198.51.100.8';assert.equal(clientIP(request,true),'192.0.2.3');
 request.headers={};assert.equal(clientIP(request,true),'192.0.2.3');
});
