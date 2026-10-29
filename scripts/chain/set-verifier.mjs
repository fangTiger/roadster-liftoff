// 用法：node scripts/chain/set-verifier.mjs --verifier 0x… --network testnet|mainnet [--yes]
// 默认只读预览；只有 --yes 才从 OWNER_KEY 读取账户并发送交易。
import { pathToFileURL } from 'node:url';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getServerConfig } from '../../api/_lib/chain.js';
import { recordsAbi } from '../../src/chain/shared.js';

export function parseVerifierArgs(args) {
  let verifier, network = 'testnet', yes = false; const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error('参数不得重复'); seen.add(flag);
    if (flag === '--yes') { yes = true; continue; }
    if (flag === '--verifier') verifier = args[++i];
    else if (flag === '--network') network = args[++i];
    else throw new Error('用法：--verifier 地址 --network testnet|mainnet [--yes]');
  }
  if (!isAddress(verifier || '', { strict: false }) || !['testnet', 'mainnet'].includes(network)) throw new Error('核实者地址或网络无效');
  return { verifier, network, yes };
}
export async function setVerifier({ verifier, network, yes }, { publicClient, walletClient, account, address, log = console.log }) {
  if (!isAddress(address || '') || !isAddress(verifier || '', { strict: false })) throw new Error('合约或核实者地址无效');
  const read = functionName => publicClient.readContract({ address, abi: recordsAbi, functionName });
  const [current, owner] = await Promise.all([read('verifier'), read('owner')]);
  log(`${network === 'mainnet' ? 'Arc 主网' : 'Arc 测试网'} · 合约 ${address}`);
  log(`核实者：${current} → ${verifier}`);
  if (!yes) { log('仅预览；添加 --yes 才会发送交易'); return; }
  if (!account || account.address.toLowerCase() !== owner.toLowerCase()) throw new Error('OWNER_KEY 对应地址不是合约 owner');
  const { request } = await publicClient.simulateContract({ address, abi: recordsAbi, functionName: 'setVerifier', args: [verifier], account });
  const hash = await walletClient.writeContract(request); log(`核实者配置交易：${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('交易回退，请按哈希核对');
}
async function main() {
  const options = parseVerifierArgs(process.argv.slice(2));
  const config = getServerConfig({ ...process.env, ARC_NETWORK: options.network });
  if (!isAddress(config.address)) throw new Error('请配置有效 RACING_ADDRESS');
  let account;
  if (options.yes) {
    try {
      if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.OWNER_KEY || '')) throw new Error();
      account = privateKeyToAccount(process.env.OWNER_KEY);
    } catch { throw new Error('请在自己的终端配置有效 OWNER_KEY'); }
  }
  await setVerifier(options, { address: config.address, account, publicClient: createPublicClient({ chain: config.chain, transport: http() }), walletClient: account && createWalletClient({ chain: config.chain, account, transport: http() }) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 不转发底层异常，防止账户对象中的私钥随诊断信息输出。
  main().catch(() => { console.error('核实者配置失败：请检查参数、网络、RACING_ADDRESS、OWNER_KEY 和 owner 身份；已发送的交易请按哈希核对。'); process.exitCode = 1; });
}
