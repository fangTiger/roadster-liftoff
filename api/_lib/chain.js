import { createPublicClient, http, ContractFunctionRevertedError } from 'viem';
import { getArcChain, recordsAbi } from '../../src/chain/shared.js';

export const SITE_URL = 'https://mars-roadster.vercel.app';
export class TokenNotFoundError extends Error {}

export function getServerConfig(env = process.env) {
  const network = env.ARC_NETWORK || 'testnet';
  if (!['testnet', 'mainnet'].includes(network)) throw new Error('ARC_NETWORK 配置无效');
  return {
    network,
    chain: getArcChain(network),
    address: (env.RECORDS_ADDRESS || '').trim(),
    siteUrl: (env.SITE_URL || SITE_URL).replace(/\/+$/, ''),
  };
}

export function createTokenReader({ readContract, address, chain = getArcChain() } = {}) {
  let client;
  return async id => {
    // Record.tokenId 是 uint32，超出范围的编号不可能存在。
    if (id > 0xffffffffn) throw new TokenNotFoundError('NFT 不存在');
    if (!address) throw new Error('未配置 RECORDS_ADDRESS');
    // 延迟创建客户端，使无效请求和本地注入测试无需 RPC。
    const read = readContract || (args => {
      client ||= createPublicClient({ chain, transport: http() });
      return client.readContract(args);
    });
    let owner;
    try {
      owner = await read({ address, abi: recordsAbi, functionName: 'ownerOf', args: [id] });
    } catch (error) {
      // 只把 ownerOf 的合约回退视为不存在，RPC 错误交给接口返回 503。
      const revert = error instanceof ContractFunctionRevertedError ? error : error.walk?.(cause => cause instanceof ContractFunctionRevertedError);
      if (revert instanceof ContractFunctionRevertedError) throw new TokenNotFoundError('NFT 不存在');
      throw error;
    }
    const record = await read({ address, abi: recordsAbi, functionName: 'recordOf', args: [owner] });
    return { owner, record };
  };
}

export function getTokenId(request) {
  const id = new URL(request.url).pathname.split('/').at(-1);
  if (!/^[0-9]+$/.test(id || '') || BigInt(id) === 0n) return null;
  return BigInt(id);
}

export function jsonResponse(data, status = 200, cache = 'no-store') {
  return Response.json(data, { status, headers: {
    'Cache-Control': cache,
    'Access-Control-Allow-Origin': '*',
  } });
}

export function tokenErrorResponse(error) {
  return error instanceof TokenNotFoundError
    ? jsonResponse({ error: 'Token not found' }, 404)
    : jsonResponse({ error: 'Unable to read NFT record' }, 503);
}
