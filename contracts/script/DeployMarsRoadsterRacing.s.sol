// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// 部署脚本：MarsRoadsterRacing
// 用法（手动部署）：
//   forge script contracts/script/DeployMarsRoadsterRacing.s.sol \
//     --rpc-url <RPC_URL> --broadcast --private-key $PRIVATE_KEY

import "forge-std/Script.sol";
import "../MarsRoadsterRacing.sol";

contract DeployMarsRoadsterRacing is Script {
    function run() external {
        // ── 部署参数 ─────────────────────────────────────────────────────────
        // initialOwner — 部署后可调用 setTrack / setVerifier / setBaseURI 的地址
        // baseURI_     — NFT 元数据 API 前缀（tokenId 会拼接在后面）
        address initialOwner = 0x737301a6A40ea453A877627c409EF5756a395DB9;
        string memory baseURI = "https://mars-roadster.vercel.app/api/nft/";

        vm.startBroadcast();

        MarsRoadsterRacing instance = new MarsRoadsterRacing(initialOwner, baseURI);

        vm.stopBroadcast();

        console2.log("MarsRoadsterRacing deployed at:", address(instance));
        console2.log("Owner:", initialOwner);
        console2.log("baseURI:", baseURI);
        console2.log("Note: call setTrack() from owner wallet to open tracks before players can submit.");
    }
}
