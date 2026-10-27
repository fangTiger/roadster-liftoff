// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Mars Roadster Racing — 圈速成绩合约
// 每位玩家最多持有一个不可转让的首圈 NFT；
// 记录每条赛道的最佳单圈时间，可选服务端签名验证。

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MarsRoadsterRacing is ERC721("Mars Roadster First Lap", "MRFL"), Ownable, EIP712 {
    // ── 数据结构 ──────────────────────────────────────────────────────────────

    struct Player {
        uint32 tokenId;      // 0 = 尚未铸造
        uint8  firstTrack;   // 首次铸造时的赛道
        uint32 firstLapMs;   // 首次铸造时的成绩（永不改变）
        uint32 achievements; // 成就位图，全 32 位有效
        uint40 mintedAt;
        uint40 updatedAt;
    }

    struct Best {
        uint32 bestMs;    // 该赛道最佳成绩；0 = 未跑过
        uint40 updatedAt;
        bool   verified;  // 是否经过服务端签名验证
    }

    struct Track {
        uint32 qualifyMs; // 准入门槛（毫秒）；0 = 赛道关闭
        uint32 minLapMs;  // 物理下限（防作弊）；只能增大
    }

    // ── 状态变量 ──────────────────────────────────────────────────────────────

    mapping(address => Player)                   public  data;
    mapping(address => mapping(uint8 => Best))   public  bests;
    address[]                                    private _playerList;
    uint256                                      private _nextTokenId;  // 从 1 开始

    mapping(uint8 => Track)                      private _tracks;
    address                                      public  verifier;      // 零地址 = 自报模式
    string                                       private _baseTokenURI;

    // EIP-712 类型哈希
    bytes32 public constant LAP_TYPEHASH =
        keccak256("Lap(address player,uint8 trackId,uint32 lapMs,uint32 achievements,uint64 deadline)");

    // ── 自定义错误 ────────────────────────────────────────────────────────────

    error TrackClosed(uint8 trackId);
    error TooFast(uint32 got, uint32 min);
    error NotQualified(uint32 got, uint32 qualify);
    error NothingToUpdate();
    error Soulbound();
    error MinCanOnlyIncrease();
    error InvalidConfig();
    error BadSignature();
    error Expired();

    // ── 事件 ──────────────────────────────────────────────────────────────────

    event FirstLap(
        address indexed player,
        uint256 indexed tokenId,
        uint8   indexed trackId,
        uint32          lapMs
    );
    event LapRecorded(
        address indexed player,
        uint8   indexed trackId,
        uint32          lapMs,
        bool            improved,
        uint32          bestMs,
        uint32          achievements,
        bool            verified
    );
    event Locked(uint256 tokenId);                                 // ERC-5192
    event TrackSet(uint8 indexed trackId, uint32 qualifyMs, uint32 minLapMs);
    event VerifierChanged(address verifier);
    event BaseURIChanged(string baseURI);

    // ── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(address initialOwner, string memory baseURI_)
        Ownable(initialOwner)
        EIP712("MarsRoadsterRacing", "1")
    {
        _nextTokenId = 1;
        _baseTokenURI = baseURI_;
    }

    // ── 核心函数 ──────────────────────────────────────────────────────────────

    /// @notice 提交一圈成绩。未设 verifier 时 deadline/signature 被忽略。
    function submit(
        uint8          trackId,
        uint32         lapMs,
        uint32         achievements,
        uint64         deadline,
        bytes calldata signature
    ) external {
        // 1. 赛道必须开放
        Track memory t = _tracks[trackId];
        if (t.qualifyMs == 0) revert TrackClosed(trackId);

        // 2. 物理下限检查
        if (lapMs < t.minLapMs) revert TooFast(lapMs, t.minLapMs);

        // 3. 可选的服务端签名验证
        bool verified = false;
        if (verifier != address(0)) {
            if (block.timestamp > deadline) revert Expired();
            bytes32 digest = _hashTypedDataV4(
                keccak256(abi.encode(
                    LAP_TYPEHASH,
                    msg.sender,
                    trackId,
                    lapMs,
                    achievements,
                    deadline
                ))
            );
            if (ECDSA.recover(digest, signature) != verifier) revert BadSignature();
            verified = true;
        }

        // 4. 写入成绩
        Player storage p = data[msg.sender];

        if (p.tokenId == 0) {
            // 4a. 首次铸造
            if (lapMs > t.qualifyMs) revert NotQualified(lapMs, t.qualifyMs);

            uint256 tokenId = _nextTokenId++;

            // CEI：先写所有状态，再调用 _mint，防止重入
            // （_mint 不触发 onERC721Received，灵魂绑定 token 无需安全回调）
            p.tokenId      = uint32(tokenId);
            p.firstTrack   = trackId;
            p.firstLapMs   = lapMs;
            p.achievements = achievements;
            p.mintedAt     = uint40(block.timestamp);
            p.updatedAt    = uint40(block.timestamp);

            bests[msg.sender][trackId] = Best(lapMs, uint40(block.timestamp), verified);
            _playerList.push(msg.sender);

            _mint(msg.sender, tokenId); // 非 _safeMint，避免外部回调

            emit Locked(tokenId);
            emit FirstLap(msg.sender, tokenId, trackId, lapMs);
            emit LapRecorded(msg.sender, trackId, lapMs, true, lapMs, achievements, verified);

        } else {
            // 4b. 更新已有玩家
            Best storage b = bests[msg.sender][trackId];
            bool improved = (b.bestMs == 0 || lapMs < b.bestMs);
            uint32 merged = p.achievements | achievements;
            if (!improved && merged == p.achievements) revert NothingToUpdate();

            if (improved) {
                b.bestMs    = lapMs;
                b.updatedAt = uint40(block.timestamp);
                b.verified  = verified;
            }
            p.achievements = merged;
            p.updatedAt    = uint40(block.timestamp);

            emit LapRecorded(msg.sender, trackId, lapMs, improved, b.bestMs, merged, verified);
        }
    }

    // ── 查询函数 ──────────────────────────────────────────────────────────────

    function recordOf(address player) external view returns (Player memory) {
        return data[player];
    }

    function bestOf(address player, uint8 trackId) external view returns (Best memory) {
        return bests[player][trackId];
    }

    function trackOf(uint8 trackId) external view returns (Track memory) {
        return _tracks[trackId];
    }

    /// @notice 已铸造 token 数量
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice 玩家总数
    function playerCount() external view returns (uint256) {
        return _playerList.length;
    }

    /// @notice 分页查询玩家列表及指定赛道的最佳成绩
    function players(uint8 trackId, uint256 start, uint256 count)
        external view
        returns (
            address[]  memory addrs,
            Player[]   memory recs,
            Best[]     memory trackBests
        )
    {
        uint256 len = _playerList.length;
        if (start >= len) return (new address[](0), new Player[](0), new Best[](0));
        uint256 end = start + count;
        if (end > len) end = len;
        uint256 n = end - start;
        addrs      = new address[](n);
        recs       = new Player[](n);
        trackBests = new Best[](n);
        for (uint256 i = 0; i < n; i++) {
            address a   = _playerList[start + i];
            addrs[i]      = a;
            recs[i]       = data[a];
            trackBests[i] = bests[a][trackId];
        }
    }

    /// @notice 返回 EIP-712 类型哈希，供前端构造签名
    function lapTypehash() external pure returns (bytes32) {
        return LAP_TYPEHASH;
    }

    /// @notice 返回 EIP-712 域分隔符，供前端验证
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        return string.concat(_baseTokenURI, Strings.toString(tokenId));
    }

    /// @notice ERC-5192：已铸造 token 永久锁定
    function locked(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    // ── Owner 管理 ────────────────────────────────────────────────────────────

    /// @notice 设置赛道参数。minLapMs 只能增大；qualifyMs 可上下浮动或清零（关闭）。
    function setTrack(uint8 trackId, uint32 qualifyMs, uint32 minLapMs) external onlyOwner {
        Track storage t = _tracks[trackId];
        if (minLapMs < t.minLapMs) revert MinCanOnlyIncrease();
        if (qualifyMs != 0 && qualifyMs < minLapMs) revert InvalidConfig();
        t.qualifyMs = qualifyMs;
        t.minLapMs  = minLapMs;
        emit TrackSet(trackId, qualifyMs, minLapMs);
    }

    /// @notice 设置服务端签名地址；零地址为自报模式
    function setVerifier(address newVerifier) external onlyOwner {
        verifier = newVerifier;
        emit VerifierChanged(newVerifier);
    }

    function setBaseURI(string calldata newURI) external onlyOwner {
        _baseTokenURI = newURI;
        emit BaseURIChanged(newURI);
    }

    // ── 灵魂绑定覆写 ──────────────────────────────────────────────────────────

    /// @dev 只允许铸造（from == address(0)），转账一律 revert
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }
}
