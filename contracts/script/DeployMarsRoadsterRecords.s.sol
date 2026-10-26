// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// 部署脚本：MarsRoadsterRecords
// 用法：forge script contracts/script/DeployMarsRoadsterRecords.s.sol \
//         --rpc-url <RPC_URL> --broadcast --private-key $PRIVATE_KEY

import "forge-std/Script.sol";
import "../MarsRoadsterRecords.sol";

contract DeployMarsRoadsterRecords is Script {
    function run() external {
        // 部署参数
        // initialOwner   — 部署者钱包地址（由 msg.sender 决定）
        // minRoundTripMs — 最短往返时间：42 秒（毫秒）
        // baseURI_       — NFT 元数据 API 前缀
        uint32  minRoundTripMs = 42_000;
        string memory baseURI = "https://mars-roadster.vercel.app/api/nft/";

        vm.startBroadcast();

        MarsRoadsterRecords instance = new MarsRoadsterRecords(
            msg.sender,
            minRoundTripMs,
            baseURI
        );

        vm.stopBroadcast();

        // 打印部署地址，方便脚本外部捕获
        console2.log("MarsRoadsterRecords deployed at:", address(instance));
        console2.log("Owner:", msg.sender);
        console2.log("minRoundTripMs:", minRoundTripMs);
        console2.log("baseURI:", baseURI);
    }
}
