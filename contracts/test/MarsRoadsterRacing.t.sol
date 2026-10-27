// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Foundry 测试套件：MarsRoadsterRacing
// 覆盖：赛道开关 / TooFast / 首次铸造 / 多玩家 / 成绩更新 / 合并成就 /
//       已持有者 qualify 逻辑 / 签名验证 / 重入防护 /
//       灵魂绑定 / tokenURI / locked / supportsInterface /
//       Owner 操作 / 分页 players() / fuzz

import "forge-std/Test.sol";
import "../MarsRoadsterRacing.sol";

contract MarsRoadsterRacingTest is Test {
    MarsRoadsterRacing internal game;

    // 部署者（owner）
    address internal owner   = address(0xA0);
    address internal alice   = address(0xA1);
    address internal bob     = address(0xA2);
    address internal charlie = address(0xA3);

    // 赛道参数（赛道 1）
    uint8   internal constant TRACK    = 1;
    uint32  internal constant QUALIFY  = 120_000; // 2 分钟，准入门槛
    uint32  internal constant MIN_LAP  = 60_000;  // 1 分钟，物理下限

    string  internal constant BASE_URI = "https://mars-roadster.vercel.app/api/nft/";

    // ── 部署与赛道初始化 ──────────────────────────────────────────────────────

    function setUp() public {
        game = new MarsRoadsterRacing(owner, BASE_URI);
        // 开放赛道 1
        vm.prank(owner);
        game.setTrack(TRACK, QUALIFY, MIN_LAP);
    }

    // ── 辅助：alice 以指定参数提交（无签名模式） ─────────────────────────────

    function _submit(address player, uint8 track, uint32 lapMs, uint32 ach) internal {
        vm.prank(player);
        game.submit(track, lapMs, ach, 0, "");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. 赛道关闭 & TooFast
    // ═══════════════════════════════════════════════════════════════════════════

    function test_closedTrackReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarsRoadsterRacing.TrackClosed.selector, uint8(99)));
        game.submit(99, QUALIFY, 0, 0, "");
    }

    function test_tooFastReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MarsRoadsterRacing.TooFast.selector, MIN_LAP - 1, MIN_LAP)
        );
        game.submit(TRACK, MIN_LAP - 1, 0, 0, "");
    }

    function test_exactMinPasses() public {
        // minLapMs 恰好 — 但高于 qualifyMs 时首次铸造应 revert NotQualified
        // 此处用 QUALIFY（在 [MIN_LAP, QUALIFY] 区间）验证通过
        _submit(alice, TRACK, QUALIFY, 0);
        assertEq(game.totalSupply(), 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. 首次铸造
    // ═══════════════════════════════════════════════════════════════════════════

    function test_lapAboveQualifyReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MarsRoadsterRacing.NotQualified.selector,
                QUALIFY + 1,
                QUALIFY
            )
        );
        game.submit(TRACK, QUALIFY + 1, 0, 0, "");
    }

    function test_firstSubmitMintsToken1() public {
        // 期望 Locked(1)
        vm.expectEmit(false, false, false, true);
        emit MarsRoadsterRacing.Locked(1);

        // 期望 FirstLap
        vm.expectEmit(true, true, true, true);
        emit MarsRoadsterRacing.FirstLap(alice, 1, TRACK, QUALIFY);

        // 期望 LapRecorded(improved=true)
        vm.expectEmit(true, true, false, true);
        emit MarsRoadsterRacing.LapRecorded(alice, TRACK, QUALIFY, true, QUALIFY, 0x5, false);

        _submit(alice, TRACK, QUALIFY, 0x5);

        // 验证 Player 记录
        MarsRoadsterRacing.Player memory p = game.recordOf(alice);
        assertEq(p.tokenId,      1);
        assertEq(p.firstTrack,   TRACK);
        assertEq(p.firstLapMs,   QUALIFY);
        assertEq(p.achievements, 0x5);
        assertGt(p.mintedAt,     0);
        assertEq(p.mintedAt,     p.updatedAt);

        // ERC-721 所有权
        assertEq(game.ownerOf(1), alice);
        assertEq(game.totalSupply(),  1);
        assertEq(game.playerCount(),  1);

        // bestOf
        MarsRoadsterRacing.Best memory b = game.bestOf(alice, TRACK);
        assertEq(b.bestMs,   QUALIFY);
        assertFalse(b.verified);
    }

    function test_secondPlayerGetsTokenId2() public {
        _submit(alice, TRACK, QUALIFY, 0);
        _submit(bob,   TRACK, QUALIFY, 0);

        assertEq(game.totalSupply(), 2);
        assertEq(game.playerCount(), 2);
        assertEq(game.ownerOf(2), bob);
        assertEq(game.recordOf(bob).tokenId, 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. 已持有者更新逻辑
    // ═══════════════════════════════════════════════════════════════════════════

    function test_fasterLapUpdatesBestNotFirstLap() public {
        _submit(alice, TRACK, QUALIFY, 0x1);      // firstLapMs = QUALIFY

        uint32 faster = QUALIFY - 10_000;
        _submit(alice, TRACK, faster, 0x1);

        MarsRoadsterRacing.Player memory p = game.recordOf(alice);
        assertEq(p.firstLapMs, QUALIFY);          // firstLapMs 永不改变
        assertEq(game.bestOf(alice, TRACK).bestMs, faster);
    }

    function test_slowerLapWithNewBitMergesAndKeepsBest() public {
        _submit(alice, TRACK, QUALIFY, 0x1);      // bestMs = QUALIFY

        _submit(alice, TRACK, QUALIFY + 5_000, 0x6); // 更慢，但新 bits

        MarsRoadsterRacing.Player memory p = game.recordOf(alice);
        assertEq(game.bestOf(alice, TRACK).bestMs, QUALIFY); // bestMs 不变
        assertEq(p.achievements, 0x7);            // 0x1 | 0x6
    }

    function test_slowerLapNoNewBitReverts() public {
        _submit(alice, TRACK, QUALIFY, 0x3);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.NothingToUpdate.selector);
        game.submit(TRACK, QUALIFY + 1, 0x1, 0, ""); // 0x1 ⊆ 0x3 且更慢
    }

    function test_holderFirstLapOnSecondTrack() public {
        // 先在赛道 1 铸造
        _submit(alice, TRACK, QUALIFY, 0);

        // 开放赛道 2（qualifyMs = QUALIFY，minLapMs = MIN_LAP）
        vm.prank(owner);
        game.setTrack(2, QUALIFY, MIN_LAP);

        // 已持有者在赛道 2 提交（允许高于 qualify，因为已有 token）
        uint32 lapAboveQualify = QUALIFY + 30_000;
        _submit(alice, 2, lapAboveQualify, 0);

        assertEq(game.bestOf(alice, 2).bestMs, lapAboveQualify);
    }

    function test_holderLapAboveQualifyAcceptedIfImproves() public {
        _submit(alice, TRACK, QUALIFY, 0); // 铸造

        // 已持有者，更慢的成绩（高于 qualify），应被接受（因为有新 bit）
        _submit(alice, TRACK, QUALIFY + 1, 0x2);
        assertEq(game.recordOf(alice).achievements, 0x2);
        assertEq(game.bestOf(alice, TRACK).bestMs, QUALIFY); // bestMs 不变（更慢）
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Verifier 签名模式
    // ═══════════════════════════════════════════════════════════════════════════

    // 用于签名测试的私钥对
    uint256 internal constant VERIFIER_PK = 0xBEEF;
    address internal verifierAddr = vm.addr(VERIFIER_PK);

    function _signLap(
        address player,
        uint8   trackId,
        uint32  lapMs,
        uint32  achievements,
        uint64  deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            game.lapTypehash(),
            player,
            trackId,
            lapMs,
            achievements,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            game.domainSeparator(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_PK, digest);
        return abi.encodePacked(r, s, v);
    }

    function _enableVerifier() internal {
        vm.prank(owner);
        game.setVerifier(verifierAddr);
    }

    function test_validSignaturePasses() public {
        _enableVerifier();
        uint64 deadline = uint64(block.timestamp + 300);
        bytes memory sig = _signLap(alice, TRACK, QUALIFY, 0x1, deadline);

        vm.prank(alice);
        game.submit(TRACK, QUALIFY, 0x1, deadline, sig);

        assertTrue(game.bestOf(alice, TRACK).verified);
    }

    function test_wrongSignerReverts() public {
        _enableVerifier();
        uint64 deadline = uint64(block.timestamp + 300);
        // 用另一个私钥签名
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xDEAD, keccak256("garbage"));
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.BadSignature.selector);
        game.submit(TRACK, QUALIFY, 0x1, deadline, badSig);
    }

    function test_signatureForOtherPlayerReverts() public {
        _enableVerifier();
        uint64 deadline = uint64(block.timestamp + 300);
        // 签名的 player 是 bob，但调用方是 alice
        bytes memory sig = _signLap(bob, TRACK, QUALIFY, 0, deadline);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.BadSignature.selector);
        game.submit(TRACK, QUALIFY, 0, deadline, sig);
    }

    function test_changedLapMsReverts() public {
        _enableVerifier();
        uint64 deadline = uint64(block.timestamp + 300);
        bytes memory sig = _signLap(alice, TRACK, QUALIFY, 0, deadline);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.BadSignature.selector);
        game.submit(TRACK, QUALIFY - 1, 0, deadline, sig); // lapMs 被篡改
    }

    function test_changedAchievementsReverts() public {
        _enableVerifier();
        uint64 deadline = uint64(block.timestamp + 300);
        bytes memory sig = _signLap(alice, TRACK, QUALIFY, 0, deadline);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.BadSignature.selector);
        game.submit(TRACK, QUALIFY, 0x1, deadline, sig); // achievements 被篡改
    }

    function test_changedTrackIdReverts() public {
        _enableVerifier();
        // 开放赛道 2
        vm.prank(owner);
        game.setTrack(2, QUALIFY, MIN_LAP);

        uint64 deadline = uint64(block.timestamp + 300);
        bytes memory sig = _signLap(alice, TRACK, QUALIFY, 0, deadline);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.BadSignature.selector);
        game.submit(2, QUALIFY, 0, deadline, sig); // trackId 被篡改
    }

    function test_expiredDeadlineReverts() public {
        _enableVerifier();
        uint64 deadline = uint64(block.timestamp - 1); // 已过期
        bytes memory sig = _signLap(alice, TRACK, QUALIFY, 0, deadline);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.Expired.selector);
        game.submit(TRACK, QUALIFY, 0, deadline, sig);
    }

    function test_setVerifierZeroReturnsSelfReported() public {
        _enableVerifier();
        vm.prank(owner);
        game.setVerifier(address(0));

        // 现在不需要签名，verified 应为 false
        _submit(alice, TRACK, QUALIFY, 0);
        assertFalse(game.bestOf(alice, TRACK).verified);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. 重入防护（_mint 而非 _safeMint）
    // ═══════════════════════════════════════════════════════════════════════════

    function test_reentrancyBlocked() public {
        ReentrantRacer attacker = new ReentrantRacer(game, TRACK, QUALIFY);
        attacker.attack();
        // 只应拥有 1 个 token
        assertEq(game.balanceOf(address(attacker)), 1);
        assertEq(game.totalSupply(), 1);
        assertEq(game.playerCount(), 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. 灵魂绑定
    // ═══════════════════════════════════════════════════════════════════════════

    function test_transferFromReverts() public {
        _submit(alice, TRACK, QUALIFY, 0);
        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.Soulbound.selector);
        game.transferFrom(alice, bob, 1);
    }

    function test_safeTransferFromReverts() public {
        _submit(alice, TRACK, QUALIFY, 0);
        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.Soulbound.selector);
        game.safeTransferFrom(alice, bob, 1);
    }

    function test_approveReverts() public {
        _submit(alice, TRACK, QUALIFY, 0);
        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.Soulbound.selector);
        game.approve(bob, 1);
    }

    function test_setApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRacing.Soulbound.selector);
        game.setApprovalForAll(bob, true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. tokenURI / locked / supportsInterface
    // ═══════════════════════════════════════════════════════════════════════════

    function test_tokenURI() public {
        _submit(alice, TRACK, QUALIFY, 0);
        assertEq(game.tokenURI(1), string.concat(BASE_URI, "1"));
    }

    function test_tokenURINonexistentReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99)
        );
        game.tokenURI(99);
    }

    function test_lockedTrue() public {
        _submit(alice, TRACK, QUALIFY, 0);
        assertTrue(game.locked(1));
    }

    function test_lockedNonexistentReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99)
        );
        game.locked(99);
    }

    function test_supportsInterfaceERC721() public view {
        assertTrue(game.supportsInterface(0x80ac58cd));
    }

    function test_supportsInterfaceERC5192() public view {
        assertTrue(game.supportsInterface(0xb45a3c0e));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. Owner 操作
    // ═══════════════════════════════════════════════════════════════════════════

    function test_setTrackLowerMinReverts() public {
        vm.prank(owner);
        vm.expectRevert(MarsRoadsterRacing.MinCanOnlyIncrease.selector);
        game.setTrack(TRACK, QUALIFY, MIN_LAP - 1);
    }

    function test_setTrackQualifyBelowMinReverts() public {
        vm.prank(owner);
        vm.expectRevert(MarsRoadsterRacing.InvalidConfig.selector);
        game.setTrack(TRACK, MIN_LAP - 1, MIN_LAP); // qualify < min
    }

    function test_setTrackCloseWithZeroOk() public {
        vm.prank(owner);
        game.setTrack(TRACK, 0, MIN_LAP); // qualifyMs=0 = 关闭
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarsRoadsterRacing.TrackClosed.selector, TRACK));
        game.submit(TRACK, QUALIFY, 0, 0, "");
    }

    function test_setTrackNonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setTrack(TRACK, QUALIFY + 1, MIN_LAP);
    }

    function test_setVerifierOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setVerifier(alice);

        vm.prank(owner);
        game.setVerifier(alice);
        assertEq(game.verifier(), alice);
    }

    function test_setBaseURIOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setBaseURI("https://evil.example/");

        vm.prank(owner);
        game.setBaseURI("https://new.example/");

        _submit(alice, TRACK, QUALIFY, 0);
        assertEq(game.tokenURI(1), "https://new.example/1");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. players() 分页
    // ═══════════════════════════════════════════════════════════════════════════

    function test_playersPagination() public {
        _submit(alice,   TRACK, QUALIFY,          0);
        _submit(bob,     TRACK, QUALIFY - 1_000,  0x1);
        _submit(charlie, TRACK, QUALIFY - 2_000,  0x3);

        // 全部：start=0, count=3
        (address[] memory addrs, , MarsRoadsterRacing.Best[] memory tbests) =
            game.players(TRACK, 0, 3);
        assertEq(addrs.length, 3);
        assertEq(addrs[0], alice);
        assertEq(addrs[1], bob);
        assertEq(addrs[2], charlie);
        assertEq(tbests[0].bestMs, QUALIFY);
        assertEq(tbests[1].bestMs, QUALIFY - 1_000);
        assertEq(tbests[2].bestMs, QUALIFY - 2_000);

        // 中间页：start=1, count=2
        (addrs, , ) = game.players(TRACK, 1, 2);
        assertEq(addrs.length, 2);
        assertEq(addrs[0], bob);

        // count 超出末尾：start=2, count=10
        (addrs, , ) = game.players(TRACK, 2, 10);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], charlie);

        // start 越界：返回空
        (addrs, , ) = game.players(TRACK, 100, 5);
        assertEq(addrs.length, 0);

        // 查询玩家从未跑过的赛道，bestMs 为零
        (, , MarsRoadsterRacing.Best[] memory otherBests) = game.players(2, 0, 3);
        assertEq(otherBests[0].bestMs, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. Fuzz：单圈序列 → bestMs == 最小值；achievements == 所有提交的 OR
    // ═══════════════════════════════════════════════════════════════════════════

    function testFuzz_lapSequence(
        uint32 t1, uint32 t2,
        uint32 a1, uint32 a2
    ) public {
        // 钳制到 [MIN_LAP, QUALIFY]
        t1 = MIN_LAP + (t1 % (QUALIFY - MIN_LAP + 1));
        t2 = MIN_LAP + (t2 % (QUALIFY - MIN_LAP + 1));

        _submit(alice, TRACK, t1, a1);

        bool improved = t2 < t1;
        bool hasNewBit = (a1 | a2) != a1;

        if (!improved && !hasNewBit) {
            vm.prank(alice);
            vm.expectRevert(MarsRoadsterRacing.NothingToUpdate.selector);
            game.submit(TRACK, t2, a2, 0, "");
            return;
        }
        if (t2 == t1 && !hasNewBit) {
            // 相同时间，无新 bit：NothingToUpdate
            vm.prank(alice);
            vm.expectRevert(MarsRoadsterRacing.NothingToUpdate.selector);
            game.submit(TRACK, t2, a2, 0, "");
            return;
        }

        _submit(alice, TRACK, t2, a2);

        assertEq(game.bestOf(alice, TRACK).bestMs, t2 < t1 ? t2 : t1);
        assertEq(game.recordOf(alice).achievements, a1 | a2);
        assertEq(game.recordOf(alice).firstLapMs, t1); // firstLapMs 永不改变
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 辅助合约
// ─────────────────────────────────────────────────────────────────────────────

/// @dev 重入攻击合约：实现 onERC721Received 并在回调中再次调用 submit。
///      因为合约使用 _mint（非 _safeMint），此回调不会被触发。
///      即使被触发，CEI 顺序已将 tokenId 写入，重入会走 else 分支。
contract ReentrantRacer {
    MarsRoadsterRacing private immutable _game;
    uint8              private immutable _track;
    uint32             private immutable _qualify;
    bool               private _attacking;

    constructor(MarsRoadsterRacing g, uint8 track, uint32 qualify) {
        _game    = g;
        _track   = track;
        _qualify = qualify;
    }

    function attack() external {
        _attacking = true;
        _game.submit(_track, _qualify, 0, 0, "");
        _attacking = false;
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (_attacking) {
            try _game.submit(_track, _qualify, 0, 0, "") {} catch {}
        }
        return this.onERC721Received.selector;
    }
}
