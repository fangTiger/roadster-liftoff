/**
 * directory.js — 房间目录：纯逻辑，无 WebSocket，无计时器。
 * 负责：创建参数校验、房间摘要、列表排序、加入验证（含限流）、邀请 URL 生成。
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { scrypt as _scrypt } from 'node:crypto';

const scryptAsync = promisify(_scrypt);

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 加密存储格式前缀 */
const SCRYPT_PREFIX = 'scrypt';
/** 盐长度（字节） */
const SALT_BYTES = 16;
/** scrypt 派生密钥长度（字节） */
const KEY_BYTES = 32;
/** scrypt 参数：CPU/内存代价 */
const SCRYPT_N = 16384;
/** 每个（房间, 客户端）允许的最大错误次数 */
const MAX_FAILURES = 5;
/** 锁定时长（毫秒） */
const LOCKOUT_MS = 60_000;
/** 名称最大代码点数 */
const NAME_MAX_CP = 20;
/** 密码正则：4 位数字 */
const PASSWORD_RE = /^\d{4}$/;

// ── 默认 hash / verify（基于 scrypt） ─────────────────────────────────────────

/**
 * 默认密码哈希：scrypt + 随机盐，存储格式 "scrypt$<saltHex>$<hashHex>"。
 * @param {string} password
 * @returns {Promise<string>}
 */
