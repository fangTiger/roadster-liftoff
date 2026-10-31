import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isAddress } from 'viem';

// 本地服务为单进程；不同存储实例共享写入队列，原子替换避免读到半份 JSON。
const writes = new Map();
export function createFileGhostStore({ chainId, directory = '.local-data', now = Date.now }) {
  function path(trackId, address = '') {
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || ![1, 2, 3].includes(trackId) || (address && !isAddress(address, { strict: false }))) throw new Error('影子存储路径无效');
    return resolve(directory, 'ghosts', String(chainId), String(trackId), address ? `${address.toLowerCase()}.json` : '.');
  }
  const url = (trackId, address) => `/api/ghost?trackId=${trackId}&address=${address.toLowerCase()}`;
  async function load(filename) {
    try { return JSON.parse(await readFile(filename, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return {
    async get(trackId, address) {
      const record = await load(path(trackId, address));
      return record ? { ...record, url: url(trackId, address) } : null;
    },
    async list(trackId) {
      const folder = path(trackId);
      let files;
      try { files = await readdir(folder); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      return files.filter(file => /^0x[0-9a-f]{40}\.json$/.test(file)).sort().map(file => ({ pathname: join(folder, file), url: url(trackId, file.slice(0, -5)) }));
    },
    async put(trackId, address, replay, bestMs) {
      const filename = path(trackId, address);
      if (!Number.isInteger(bestMs) || bestMs <= 0) throw new Error('影子圈速无效');
      const previous = writes.get(filename) || Promise.resolve();
      const pending = previous.catch(() => {}).then(async () => {
        const old = await load(filename);
        if (old && old.bestMs <= bestMs) return false;
        await mkdir(dirname(filename), { recursive: true });
        const temporary = `${filename}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify({ ...replay, bestMs, updatedAt: Math.floor(now() / 1000) }), { flag: 'wx' });
          await rename(temporary, filename);
          return true;
        } finally { await rm(temporary, { force: true }); }
      });
      writes.set(filename, pending);
      try { return await pending; }
      finally { if (writes.get(filename) === pending) writes.delete(filename); }
    },
  };
}
