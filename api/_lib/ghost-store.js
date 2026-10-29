import * as blobSdk from '@vercel/blob';
import { isAddress } from 'viem';

export function createGhostStore({ chainId, token = process.env.BLOB_READ_WRITE_TOKEN, blob = blobSdk, now = Date.now } = {}) {
  function path(trackId, address = '') {
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || ![1, 2, 3].includes(trackId) || (address && !isAddress(address, { strict: false }))) throw new Error('影子存储路径无效');
    if (!token) throw new Error('影子存储未配置');
    return `ghosts/${chainId}/${trackId}/${address ? address.toLowerCase() + '.json' : ''}`;
  }
  async function load(pathname) {
    let metadata;
    try { metadata = await blob.head(pathname, { token }); }
    catch (error) { if (error instanceof blobSdk.BlobNotFoundError) return null; throw error; }
    if (!metadata.etag) throw new Error('影子存储缺少版本信息');
    // 当前 SDK 的 public get 不响应 useCache:false；先读源站元数据，以 ETag 隔离 CDN 缓存。
    const versionedUrl = new URL(metadata.url); versionedUrl.searchParams.set('v', metadata.etag);
    const response = await blob.get(versionedUrl.href, { access: 'public', token });
    if (!response) return null;
    if (response.statusCode !== 200) throw new Error('影子存储读取失败');
    return { ...await new Response(response.stream).json(), url: metadata.url, etag: response.blob.etag || response.headers.get('etag') };
  }
  return {
    get: (trackId, address) => load(path(trackId, address)),
    async list(trackId) {
      const prefix = path(trackId), entries = []; let cursor;
      do {
        const page = await blob.list({ prefix, cursor, token });
        entries.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return entries;
    },
    async put(trackId, address, replay, bestMs) {
      const pathname = path(trackId, address);
      if (!Number.isInteger(bestMs) || bestMs <= 0) throw new Error('影子圈速无效');
      // ETag 条件写入与首次禁止覆盖，保证跨实例并发也只保留更快的录像。
      for (let attempt = 0; attempt < 5; attempt++) {
        const old = await load(pathname);
        if (old && old.bestMs <= bestMs) return false;
        if (old && !old.etag) throw new Error('影子存储缺少版本信息');
        try {
          await blob.put(pathname, JSON.stringify({ ...replay, bestMs, updatedAt: Math.floor(now() / 1000) }), {
            access: 'public', token, addRandomSuffix: false,
            contentType: 'application/json', cacheControlMaxAge: 60, ...(old ? { ifMatch: old.etag } : { allowOverwrite: false }),
          });
          return true;
        } catch (error) {
          if (!(error instanceof blobSdk.BlobPreconditionFailedError) && error.status !== 412 && !/already exists/i.test(error.message || '')) throw error;
        }
      }
      throw new Error('影子存储写入冲突，请重试');
    },
  };
}
