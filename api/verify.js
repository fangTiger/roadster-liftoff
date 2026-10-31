import { isAddress } from 'viem';
import { createRaceReader, getServerConfig, jsonResponse } from './_lib/chain.js';
import { verifyReplay } from './_lib/replay.js';
import { signLap } from './_lib/sign.js';
import { createGhostStore } from './_lib/ghost-store.js';

const MAX_BODY_BYTES = 128 * 1024;
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw Object.assign(new Error(), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw Object.assign(new Error(), { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function createVerifyHandler(options = {}) {
  const windows = new Map(), now = options.now || Date.now;
  return async request => {
    const time = now(), ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
    // 清理过期窗口，避免无界积累；限流先于解析和昂贵的重放。
    for (const [key, value] of windows) if (time >= value.reset) windows.delete(key);
    const window = windows.get(ip) || { count: 0, reset: time + 60000 };
    if (++window.count > 10) {
      const response = jsonResponse({ error: '核实请求过于频繁，请稍后重试' }, 429);
      response.headers.set('Retry-After', String(Math.max(1, Math.ceil((window.reset - time) / 1000)))); return response;
    }
    windows.set(ip, window);
    let body;
    try { body = await readBody(request); }
    catch (error) { return jsonResponse({ error: error.status === 413 ? '请求体超过 128 KB' : '请求 JSON 无效' }, error.status === 413 ? 413 : 400); }
    if (!body || typeof body.address !== 'string' || !isAddress(body.address, { strict: false }) || ![1, 2, 3].includes(body.trackId) || !body.replay || !Number.isInteger(body.bits0to19) || body.bits0to19 < 0 || body.bits0to19 > 0xffffffff) return jsonResponse({ error: '地址、赛道、录像或成就位无效' }, 400);
    try {
      const config = { ...getServerConfig(), ...options }, reader = createRaceReader(config);
      const track = await (options.readTrack || reader.readTrack)(body.trackId);
      let result;
      try { result = (options.replayVerifier || verifyReplay)(body.replay, { trackId: body.trackId, qualifyMs: track.qualifyMs }); }
      catch { return jsonResponse({ error: '录像无效或未完成三圈，请重新比赛' }, 400); }
      const lapMs = Math.round(result.bestLap * 1000), achievements = (body.bits0to19 & 0xfffff) | (result.achievements & 0xff00000), deadline = Math.floor(now() / 1000) + 1800;
      const signed = await (options.signer || signLap)({ player: body.address, trackId: body.trackId, lapMs, achievements, deadline }, { chainId: config.chain.id, address: config.address });
      const storage = options.store || createGhostStore({ chainId: config.chain.id });
      await storage.put(body.trackId, body.address, body.replay, lapMs);
      return jsonResponse({ lapMs, achievements, deadline, ...signed });
    } catch { return jsonResponse({ error: '核实服务暂不可用，请稍后重试' }, 503); }
  };
}
// 模块级实例使同一进程的请求共享限流计数。
export const POST = createVerifyHandler();
