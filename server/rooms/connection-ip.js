import { isIP } from 'node:net';

// 默认使用套接字地址；仅显式信任代理时读取转发链的第一个地址。
export function clientIP(request, trustProxy = false) {
 const direct=request.socket.remoteAddress??'';
 const forwarded=request.headers['x-forwarded-for'];
 const first=typeof forwarded==='string'?forwarded.split(',')[0].trim():'';
 const address=trustProxy&&isIP(first)?first:direct;
 return address.startsWith('::ffff:')&&isIP(address.slice(7))===4?address.slice(7):address;
}