async function defaultHash(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, { N: SCRYPT_N });
  return `${SCRYPT_PREFIX}$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * 默认密码验证：解析存储字符串后 scrypt + timingSafeEqual。
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
async function defaultVerify(password, stored) {
  if (!stored || !stored.startsWith(SCRYPT_PREFIX + '$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  try {
    const key = await scryptAsync(password, salt, KEY_BYTES, { N: SCRYPT_N });
    if (key.length !== expected.length) return false;
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 移除控制字符和 Unicode 格式类字符，再 trim，再截取最多 maxCp 个代码点。
 * @param {string} str
 * @param {number} maxCp
 * @returns {string}
 */
function sanitizeName(str, maxCp) {
  // 移除控制字符（U+0000-U+001F、U+007F-U+009F）和 Unicode Cf 格式字符
  const cleaned = String(str).replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  const trimmed = cleaned.trim();
  // 按代码点截取
  return [...trimmed].slice(0, maxCp).join('');
}

// ── 主工厂 ────────────────────────────────────────────────────────────────────

/**
 * 创建房间目录实例。
 *
 * @param {object} [opts]
 * @param {function(): number} [opts.now]   时间戳函数（可注入假时钟）
 * @param {function(string): Promise<string>} [opts.hash]    密码哈希
 * @param {function(string, string): Promise<boolean>} [opts.verify] 密码验证
 * @returns {object}
 */
export function createDirectory({ now = Date.now, hash = defaultHash, verify = defaultVerify } = {}) {

  // ── 限流状态：Map<`${code}:${clientKey}`, { failures, lockedUntil }> ────────
  /** @type {Map<string, { failures: number, lockedUntil: number }>} */
  const rateLimits = new Map();

  function _rateLimitKey(code, clientKey) {
    return `${code}:${clientKey}`;
  }

  function _getRateEntry(code, clientKey) {
    const k = _rateLimitKey(code, clientKey);
    if (!rateLimits.has(k)) {
      rateLimits.set(k, { failures: 0, lockedUntil: 0 });
    }
    return rateLimits.get(k);
  }

  function _resetRate(code, clientKey) {
    rateLimits.delete(_rateLimitKey(code, clientKey));
  }

  // ── validateCreate ─────────────────────────────────────────────────────────

  /**
   * 验证建房参数。hash 调用是异步的，返回 Promise。
   *
   * @param {{ name: string, locked: boolean, password?: string }} params
   * @returns {Promise<{ ok: boolean, code?: string, value?: object }>}
   */
  async function validateCreate({ name, locked, password }) {
    if (typeof locked !== 'boolean') {
      return { ok: false, code: 'BAD_LOCKED' };
    }

    const cleanName = sanitizeName(name ?? '', NAME_MAX_CP);

    if (locked) {
      if (!PASSWORD_RE.test(password)) {
        return { ok: false, code: 'BAD_PASSWORD' };
      }
      const passwordHash = await hash(password);
      return { ok: true, value: { name: cleanName, locked: true, passwordHash } };
    }

    // 未加锁：忽略 password
    return { ok: true, value: { name: cleanName, locked: false, passwordHash: null } };
  }

  // ── summary ───────────────────────────────────────────────────────────────

  /**
   * 生成房间公开摘要（绝不包含 passwordHash 等敏感字段）。
   *
   * @param {object} room
   * @returns {object}
   */
  function summary(room) {
    const playerCount = (room.players ?? []).length;
    const hostPlayer = (room.players ?? []).find(p => p.id === room.hostId);
    const joinable = room.phase === 'lobby' && playerCount < 6;
    let reason = null;
    if (!joinable) {
      if (playerCount >= 6) reason = 'FULL';
      else if (room.phase !== 'lobby') reason = 'RACING';
    }
    return {
      code: room.code,
      name: room.name,
      hostName: hostPlayer?.name ?? '',
      trackId: room.trackId,
      mode: room.mode,
      players: playerCount,
      max: 6,
      phase: room.phase,
      locked: !!room.locked,
      joinable,
      reason,
    };
  }

  // ── list ──────────────────────────────────────────────────────────────────

  /**
   * 过滤并排序房间列表。
   * 跳过没有已连接真人的房间；可加入的排在前面；再按人数降序；再按 code。
   *
   * @param {object[]} rooms
   * @returns {object[]}
   */
  function list(rooms) {
    const summaries = rooms
      .filter(room => {
        // 至少有一个已连接的非 bot 玩家
        return (room.players ?? []).some(p => !p.bot && p.connected !== false);
      })
      .map(room => summary(room));

    summaries.sort((a, b) => {
      // 可加入的排前面
      if (a.joinable !== b.joinable) return a.joinable ? -1 : 1;
      // 再按人数降序
      if (b.players !== a.players) return b.players - a.players;
      // 再按 code 字典序
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });

    return summaries;
  }

  // ── checkJoin ─────────────────────────────────────────────────────────────

  /**
   * 验证玩家是否可以加入房间。
   * 含限流：同一 (room.code, clientKey) 密码连续错误 5 次后锁定 60 秒。
   *
   * @param {object} room
   * @param {{ password?: string, clientKey?: string }} opts
   * @returns {Promise<{ ok: boolean, code?: string }>}
   */
  async function checkJoin(room, { password, clientKey = '' } = {}) {
    const playerCount = (room.players ?? []).length;

    // 阶段检查
    if (room.phase !== 'lobby') {
      return { ok: false, code: 'RACING' };
    }

    // 人数检查
    if (playerCount >= 6) {
      return { ok: false, code: 'FULL' };
    }

    // 无密码房间：直接通过
    if (!room.locked) {
      return { ok: true };
    }

    // 以下均为加锁房间的处理 ─────────────────────────────────────────────────

    const entry = _getRateEntry(room.code, clientKey);
    const ts = now();

    // 检查是否处于锁定期
    if (entry.lockedUntil > ts) {
      return { ok: false, code: 'LOCKED_OUT' };
    }

    // 未提供密码
    if (!password) {
      return { ok: false, code: 'PASSWORD_REQUIRED' };
    }

    // 验证密码（已过锁定期的计数器不阻拦，但仍可能再次累积）
    const ok = await verify(password, room.passwordHash);

    if (ok) {
      // 成功：重置计数器
      _resetRate(room.code, clientKey);
      return { ok: true };
    }

    // 失败：累积计数
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = ts + LOCKOUT_MS;
      return { ok: false, code: 'LOCKED_OUT' };
    }

    return { ok: false, code: 'BAD_PASSWORD' };
  }

  // ── forget ────────────────────────────────────────────────────────────────

  /**
   * 清除某个房间的所有限流记录（房间删除时调用）。
   * @param {string} code
   */
  function forget(code) {
    for (const key of rateLimits.keys()) {
      if (key.startsWith(code + ':')) {
        rateLimits.delete(key);
      }
    }
  }

  // ── inviteUrl ─────────────────────────────────────────────────────────────

  /**
   * 生成邀请链接。加锁房间且提供密码时附加 &pw=1234。
   * @param {string} base
   * @param {object} room  summary 对象或原始 room
   * @param {string} [password]
   * @returns {string}
   */
  function inviteUrl(base, room, password) {
    const url = `${base}?room=${encodeURIComponent(room.code)}`;
    if (room.locked && password) {
      return url + `&pw=${encodeURIComponent(password)}`;
    }
    return url;
  }

  return { validateCreate, summary, list, checkJoin, forget, inviteUrl };
}
