// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MarsRoadsterRecords is ERC721, Ownable {
    struct Record {
        uint32 tokenId; // 0 = no token yet
        uint32 bestMs; // fastest round trip in milliseconds
        uint32 achievements; // bitmap, only bits 0..19 valid
        uint40 mintedAt;
        uint40 updatedAt;
    }

    mapping(address => Record) private _records;
    address[] private _players;
    uint256 private _nextTokenId;
    uint32 public minRoundTripMs;
    string private _baseTokenURI;

    error TooFast(uint32 got, uint32 min);
    error InvalidAchievements(uint32 bits);
    error NothingToUpdate();
    error Soulbound();
    error MinCanOnlyIncrease();

    event Recorded(
        address indexed player,
        uint256 indexed tokenId,
        uint32 roundTripMs,
        bool improved,
        uint32 achievements,
        uint32 bestMs
    );
    event Locked(uint256 tokenId);
    event MinRoundTripMsChanged(uint32 newMin);
    event BaseURIChanged(string newBaseURI);

    constructor(address initialOwner, uint32 minRoundTripMs_, string memory baseURI_)
        ERC721("Mars Roadster Round Trip", "MRRT")
        Ownable(initialOwner)
    {
        _nextTokenId = 1;
        minRoundTripMs = minRoundTripMs_;
        _baseTokenURI = baseURI_;
    }

    function submit(uint32 roundTripMs, uint32 achievements) external {
        if (roundTripMs < minRoundTripMs) revert TooFast(roundTripMs, minRoundTripMs);
        if (achievements >> 20 != 0) revert InvalidAchievements(achievements);

        Record storage rec = _records[msg.sender];

        if (rec.tokenId == 0) {
            uint256 tokenId = _nextTokenId++;

            // 修复重入漏洞：在铸造前先写入所有状态，
            // 使 rec.tokenId != 0，后续回调无法再次进入此分支。
            // 同时改用 _mint（而非 _safeMint）：token 是灵魂绑定的，
            // 不需要 onERC721Received 回调，消除外部调用入口。
            rec.tokenId = uint32(tokenId);
            rec.bestMs = roundTripMs;
            rec.achievements = achievements;
            rec.mintedAt = uint40(block.timestamp);
            rec.updatedAt = uint40(block.timestamp);

            _players.push(msg.sender);

            _mint(msg.sender, tokenId);

            emit Locked(tokenId);
            emit Recorded(msg.sender, tokenId, roundTripMs, true, achievements, roundTripMs);
        } else {
            bool improved = roundTripMs < rec.bestMs;
            uint32 merged = rec.achievements | achievements;

            if (!improved && merged == rec.achievements) revert NothingToUpdate();

            if (improved) rec.bestMs = roundTripMs;
            rec.achievements = merged;
            rec.updatedAt = uint40(block.timestamp);

            emit Recorded(msg.sender, uint256(rec.tokenId), roundTripMs, improved, merged, rec.bestMs);
        }
    }

    function recordOf(address player) external view returns (Record memory) {
        return _records[player];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function playerCount() external view returns (uint256) {
        return _players.length;
    }

    function players(uint256 start, uint256 count)
        external
        view
        returns (address[] memory addrs, Record[] memory recs)
    {
        uint256 len = _players.length;
        if (start >= len) return (new address[](0), new Record[](0));

        uint256 end = start + count;
        if (end > len) end = len;

        uint256 n = end - start;
        addrs = new address[](n);
        recs = new Record[](n);

        for (uint256 i = 0; i < n; i++) {
            addrs[i] = _players[start + i];
            recs[i] = _records[_players[start + i]];
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        return string.concat(_baseTokenURI, Strings.toString(tokenId));
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    function setMinRoundTripMs(uint32 v) external onlyOwner {
        if (v < minRoundTripMs) revert MinCanOnlyIncrease();
        minRoundTripMs = v;
        emit MinRoundTripMsChanged(v);
    }

    function setBaseURI(string calldata newURI) external onlyOwner {
        _baseTokenURI = newURI;
        emit BaseURIChanged(newURI);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
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
