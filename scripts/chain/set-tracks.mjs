// 用法：node scripts/chain/set-tracks.mjs --track 1:60000:10000 --track 2:80000:15000 --track 3:120000:20000 [--yes]
// 参数均为毫秒；默认只读预览，只有 --yes 才读取 OWNER_KEY 并发送交易。
import { pathToFileURL } from 'node:url';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getArcChain, recordsAbi, TESTNET_RACING_ADDRESS } from '../../src/chain/shared.js';

export function parseTrackArgs(args) {
  const tracks = []; let yes = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--yes' && !yes) { yes = true; continue; }
    if (args[i] !== '--track' || !/^[1-3]:\d+:\d+$/.test(args[i + 1] || '')) throw new Error('用法：--track 赛道编号:资格线毫秒:下限毫秒，三条赛道各一次；可加 --yes');
    const [id, qualifyMs, minLapMs] = args[++i].split(':').map(Number);
    if ([qualifyMs, minLapMs].some(n => !Number.isSafeInteger(n) || n > 0xffffffff) || (qualifyMs !== 0 && qualifyMs < minLapMs) || tracks.some(t => t.id === id)) throw new Error('赛道参数无效：毫秒必须为 uint32、资格线不得小于下限、编号不能重复');
    tracks.push({ id, qualifyMs, minLapMs });
  }
  if (tracks.length !== 3) throw new Error('必须提供三条赛道参数');
  return { tracks: tracks.sort((a, b) => a.id - b.id), yes };
}
export async function setTracks({ tracks, yes }, { publicClient, walletClient, account, address = TESTNET_RACING_ADDRESS, log = console.log }) {
  const read = (functionName, args = []) => publicClient.readContract({ address, abi: recordsAbi, functionName, args });
  const [owner, ...current] = await Promise.all([read('owner'), ...tracks.map(t => read('trackOf', [t.id]))]);
  log(`Arc 测试网 · 合约 ${address}`);
  tracks.forEach((track, i) => log(`赛道 ${track.id}：资格线 ${current[i].qualifyMs} → ${track.qualifyMs} ms；下限 ${current[i].minLapMs} → ${track.minLapMs} ms`));
  if (tracks.some((track, i) => track.minLapMs < Number(current[i].minLapMs))) throw new Error('下限只能调高，未发送任何交易');
  if (!yes) { log('仅预览；添加 --yes 才会发送交易'); return; }
  if (!account || account.address.toLowerCase() !== owner.toLowerCase()) throw new Error('OWNER_KEY 对应地址不是合约 owner');
  // 全部模拟通过后才开始发送，避免已知配置错误造成部分写入。
  const requests = await Promise.all(tracks.map(track => publicClient.simulateContract({ address, abi: recordsAbi, functionName: 'setTrack', args: [track.id, track.qualifyMs, track.minLapMs], account })));
  for (let i = 0; i < requests.length; i++) {
    const hash = await walletClient.writeContract(requests[i].request);
    log(`赛道 ${tracks[i].id} 交易：${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('交易回退，停止发送后续配置');
  }
}
async function main() {
  const options = parseTrackArgs(process.argv.slice(2)), chain = getArcChain();
  const address = process.env.RACING_ADDRESS?.trim() || TESTNET_RACING_ADDRESS;
  if (!isAddress(address)) throw new Error('RACING_ADDRESS 无效');
  let account;
  if (options.yes) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.OWNER_KEY || '')) throw new Error('请在自己的终端设置有效 OWNER_KEY');
    account = privateKeyToAccount(process.env.OWNER_KEY);
  }
  await setTracks(options, { address, account, publicClient: createPublicClient({ chain, transport: http() }), walletClient: account && createWalletClient({ chain, account, transport: http() }) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('赛道配置失败：请检查参数、OWNER_KEY、owner 身份、链上配置及网络。已发送的交易请按哈希核对。'); process.exitCode = 1; });
}
