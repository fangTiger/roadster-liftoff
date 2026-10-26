// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Foundry 测试套件：MarsRoadsterRecords
// 覆盖：首次 submit / 多玩家 / 成绩更新 / 合并成就 / 拒绝条件 /
//        灵魂绑定 / tokenURI / locked / supportsInterface / Owner 操作 /
//        分页 players() / fuzz

import "forge-std/Test.sol";
import "../MarsRoadsterRecords.sol";

contract MarsRoadsterRecordsTest is Test {
    MarsRoadsterRecords internal rec;

    address internal owner   = address(0xA0);
    address internal alice   = address(0xA1);
    address internal bob     = address(0xA2);
    address internal charlie = address(0xA3);

    uint32  internal constant MIN   = 42_000;   // 42 秒（毫秒）
    string  internal constant BASE  = "https://mars-roadster.vercel.app/api/nft/";

    // ── 部署 ─────────────────────────────────────────────────────────────────

    function setUp() public {
        rec = new MarsRoadsterRecords(owner, MIN, BASE);
    }

    // ── 辅助：alice 首次提交 ──────────────────────────────────────────────────

    function _aliceFirst(uint32 ms, uint32 ach) internal {
        vm.prank(alice);
        rec.submit(ms, ach);
    }

    // ── 1. 首次 submit：铸造 tokenId 1，发出 Locked 和 Recorded(improved=true) ──

    function test_firstSubmitMintsToken1() public {
        // 期望 Locked(1)
        vm.expectEmit(false, false, false, true);
        emit MarsRoadsterRecords.Locked(1);

        // 期望 Recorded(alice, 1, MIN, true, 0x7, MIN)
        vm.expectEmit(true, true, false, true);
        emit MarsRoadsterRecords.Recorded(alice, 1, MIN, true, 0x7, MIN);

        _aliceFirst(MIN, 0x7);

        // 验证记录
        MarsRoadsterRecords.Record memory r = rec.recordOf(alice);
        assertEq(r.tokenId,      1);
        assertEq(r.bestMs,       MIN);
        assertEq(r.achievements, 0x7);
        assertGt(r.mintedAt,     0);
        assertEq(r.mintedAt,     r.updatedAt);

        // ERC-721 所有权
        assertEq(rec.ownerOf(1), alice);

        // totalSupply / playerCount
        assertEq(rec.totalSupply(),  1);
        assertEq(rec.playerCount(),  1);
    }

    // ── 2. 第二个玩家获得 tokenId 2；totalSupply/playerCount = 2 ──────────────

    function test_secondPlayerGetsTokenId2() public {
        _aliceFirst(MIN, 0);

        vm.prank(bob);
        rec.submit(MIN + 1000, 0x1);

        assertEq(rec.totalSupply(), 2);
        assertEq(rec.playerCount(), 2);
        assertEq(rec.ownerOf(2), bob);

        MarsRoadsterRecords.Record memory r = rec.recordOf(bob);
        assertEq(r.tokenId, 2);
    }

    // ── 3a. 更快的时间 → 更新 bestMs ─────────────────────────────────────────

    function test_fasterTimeUpdatesBestMs() public {
        _aliceFirst(MIN + 5000, 0x1);

        vm.expectEmit(true, true, false, true);
        emit MarsRoadsterRecords.Recorded(alice, 1, MIN, true, 0x1, MIN);

        vm.prank(alice);
        rec.submit(MIN, 0x1); // 同样的成就，但更快

        assertEq(rec.recordOf(alice).bestMs, MIN);
    }

    // ── 3b. 更慢的时间 + 新成就 → 保留 bestMs，合并 bits ─────────────────────

    function test_slowerTimeWithNewAchievementKeepsBestMsAndMergesBits() public {
        _aliceFirst(MIN, 0x1); // bestMs = MIN, ach = 0b001

        vm.prank(alice);
        rec.submit(MIN + 10_000, 0x6); // 更慢，但新增 bits 1 和 2

        MarsRoadsterRecords.Record memory r = rec.recordOf(alice);
        assertEq(r.bestMs,       MIN);     // bestMs 不变
        assertEq(r.achievements, 0x7);    // 0x1 | 0x6 = 0x7
    }

    // ── 3c. 更慢时间 + 无新 bits → revert NothingToUpdate ────────────────────

    function test_slowerTimeNoNewBitsReverts() public {
        _aliceFirst(MIN, 0x3);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRecords.NothingToUpdate.selector);
        rec.submit(MIN + 1, 0x1); // 更慢，且 0x1 ⊆ 0x3
    }

    // ── 4. TooFast: min-1 reverts，恰好 min 通过 ─────────────────────────────

    function test_tooFastReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MarsRoadsterRecords.TooFast.selector, MIN - 1, MIN)
        );
        rec.submit(MIN - 1, 0);
    }

    function test_exactMinPasses() public {
        vm.prank(alice);
        rec.submit(MIN, 0);
        assertEq(rec.recordOf(alice).bestMs, MIN);
    }

    // ── 5. InvalidAchievements: bit 20 reverts；bits 0..19 ok ────────────────

    function test_bit20Reverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MarsRoadsterRecords.InvalidAchievements.selector, 1 << 20)
        );
        rec.submit(MIN, 1 << 20);
    }

    function test_bits0to19Pass() public {
        uint32 allBits = (1 << 20) - 1; // 全部 20 位
        vm.prank(alice);
        rec.submit(MIN, allBits);
        assertEq(rec.recordOf(alice).achievements, allBits);
    }

    // ── 6. 灵魂绑定：transferFrom / safeTransferFrom / approve / setApprovalForAll ──

    function test_transferFromReverts() public {
        _aliceFirst(MIN, 0);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRecords.Soulbound.selector);
        rec.transferFrom(alice, bob, 1);
    }

    function test_safeTransferFromReverts() public {
        _aliceFirst(MIN, 0);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRecords.Soulbound.selector);
        rec.safeTransferFrom(alice, bob, 1);
    }

    function test_approveReverts() public {
        _aliceFirst(MIN, 0);

        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRecords.Soulbound.selector);
        rec.approve(bob, 1);
    }

    function test_setApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(MarsRoadsterRecords.Soulbound.selector);
        rec.setApprovalForAll(bob, true);
    }

    // ── 7. tokenURI = baseURI + id；不存在 → revert；locked() = true ──────────

    function test_tokenURI() public {
        _aliceFirst(MIN, 0);
        string memory expected = string.concat(BASE, "1");
        assertEq(rec.tokenURI(1), expected);
    }

    function test_tokenURINonexistentReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99)
        );
        rec.tokenURI(99);
    }

    function test_lockedTrue() public {
        _aliceFirst(MIN, 0);
        assertTrue(rec.locked(1));
    }

    function test_lockedNonexistentReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99)
        );
        rec.locked(99);
    }

    // ── 8. supportsInterface：ERC-721 和 ERC-5192 ─────────────────────────────

    function test_supportsInterfaceERC721() public view {
        assertTrue(rec.supportsInterface(0x80ac58cd));
    }

    function test_supportsInterfaceERC5192() public view {
        assertTrue(rec.supportsInterface(0xb45a3c0e));
    }

    // ── 9. Owner 操作 ─────────────────────────────────────────────────────────

    function test_setMinRoundTripMsLowerReverts() public {
        vm.prank(owner);
        vm.expectRevert(MarsRoadsterRecords.MinCanOnlyIncrease.selector);
        rec.setMinRoundTripMs(MIN - 1);
    }

    function test_setMinRoundTripMsHigherOk() public {
        vm.expectEmit(false, false, false, true);
        emit MarsRoadsterRecords.MinRoundTripMsChanged(MIN + 1000);

        vm.prank(owner);
        rec.setMinRoundTripMs(MIN + 1000);
        assertEq(rec.minRoundTripMs(), MIN + 1000);
    }

    function test_setMinRoundTripMsNonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        rec.setMinRoundTripMs(MIN + 1);
    }

    function test_setBaseURIOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        rec.setBaseURI("https://evil.example/");

        vm.expectEmit(false, false, false, true);
        emit MarsRoadsterRecords.BaseURIChanged("https://new.example/");

        vm.prank(owner);
        rec.setBaseURI("https://new.example/");

        // 验证新 URI 生效
        _aliceFirst(MIN, 0);
        assertEq(rec.tokenURI(1), "https://new.example/1");
    }

    // ── 10. players() 分页：含越界 ────────────────────────────────────────────

    function test_playersPagination() public {
        // 添加 3 个玩家
        vm.prank(alice);   rec.submit(MIN, 0);
        vm.prank(bob);     rec.submit(MIN, 0);
        vm.prank(charlie); rec.submit(MIN, 0);

        // 全部：start=0, count=3
        (address[] memory addrs, MarsRoadsterRecords.Record[] memory recs) =
            rec.players(0, 3);
        assertEq(addrs.length, 3);
        assertEq(recs.length,  3);
        assertEq(addrs[0], alice);
        assertEq(addrs[1], bob);
        assertEq(addrs[2], charlie);

        // 中间页：start=1, count=2
        (addrs, recs) = rec.players(1, 2);
        assertEq(addrs.length, 2);
        assertEq(addrs[0], bob);
        assertEq(addrs[1], charlie);

        // count 超出末尾：start=2, count=10 → 返回 1 条
        (addrs, recs) = rec.players(2, 10);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], charlie);

        // start 超出范围：返回空数组
        (addrs, recs) = rec.players(100, 5);
        assertEq(addrs.length, 0);
        assertEq(recs.length,  0);
    }

    // ── 11. 重入防护：合约调用方在 onERC721Received 中尝试重新 submit ────────────

    function test_reentrancyBlocked() public {
        // 部署重入攻击合约，以它自身作为 msg.sender 调用 submit
        ReentrantSubmitter attacker = new ReentrantSubmitter(rec, MIN);
        // 攻击合约调用 submit；内部会在回调中再次尝试 submit，应被阻断
        attacker.attack();
        // 攻击合约恰好持有 1 个 token，playerCount = 1
        assertEq(rec.totalSupply(),   1,   "totalSupply should be 1");
        assertEq(rec.playerCount(),   1,   "playerCount should be 1");
        MarsRoadsterRecords.Record memory r = rec.recordOf(address(attacker));
        assertEq(r.tokenId, 1, "attacker tokenId should be 1");
    }

    // ── 12. 无 onERC721Received 的合约仍能铸造（_mint 而非 _safeMint） ──────────

    function test_contractWithoutReceiverCanMint() public {
        // NoReceiver 没有 onERC721Received，用 _safeMint 会 revert
        NoReceiver nr = new NoReceiver(rec, MIN);
        nr.doSubmit();
        assertEq(rec.ownerOf(1), address(nr));
        assertEq(rec.totalSupply(), 1);
    }

    // ── 11. Fuzz：随机时间 >= min，随机 20 位 mask ─────────────────────────────

    /// @dev bestMs 始终等于已提交中的最小值
    function testFuzz_bestMsIsMinSubmitted(
        uint32 t1,
        uint32 t2,
        uint32 ach1,
        uint32 ach2
    ) public {
        // 将时间钳制到 [MIN, MIN + 2^24)
        t1  = MIN + (t1  % (1 << 24));
        t2  = MIN + (t2  % (1 << 24));
        // 将 achievements 钳制到 20 位
        ach1 = ach1 & ((1 << 20) - 1);
        ach2 = ach2 & ((1 << 20) - 1);

        vm.prank(alice);
        rec.submit(t1, ach1);

        // 若 t2 比 t1 慢且 ach2 ⊆ ach1，第二次提交会 revert；直接跳过
        if (t2 > t1 && (ach1 | ach2) == ach1) {
            // 预期 NothingToUpdate
            vm.prank(alice);
            vm.expectRevert(MarsRoadsterRecords.NothingToUpdate.selector);
            rec.submit(t2, ach2);
            return;
        }

        // 若 t2 == t1 且 ach2 ⊆ ach1，同样 revert（未 improved 且无新 bits）
        if (t2 == t1 && (ach1 | ach2) == ach1) {
            vm.prank(alice);
            vm.expectRevert(MarsRoadsterRecords.NothingToUpdate.selector);
            rec.submit(t2, ach2);
            return;
        }

        vm.prank(alice);
        rec.submit(t2, ach2);

        MarsRoadsterRecords.Record memory r = rec.recordOf(alice);
        assertEq(r.bestMs,       t2 < t1 ? t2 : t1);
        assertEq(r.achievements, ach1 | ach2);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 辅助合约（测试重入防护 & 无 onERC721Received 的合约铸造）
// ─────────────────────────────────────────────────────────────────────────────

/// @dev 重入攻击合约：实现 onERC721Received，在回调中再次调用 submit。
///      由于合约修复后先写 rec.tokenId（CEI 顺序），重入时走 else 分支，
///      会因 NothingToUpdate 而 revert，最终只铸造 1 个 token。
contract ReentrantSubmitter {
    MarsRoadsterRecords private immutable _target;
    uint32              private immutable _min;
    bool                private _attacking;

    constructor(MarsRoadsterRecords target, uint32 minMs) {
        _target   = target;
        _min      = minMs;
    }

    /// @dev 入口：发起首次 submit
    function attack() external {
        _attacking = true;
        _target.submit(_min, 0x1);
        _attacking = false;
    }

    /// @dev ERC-721 接收回调——尝试重入 submit
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (_attacking) {
            // 尝试重入；修复后应走 else 分支并因 NothingToUpdate 而 revert，
            // 此处用 try/catch 捕获，防止整个调用链 revert
            try _target.submit(_min, 0x1) {} catch {}
        }
        return this.onERC721Received.selector;
    }
}

/// @dev 无 onERC721Received 的合约——验证 _mint（非 _safeMint）不需要回调
contract NoReceiver {
    MarsRoadsterRecords private immutable _target;
    uint32              private immutable _min;

    constructor(MarsRoadsterRecords target, uint32 minMs) {
        _target = target;
        _min    = minMs;
    }

    function doSubmit() external {
        _target.submit(_min, 0);
    }
}
