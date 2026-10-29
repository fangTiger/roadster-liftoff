import { privateKeyToAccount } from 'viem/accounts';
import { getServerConfig } from './chain.js';

export const LAP_TYPE = 'Lap(address player,uint8 trackId,uint32 lapMs,uint32 achievements,uint64 deadline)';
export const LAP_TYPES = { Lap: [
  { name: 'player', type: 'address' }, { name: 'trackId', type: 'uint8' },
  { name: 'lapMs', type: 'uint32' }, { name: 'achievements', type: 'uint32' }, { name: 'deadline', type: 'uint64' },
] };
export function lapTypedData(message, { chainId, address } = {}) {
  return { domain: { name: 'MarsRoadsterRacing', version: '1', chainId, verifyingContract: address }, types: LAP_TYPES, primaryType: 'Lap', message };
}
export async function signLap(message, config) {
  // 只从环境读取，任何底层错误均替换，避免把密钥带入错误或日志。
  try {
    const key = process.env.VERIFIER_PRIVATE_KEY;
    if (!/^0x[0-9a-fA-F]{64}$/.test(key || '')) throw new Error();
    const account = privateKeyToAccount(key);
    if (!config) { const server = getServerConfig(); config = { chainId: server.chain.id, address: server.address }; }
    return { signature: await account.signTypedData(lapTypedData(message, config)), verifier: account.address };
  } catch { throw new Error('核实签名服务未配置'); }
}
