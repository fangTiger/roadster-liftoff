/**
 * Mars Roadster — 成就系统
 * 纯 ES 模块，无依赖，无构建步骤。
 * 所有持久化数据存储于 localStorage，失败时静默降级。
 */
import { t } from '../i18n/i18n.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 所有成就定义（按展示顺序排列） */
const DEFS = [
  {
    id: 'first_drive',
    index: 1,
  },
  {
    id: 'club08',
    index: 2,
  },
  {
    id: 'top_speed',
    index: 3,
  },
  {
    id: 'first_flight',
    index: 4,
  },
  {
    id: 'hover10',
    index: 5,
  },
  {
    id: 'bunny',
    index: 6,
  },
  {
    id: 'gravel',
    index: 7,
  },
  {
    id: 'marathon',
    index: 8,
  },
  {
    id: 'boom',
    index: 9,
  },
  {
    id: 'clouds',
    index: 10,
  },
  {
    id: 'strato',
    index: 11,
  },
  {
    id: 'karman',
    index: 12,
  },
  {
    id: 'meet',
    index: 13,
  },
  {
    id: 'home',
    index: 14,
  },
  {
    id: 'so_close',
    index: 15,
  },
  {
    id: 'director',
    index: 16,
  },
  {
    id: 'photographer',
    index: 17,
  },
  {
    id: 'frequent',
    index: 18,
  },
  {
    id: 'barrel_roll',
    index: 19,
  },
  {
    id: 'coin_hunter',
    index: 20,
  },
];
// 名称与描述按当前语言取词（词条 ach.<id>.name / ach.<id>.desc）
for (const d of DEFS) Object.defineProperties(d, { name: { get: () => t(`ach.${d.id}.name`), enumerable: true }, desc: { get: () => t(`ach.${d.id}.desc`), enumerable: true } });

// 全部 5 个机位名称（用于 director 成就追踪）
const ALL_CAMERAS = new Set(['chase', 'low', 'cine', 'cockpit', 'free']);

// ─── 存储工具 ─────────────────────────────────────────────────────────────────

/** 安全读取 localStorage，失败返回 null */
function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/** 安全写入 localStorage，失败静默 */
function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // 配额已满或隐私模式 — 静默忽略
  }
}

// ─── 日期格式化 ───────────────────────────────────────────────────────────────

/** 返回 YYYY-MM-DD 格式的今天日期 */
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── DOM 工具 ─────────────────────────────────────────────────────────────────

/** 确保成就专用样式表已挂载（只挂一次） */
function ensureCss() {
  if (document.getElementById('ach-css')) return;
  // 尝试用 <link> 引入同目录 CSS（相对于 JS 文件位置）
  const link = document.createElement('link');
  link.id = 'ach-css';
  link.rel = 'stylesheet';
  // import.meta.url 在 ES 模块中始终可用
  // 用 new URL('./x', import.meta.url) 的固定写法，Vite 构建时会识别并一起打包这个 CSS
  link.href = new URL('./achievements.css', import.meta.url).href;
  document.head.appendChild(link);
}

/** 安全获取 document.body，若未就绪则返回 null */
function body() {
  return typeof document !== 'undefined' ? document.body : null;
}

// ─── 主工厂函数 ───────────────────────────────────────────────────────────────

/**
 * 创建成就实例。
 * @param {object} [opts]
 * @param {string} [opts.storageKey='liftoff.achievements.v1'] - localStorage 键前缀
 */
