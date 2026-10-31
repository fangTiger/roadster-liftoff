import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { POST } from '../../api/verify.js';
import { GET as ghostGET } from '../../api/ghost.js';
import { createMetadataHandler } from '../../api/nft/[id].js';
import { createImageHandler } from '../../api/nft/image/[id].js';
import { createViewHandler } from '../../api/nft/view/[id].js';
import { jsonResponse } from '../../api/_lib/chain.js';

export function createApiServer(options = {}) {
  const local = { siteUrl: process.env.SITE_URL || 'http://localhost:8932' };
  const routes = [
    [/^\/api\/verify$/, 'POST', options.verify || POST],
    [/^\/api\/ghost$/, 'GET', options.ghost || ghostGET],
    [/^\/api\/nft\/[^/]+$/, 'GET', options.metadata || createMetadataHandler(local)],
    [/^\/api\/nft\/image\/[^/]+$/, 'GET', options.image || createImageHandler(local)],
    [/^\/api\/nft\/view\/[^/]+$/, 'GET', options.view || createViewHandler(local)],
  ];
  return createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, 'http://localhost:8934');
      const route = routes.find(([pattern]) => pattern.test(url.pathname));
      let response;
      if (!route) response = jsonResponse({ error: '接口不存在' }, 404);
      else if (incoming.method !== route[1]) {
        response = jsonResponse({ error: '请求方法不支持' }, 405); response.headers.set('Allow', route[1]);
      } else {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        // 本地仅信任实际连接来源，防止伪造转发头绕过核实限流。
        headers.set('x-forwarded-for', incoming.socket.remoteAddress || 'local');
        const request = new Request(url, { method: incoming.method, headers,
          ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
        });
        response = await route[2](request);
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
      else outgoing.end();
    } catch {
      // 禁止输出原始异常，避免签名客户端或上游错误夹带敏感环境信息。
      if (!outgoing.headersSent) { outgoing.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); outgoing.end(JSON.stringify({ error: '本地接口处理失败' })); }
      else outgoing.destroy();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.API_PORT || 8934);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('API_PORT 必须是有效端口'); process.exitCode = 1; }
  else {
    const server = createApiServer();
    server.on('error', () => { console.error('本地接口启动失败，请检查端口'); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`本地接口：http://127.0.0.1:${port}（录像存储：${process.env.GHOST_STORE === 'file' ? '文件' : 'Blob'}）`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  }
}