export function createAchievements({ storageKey = 'liftoff.achievements.v1' } = {}) {

  // ── 持久化状态 ──────────────────────────────────────────────────────────────

  /**
   * saved.unlocked : { [id]: '2026-10-23' }  已解锁的成就 id → 日期
   * saved.orbitCount: number   累计进入轨道次数
   * saved.distanceKm: number   累计行驶公里数（跨局）
   * saved.cameras   : string[] 已使用的机位数组
   */
  let saved = storageGet(storageKey) || {
    unlocked: {},
    orbitCount: 0,
    distanceKm: 0,
    cameras: [],
  };

  // 兼容旧格式：确保每个字段都存在
  if (!saved.unlocked)    saved.unlocked = {};
  if (!saved.orbitCount)  saved.orbitCount = 0;
  if (!saved.distanceKm)  saved.distanceKm = 0;
  if (!saved.cameras)     saved.cameras = [];

  /** 将当前 saved 写回 localStorage */
  function persist() {
    storageSet(storageKey, saved);
  }

  // ── 内部状态（不持久化） ─────────────────────────────────────────────────────

  /** 解锁回调列表 */
  const listeners = [];

  /** Toast 队列（每条依次弹出，不重叠） */
  const toastQueue = [];
  let toastBusy = false;

  /** 面板 DOM 根节点（懒创建） */
  let panelRoot = null;

  /** 上一帧的累计里程（用于计算 delta） */
  let lastDistanceKm = null;

  // ── 解锁逻辑 ─────────────────────────────────────────────────────────────────

  /**
   * 尝试解锁指定 id 的成就。
   * 已解锁则跳过；新解锁则持久化、触发回调、入队 toast。
   */
  function unlock(id) {
    if (saved.unlocked[id]) return; // 已解锁
    const def = DEFS.find(d => d.id === id);
    if (!def) return;

    saved.unlocked[id] = todayStr();
    persist();

    // 更新 #bag .ach b（若存在）
    _updateBagCounter();

    // 通知外部监听器
    const snapshot = { id, name: def.name, desc: def.desc, date: saved.unlocked[id] };
    for (const fn of listeners) {
      try { fn(snapshot); } catch (_) {}
    }

    // 入队 toast
    _enqueueToast(def);

    // 若面板已打开，刷新内容
    if (panelRoot) _renderPanel();
  }

  // ── 更新 #bag 计数器 ──────────────────────────────────────────────────────────

  function _updateBagCounter() {
    if (typeof document === 'undefined') return;
    const el = document.querySelector('#bag .ach b');
    if (el) el.textContent = `${Object.keys(saved.unlocked).length} / ${DEFS.length}`;
  }

  // ── Toast 系统 ────────────────────────────────────────────────────────────────

  /** 将一个成就定义放入 toast 队列 */
  function _enqueueToast(def) {
    toastQueue.push(def);
    if (!toastBusy) _nextToast();
  }

  /** 处理队列中的下一条 toast */
  function _nextToast() {
    if (toastQueue.length === 0) { toastBusy = false; return; }
    toastBusy = true;
    const def = toastQueue.shift();
    _showToast(def, () => _nextToast());
  }

  /**
   * 在页面顶部中央显示一条成就 toast，3.6 秒后自动隐藏。
   * @param {object} def      - 成就定义
   * @param {Function} onDone - 动画结束后的回调
   */
  function _showToast(def, onDone) {
    ensureCss();
    const b = body();
    if (!b) { onDone(); return; }

    // 复用或新建 toast 容器
    let el = document.getElementById('ach-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ach-toast';
      el.className = 'ach-toast g';
      b.appendChild(el);
    }

    // 构建内容
    el.innerHTML = `
      <div class="ach-toast-medal" aria-hidden="true">
        <span class="ach-toast-index">${def.index}</span>
        <span class="ach-toast-shine"></span>
      </div>
      <div class="ach-toast-body">
        <b class="ach-toast-title">${t('ach.unlocked', { name: def.name })}</b>
        <span class="ach-toast-desc">${def.desc}</span>
      </div>
    `;

    // 入场
    el.classList.remove('ach-toast-hide');
    el.classList.add('ach-toast-show');

    // 3.6 s 后退场
    const hideTimer = setTimeout(() => {
      el.classList.remove('ach-toast-show');
      el.classList.add('ach-toast-hide');
      // 退场动画结束后处理队列
      const endHandler = () => {
        el.removeEventListener('animationend', endHandler);
        onDone();
      };
      el.addEventListener('animationend', endHandler);
      // 保底：若动画事件未触发，600 ms 后仍继续
      setTimeout(onDone, 700);
    }, 3600);

    // 清理时取消计时器（避免泄漏）
    el._hideTimer = hideTimer;
  }

  // ── 面板 DOM ──────────────────────────────────────────────────────────────────

  /** 懒创建并挂载面板根节点 */
  function _ensurePanel() {
    ensureCss();
    const b = body();
    if (!b) return false;

    if (!panelRoot) {
      panelRoot = document.createElement('div');
      panelRoot.id = 'ach-panel-wrap';
      panelRoot.className = 'ach-panel-wrap';
      panelRoot.setAttribute('role', 'dialog');
      panelRoot.setAttribute('aria-modal', 'true');
      panelRoot.setAttribute('aria-label', t('ach.panel'));
      b.appendChild(panelRoot);

      // 点击半透明背景关闭
      panelRoot.addEventListener('click', e => {
        if (e.target === panelRoot) closePanel();
      });

      // Escape 关闭
      document.addEventListener('keydown', _onKey);
    }
    return true;
  }

  function _onKey(e) {
    if (e.key === 'Escape') closePanel();
  }

  /** 渲染（或刷新）面板内容 */
  function _renderPanel() {
    if (!panelRoot) return;
    const count = Object.keys(saved.unlocked).length;
    const pct = Math.round((count / DEFS.length) * 100);

    const items = DEFS.map(def => {
      const date = saved.unlocked[def.id];
      const done = !!date;
      return `
        <div class="ach-item ${done ? 'ach-item-done' : 'ach-item-locked'}">
          <div class="ach-item-medal" aria-hidden="true">
            ${done
              ? `<span class="ach-item-index">${def.index}</span>`
              : `<span class="ach-item-lock">🔒</span>`}
          </div>
          <div class="ach-item-info">
            <b class="ach-item-name">${def.name}</b>
            <span class="ach-item-desc">${done ? def.desc : t('ach.locked')}</span>
            ${done ? `<span class="ach-item-date">${date}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    panelRoot.innerHTML = `
      <div class="ach-panel g" role="document">
        <header class="ach-panel-header">
          <div class="ach-panel-title">🏆 ${t('ach.title')}</div>
          <div class="ach-panel-progress-wrap">
            <div class="ach-panel-progress-bar">
              <div class="ach-panel-progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="ach-panel-progress-label">${count} / ${DEFS.length}</span>
          </div>
          <button class="ach-panel-close" aria-label="${t('ach.close')}">✕</button>
        </header>
        <div class="ach-grid">
          ${items}
        </div>
      </div>
    `;

    // 关闭按钮
    panelRoot.querySelector('.ach-panel-close').addEventListener('click', closePanel);
  }

  // ── 公开 API ─────────────────────────────────────────────────────────────────

  /**
   * 上报离散游戏事件。
   * @param {string} event - 事件名称
   * @param {object} [data] - 附加数据
   */
  function report(event, data = {}) {
    switch (event) {

      case 'drive_start':
        unlock('first_drive');
        break;

      case 'launch_time':
        // data.seconds < 0.9
        if (typeof data.seconds === 'number' && data.seconds < 0.9) {
          unlock('club08');
        }
        break;

      case 'airborne':
        unlock('first_flight');
        break;

      case 'hover10':
        unlock('hover10');
        break;

      case 'land':
        // 仅触发事件，可供将来扩展
        break;

      case 'boom':
        unlock('boom');
        break;

      case 'clouds':
        unlock('clouds');
        break;

      case 'stratosphere':
        unlock('strato');
        break;

      case 'karman':
        unlock('karman');
        break;

      case 'orbit':
        // 累计轨道次数（持久化）
        saved.orbitCount = (saved.orbitCount || 0) + 1;
        persist();
        if (saved.orbitCount >= 3) {
          unlock('frequent');
        }
        break;

      case 'meet':
        unlock('meet');
        break;

      case 'reentry_home':
        unlock('home');
        break;

      case 'ascent_abort':
        // data.fuelEmpty === true
        if (data.fuelEmpty === true) {
          unlock('so_close');
        }
        break;

      case 'camera': {
        // data.mode: 'chase' | 'low' | 'cine' | 'cockpit' | 'free'
        const mode = data.mode;
        if (ALL_CAMERAS.has(mode) && !saved.cameras.includes(mode)) {
          saved.cameras.push(mode);
          persist();
        }
        if (saved.cameras.length >= ALL_CAMERAS.size) {
          unlock('director');
        }
        break;
      }

      case 'screenshot':
        unlock('photographer');
        break;

      case 'horn':
        // 彩蛋占位，目前无成就绑定喇叭
        break;

      case 'roll':
        unlock('barrel_roll');
        break;

      case 'coin':
        // data.count：本局累计金币数
        if (data && data.count >= 100) unlock('coin_hunter');
        break;

      default:
        // 未知事件静默忽略
        break;
    }
  }

  /**
   * 每帧调用，传入当前游戏状态。
   * @param {{ speedKmh: number, distanceKm: number, offroad: number, hops: number, altitudeM: number, mode: string }} state
   */
  function update(state) {
    const {
      speedKmh = 0,
      distanceKm = 0,
      offroad = 0,
      hops = 0,
    } = state;

    // 极速 380 km/h
    if (speedKmh >= 380) {
      unlock('top_speed');
    }

    // 累计里程（跨局）：只累加正增量
    if (lastDistanceKm !== null) {
      const delta = distanceKm - lastDistanceKm;
      if (delta > 0) {
        saved.distanceKm = (saved.distanceKm || 0) + delta;
        // 每帧都持久化成本太高；里程到达阈值时才写入
        if (saved.distanceKm >= 10) {
          persist();
          unlock('marathon');
        }
      }
    }
    lastDistanceKm = distanceKm;

    // 越野：offroad > 0.5 且时速 > 150
    if (offroad > 0.5 && speedKmh > 150) {
      unlock('gravel');
    }

    // 弹跳：本局离地 5 次
    if (hops >= 5) {
      unlock('bunny');
    }
  }

  /**
   * 返回所有成就列表（含是否解锁、解锁日期）。
   */
  function list() {
    return DEFS.map(def => ({
      id: def.id,
      index: def.index,
      name: def.name,
      desc: def.desc,
      unlocked: !!saved.unlocked[def.id],
      date: saved.unlocked[def.id] || null,
    }));
  }

  /** 已解锁成就数量 */
  function getUnlocked() {
    return Object.keys(saved.unlocked).length;
  }

  /** 成就总数 */
  function getTotal() {
    return DEFS.length;
  }

  /**
   * 重置所有成就及持久化计数器。
   */
  function reset() {
    saved = {
      unlocked: {},
      orbitCount: 0,
      distanceKm: 0,
      cameras: [],
    };
    persist();
    lastDistanceKm = null;
    _updateBagCounter();
    if (panelRoot) _renderPanel();
  }

  /**
   * 打开成就面板。
   */
  function openPanel() {
    if (!_ensurePanel()) return;
    _renderPanel();
    panelRoot.classList.add('ach-panel-visible');

    // 使 #bag 可点击（若存在）
    const bag = document.getElementById('bag');
    if (bag) {
      bag.style.pointerEvents = 'auto';
      bag.style.cursor = 'pointer';
    }
  }

  /**
   * 关闭成就面板。
   */
  function closePanel() {
    if (!panelRoot) return;
    panelRoot.classList.remove('ach-panel-visible');
  }

  /**
   * 注册成就解锁回调。
   * @param {Function} fn - 接收 { id, name, desc, date } 的函数
   */
  function onUnlock(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  // ── #bag 点击绑定（DOM 可能尚未就绪，延迟到 DOMContentLoaded） ──────────────

  function _bindBag() {
    const bag = document.getElementById('bag');
    if (!bag) return;
    bag.style.pointerEvents = 'auto';
    bag.style.cursor = 'pointer';
    bag.addEventListener('click', openPanel);
    // 初始化计数器文字
    _updateBagCounter();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _bindBag);
    } else {
      // DOM 已就绪，直接绑定
      _bindBag();
    }
  }

  // ── 返回公开接口 ──────────────────────────────────────────────────────────────

  return {
    report,
    update,
    list,
    get unlocked() { return getUnlocked(); },
    get total() { return getTotal(); },
    reset,
    openPanel,
    closePanel,
    onUnlock,
  };
}
