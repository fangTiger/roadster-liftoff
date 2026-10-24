/**
 * Mars Roadster — 本局成绩 & 分享卡片模块
 * 纯 ES 模块，无外部依赖，无构建步骤，无网络请求。
 * 所有 UI 文字为简体中文，代码注释亦为中文。
 */

// ─── 纯工具函数（可单独导出供测试使用） ──────────────────────────────────────

/**
 * 格式化海拔高度。
 * < 1000 m → "850 m"
 * < 10 km  → "3.4 km"
 * 否则     → "412 km"（取整）
 * @param {number|null|undefined} m 海拔，单位米
 * @returns {string}
 */
export function formatAltitude(m) {
  if (m == null || isNaN(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  if (km < 10) return `${+km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * 格式化速度，整数 + 千位分隔符 + " km/h"。
 * 例如 27600 → "27,600 km/h"
 * @param {number|null|undefined} kmh
 * @returns {string}
 */
export function formatSpeed(kmh) {
  if (kmh == null || isNaN(kmh)) return '—';
  return `${Math.round(kmh).toLocaleString('en-US')} km/h`;
}

/**
 * 格式化时长（秒）。
 * < 60 s → "42 秒"
 * ≥ 60 s → "3 分 05 秒"
 * @param {number|null|undefined} sec
 * @returns {string}
 */
export function formatDuration(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} 分 ${String(r).padStart(2, '0')} 秒`;
}

/**
 * 格式化 0–100 km/h 加速时间（两位小数 + " 秒"）。
 * @param {number|null|undefined} sec
 * @returns {string}
 */
function formatLaunch(sec) {
  if (sec == null || isNaN(sec)) return '—';
  return `${Number(sec).toFixed(2)} 秒`;
}

/**
 * 格式化日期为 YYYY-MM-DD。
 * @param {Date|null|undefined} date 默认 new Date()
 * @returns {string}
 */
export function formatDate(date) {
  const d = (date instanceof Date && !isNaN(date)) ? date : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 根据本局成绩选取英雄标题和主要数值。
 * 优先级从高到低，第一个匹配的胜出。
 * @param {object} stats
 * @returns {{ title: string, value: string }}
 */
export function pickHeadline(stats = {}) {
  const { home, metOldFriend, reachedSpace, maxAltM, hops, topSpeedKmh } = stats;

  if (home) {
    return { title: '往返太空，安全返航', value: formatAltitude(maxAltM) };
  }
  if (metOldFriend) {
    return { title: '在轨道上与前辈同框', value: formatAltitude(maxAltM) };
  }
  if (reachedSpace) {
    return { title: '冲出大气层', value: formatAltitude(maxAltM) };
  }
  if (maxAltM != null && maxAltM >= 450) {
    return { title: '穿出云层', value: formatAltitude(maxAltM) };
  }
  if (hops != null && hops > 0) {
    return { title: '离地起飞', value: formatAltitude(maxAltM) };
  }
  return { title: '沙漠公路', value: formatSpeed(topSpeedKmh) };
}

// ─── 内部常量 ─────────────────────────────────────────────────────────────────

/** 系统字体栈（与主游戏 HUD 一致） */
const FONT_STACK = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 卡片尺寸 */
const CARD_SIZES = {
  landscape: { w: 1200, h: 630 },
  portrait:  { w: 1080, h: 1350 },
};

/** 配色（与 index.html :root 对齐） */
const C = {
  glass:  'rgba(14,16,22,0.72)',
  line:   'rgba(255,255,255,0.14)',
  txt:    '#f4f6fa',
  dim:    'rgba(244,246,250,0.6)',
  acc1:   '#ff8a5c',
  acc2:   '#ff4d3a',
  cy:     '#7fe3ff',
  gold:   '#ffd36a',
  gold2:  '#ffb347',
};

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

/** 懒加载 CSS 样式表（只挂一次） */
function ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('share-css')) return;
  const link = document.createElement('link');
  link.id = 'share-css';
  link.rel = 'stylesheet';
  link.href = new URL('.', import.meta.url).href + 'share.css';
  document.head.appendChild(link);
}

/**
 * 将截图源（Canvas / Image / ImageBitmap / data URL / null）
 * 统一转换为可绘制对象（HTMLCanvasElement 或 null）。
 * @param {*} src
 * @returns {HTMLCanvasElement|HTMLImageElement|ImageBitmap|null}
 */
function normaliseScreenshot(src) {
  if (!src) return null;
  // data URL → 创建 Image
  if (typeof src === 'string' && src.startsWith('data:')) {
    const img = new Image();
    img.src = src;
    return img; // 调用方等待 onload
  }
  return src; // Canvas / Image / ImageBitmap 直接使用
}

/**
 * 将截图源绘制到画布，cover 模式铺满。
 * @param {CanvasRenderingContext2D} ctx
 * @param {*} src  已加载的图像源（或 null）
 * @param {number} w  目标宽度
 * @param {number} h  目标高度
 */
function drawScreenshotCover(ctx, src, w, h) {
  if (!src) {
    // 无截图：使用深色宇宙渐变背景
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#08090f');
    grad.addColorStop(0.4, '#0d1228');
    grad.addColorStop(1, '#1a0a22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // 添加几颗星星（伪随机，种子固定，保证每次一致）
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const stars = [[0.12, 0.08], [0.35, 0.15], [0.55, 0.06], [0.72, 0.22], [0.88, 0.10],
                   [0.20, 0.35], [0.60, 0.28], [0.80, 0.42], [0.45, 0.50], [0.92, 0.55],
                   [0.08, 0.60], [0.30, 0.70], [0.65, 0.18], [0.78, 0.65], [0.15, 0.80]];
    for (const [rx, ry] of stars) {
      ctx.beginPath();
      ctx.arc(rx * w, ry * h, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // 计算 cover 缩放比例
  const sw = src.width  || src.naturalWidth  || w;
  const sh = src.height || src.naturalHeight || h;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  try {
    ctx.drawImage(src, dx, dy, dw, dh);
  } catch (_) {
    // 画布污染（tainted canvas）：降级为渐变背景
    drawScreenshotCover(ctx, null, w, h);
  }
}

/**
 * 异步加载图像，2 秒超时后 resolve(null)。
 * @param {string} url
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadImage(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 2000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/**
 * 在画布上绘制圆角矩形（兼容旧浏览器）。
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── 卡片渲染 ─────────────────────────────────────────────────────────────────

/**
 * 渲染分享卡片到一个新的 HTMLCanvasElement。
 * @param {object}  stats         本局成绩
 * @param {*}       screenshot    截图源（Canvas / Image / data URL / null）
 * @param {'landscape'|'portrait'} format
 * @param {string}  logoUrl       logo 图像 URL
 * @param {string}  author        作者名
 * @param {string}  siteUrl       网站 URL（可选）
 * @param {string}  credit        版权行
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCard(stats, screenshot, format, { logoUrl, author, siteUrl, credit } = {}) {
  const { w, h } = CARD_SIZES[format] || CARD_SIZES.landscape;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // ── 加载 logo 图像 ──────────────────────────────────────────────────────────
  const logoImg = await loadImage(logoUrl || '/logo.svg');

  // ── 截图源加载（data URL 需等待 onload） ────────────────────────────────────
  let imgSrc = normaliseScreenshot(screenshot);
  if (imgSrc instanceof HTMLImageElement && !imgSrc.complete) {
    await new Promise(resolve => {
      imgSrc.onload  = resolve;
      imgSrc.onerror = resolve;
      setTimeout(resolve, 2000);
    });
  }

  // ── 背景：截图 cover ────────────────────────────────────────────────────────
  drawScreenshotCover(ctx, imgSrc, w, h);

  // ── 暗色遮罩渐变（提升文字可读性） ────────────────────────────────────────
  const isLandscape = format !== 'portrait';
  {
    let grad;
    if (isLandscape) {
      // 横版：从左向右渐变
      grad = ctx.createLinearGradient(0, 0, w * 0.65, 0);
    } else {
      // 竖版：从下向上渐变
      grad = ctx.createLinearGradient(0, h, 0, h * 0.15);
    }
    grad.addColorStop(0,   'rgba(8,9,20,0.88)');
    grad.addColorStop(0.6, 'rgba(8,9,20,0.60)');
    grad.addColorStop(1,   'rgba(8,9,20,0.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 通用布局参数 ────────────────────────────────────────────────────────────
  // 竖版整体放大 1.5 倍排版（逻辑尺寸 720×900），手机上看字号才够大
  const K = isLandscape ? 1 : 1.5, W = w / K, H = h / K;
  ctx.scale(K, K);
  const pad = isLandscape ? 56 : 44;
  let yCursor = pad;

  // ── 顶部：logo + 标题 + 日期 ─────────────────────────────────────────────
  // Logo 圆角方块
  const logoSize = 64;
  if (logoImg) {
    ctx.save();
    roundRect(ctx, pad, yCursor, logoSize, logoSize, 14);
    ctx.clip();
    ctx.drawImage(logoImg, pad, yCursor, logoSize, logoSize);
    ctx.restore();
  } else {
    // 无 logo 时画渐变占位方块
    const gLogo = ctx.createLinearGradient(pad, yCursor, pad + logoSize, yCursor + logoSize);
    gLogo.addColorStop(0, '#0a1030');
    gLogo.addColorStop(1, '#1f3a7a');
    ctx.fillStyle = gLogo;
    roundRect(ctx, pad, yCursor, logoSize, logoSize, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 28px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText('⟁', pad + logoSize / 2, yCursor + logoSize / 2 + 10);
  }

  const textX = pad + logoSize + 16;
  ctx.textAlign = 'left';

  // 游戏名
  ctx.fillStyle = C.txt;
  ctx.font = `bold 28px ${FONT_STACK}`;
  ctx.fillText('Mars Roadster', textX, yCursor + 24);

  // 副标题
  ctx.fillStyle = C.dim;
  ctx.font = `16px ${FONT_STACK}`;
  ctx.fillText('离地 · 推进器超跑', textX, yCursor + 48);

  // 日期（右对齐）
  ctx.textAlign = 'right';
  ctx.fillStyle = C.dim;
  ctx.font = `14px ${FONT_STACK}`;
  ctx.fillText(formatDate(stats.date), W - pad, yCursor + 20);

  yCursor += logoSize + 40;
  if (!isLandscape) yCursor = Math.max(yCursor, H - 544);   // 竖版：成绩区贴近底部，上半部分留给游戏画面

  // ── 英雄区：大标题 + 大数值 ───────────────────────────────────────────────
  ctx.textAlign = 'left';
  const headline = pickHeadline(stats);

  ctx.fillStyle = C.dim;
  ctx.font = `500 22px ${FONT_STACK}`;
  ctx.fillText(headline.title, pad, yCursor);
  yCursor += isLandscape ? 92 : 112;                       // 大数值的基线：留出整行字高，避免与标题重叠

  // 渐变大数值
  const heroGrad = ctx.createLinearGradient(pad, yCursor - 60, pad + 400, yCursor);
  heroGrad.addColorStop(0, '#ff8a5c');
  heroGrad.addColorStop(1, '#ff4d3a');
  ctx.fillStyle = heroGrad;
  // 数值太长时缩小字号，保证不超出可用宽度
  const heroMaxW = isLandscape ? W * 0.62 - pad : W - pad * 2;
  let heroSize = isLandscape ? 96 : 110;
  ctx.font = `bold ${heroSize}px ${FONT_STACK}`;
  while (heroSize > 40 && ctx.measureText(headline.value).width > heroMaxW) { heroSize -= 4; ctx.font = `bold ${heroSize}px ${FONT_STACK}`; }
  ctx.fillText(headline.value, pad, yCursor);
  // ── 数据网格（磨砂圆角框） ────────────────────────────────────────────────
  yCursor += isLandscape ? 32 : 44;

  // 构建统计条目
  const statRows = [
    { label: '极速',      value: formatSpeed(stats.topSpeedKmh) },
    { label: '0–100',     value: formatLaunch(stats.launchSec) },
    { label: '最高海拔',  value: formatAltitude(stats.maxAltM) },
    { label: '里程',      value: stats.distanceKm != null ? `${Number(stats.distanceKm).toFixed(1)} km` : '—' },
    { label: '金币',      value: stats.coins != null ? String(stats.coins) : '—' },
    {
      label: '成就',
      value: stats.achievements
        ? `${stats.achievements.unlocked} / ${stats.achievements.total}`
        : '—',
    },
  ];

  const cols = isLandscape ? 3 : 2;
  const boxPad = 20;
  const cellW = isLandscape ? (W * 0.52 - pad * 2) / cols : (W - pad * 2 - boxPad * 2) / cols;
  const cellH = 72;
  const gridW = cellW * cols + boxPad * 2;
  const rows  = Math.ceil(statRows.length / cols);
  const gridH = rows * cellH + boxPad * 2;

  // 绘制磨砂圆角框
  ctx.save();
  roundRect(ctx, pad, yCursor, gridW, gridH, 16);
  ctx.fillStyle = C.glass;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // 绘制网格内容
  for (let i = 0; i < statRows.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = pad + boxPad + col * cellW;
    const cy = yCursor + boxPad + row * cellH;

    // 标签
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dim;
    ctx.font = `13px ${FONT_STACK}`;
    ctx.fillText(statRows[i].label, cx + 12, cy + 22);

    // 值（金币行加金色，成就行加青色）
    let valColor = C.txt;
    if (statRows[i].label === '金币')  valColor = C.gold;
    if (statRows[i].label === '成就')  valColor = C.cy;

    ctx.fillStyle = valColor;
    ctx.font = `bold 22px ${FONT_STACK}`;
    ctx.fillText(statRows[i].value, cx + 12, cy + 54);
  }

  yCursor += gridH + 28;

  // ── 徽章行 ────────────────────────────────────────────────────────────────
  const badges = [
    { key: 'reachedSpace',  label: '进入太空',  color: C.cy },
    { key: 'metOldFriend',  label: '与前辈同框', color: C.gold },
    { key: 'home',          label: '安全返航',  color: '#7fff9a' },
  ];

  const pillH = 34;
  let pillX = pad;
  ctx.font = `600 14px ${FONT_STACK}`;

  for (const badge of badges) {
    const earned = !!stats[badge.key];
    const label = badge.label;
    const metrics = ctx.measureText(label);
    const pillW = metrics.width + 32;

    ctx.save();
    roundRect(ctx, pillX, yCursor, pillW, pillH, pillH / 2);
    if (earned) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeStyle = badge.color;
      ctx.lineWidth = 1.5;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = earned ? badge.color : 'rgba(255,255,255,0.30)';
    ctx.fillText(label, pillX + 16, yCursor + 22);

    pillX += pillW + 10;
  }

  // ── 页脚 ──────────────────────────────────────────────────────────────────
  const footerY = H - 36;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.dim;
  ctx.font = `13px ${FONT_STACK}`;

  let footerParts = [];
  if (author) footerParts.push(`作者 ${author}`);
  if (credit) footerParts.push(credit);
  if (siteUrl) footerParts.push(siteUrl);
  ctx.fillText(footerParts.join(' · '), pad, footerY);

  return canvas;
}

// ─── 主工厂函数 ───────────────────────────────────────────────────────────────

/**
 * 创建分享模块实例。
 * @param {object} [opts]
 * @param {string} [opts.logoUrl='/logo.svg']
 * @param {string} [opts.author='Captain@mycndota']
 * @param {string} [opts.siteUrl='']
 * @param {string} [opts.credit='Built with Arc Studio + Claude Code']
 */
export function createShare({
  logoUrl = '/logo.svg',
  author  = 'Captain@mycndota',
  siteUrl = '',
  credit  = 'Built with Arc Studio + Claude Code',
  injectCss = true,   // 页面已用 <link> 引入 share.css 时传 false（打包后按模块地址找不到 css）
} = {}) {

  // ── 内部状态 ─────────────────────────────────────────────────────────────

  /** 面板是否已打开 */
  let _open = false;

  /** onClose 回调列表 */
  const closeListeners = [];

  /** 面板根节点（懒创建） */
  let wrap = null;

  /** 当前卡片格式 */
  let currentFormat = 'landscape';

  /** 当前渲染好的卡片 Canvas */
  let currentCardCanvas = null;

  /** 上一次获得焦点的元素（关闭后还原） */
  let previousFocus = null;

  /** 键盘拦截句柄（捕获阶段，阻止按键传至游戏） */
  let keyCapture = null;

  // ── 公开 renderCard（绑定默认参数） ─────────────────────────────────────

  /**
   * @param {object} stats
   * @param {*} screenshot
   * @param {'landscape'|'portrait'} [format='landscape']
   * @returns {Promise<HTMLCanvasElement>}
   */
  function renderCardBound(stats, screenshot, format = 'landscape') {
    return renderCard(stats, screenshot, format, { logoUrl, author, siteUrl, credit });
  }

  // ── DOM 构建 ──────────────────────────────────────────────────────────────

  /** 懒创建面板 DOM，返回 false 表示 document 不可用 */
  function ensurePanel() {
    if (injectCss) ensureCss();
    if (typeof document === 'undefined') return false;
    if (wrap) return true;

    wrap = document.createElement('div');
    wrap.id = 'share-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', '本局成绩');
    wrap.innerHTML = `
      <div class="share-panel" id="share-panel" tabindex="-1">
        <header class="share-header">
          <div class="share-header-brand">
            <img class="share-logo" id="share-logo" src="" alt="" width="36" height="36">
            <div>
              <b class="share-title">Mars Roadster</b>
              <span class="share-subtitle">本局成绩</span>
            </div>
          </div>
          <span class="share-date" id="share-date"></span>
          <button class="share-close" id="share-close" aria-label="关闭">✕</button>
        </header>

        <div class="share-hero" id="share-hero">
          <span class="share-hero-title" id="share-hero-title"></span>
          <span class="share-hero-value" id="share-hero-value"></span>
        </div>

        <div class="share-stat-grid" id="share-stat-grid"></div>

        <div class="share-badges" id="share-badges"></div>

        <div class="share-preview-wrap">
          <div class="share-preview-header">
            <span class="share-preview-label">分享卡片预览</span>
            <div class="share-fmt-toggle" id="share-fmt-toggle">
              <button class="share-fmt-btn active" data-fmt="landscape">横版</button>
              <button class="share-fmt-btn" data-fmt="portrait">竖版</button>
            </div>
          </div>
          <div class="share-preview-canvas-wrap" id="share-preview-canvas-wrap">
            <canvas class="share-preview-canvas" id="share-preview-canvas"></canvas>
            <div class="share-preview-loading" id="share-preview-loading">渲染中…</div>
          </div>
        </div>

        <footer class="share-actions" id="share-actions">
          <button class="share-btn share-btn-save"  id="share-save">保存图片</button>
          <button class="share-btn share-btn-share" id="share-share" style="display:none">分享</button>
          <button class="share-btn share-btn-copy"  id="share-copy"  style="display:none">复制图片</button>
          <button class="share-btn share-btn-primary" id="share-continue">继续驾驶</button>
        </footer>
      </div>
    `;

    // 背景点击关闭
    wrap.addEventListener('click', e => {
      if (e.target === wrap) close();
    });

    document.body.appendChild(wrap);
    return true;
  }

  // ── 焦点陷阱 ──────────────────────────────────────────────────────────────

  /** 将焦点锁定在面板内，Tab/Shift+Tab 循环 */
  function trapFocus(e) {
    if (!wrap) return;
    const focusable = Array.from(
      wrap.querySelectorAll('button, [tabindex]:not([tabindex="-1"]), a, input, select, textarea')
    ).filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    // Esc 关闭；回车在按钮上时交给按钮本身（保存/分享/复制），其余位置回车关闭
    const onButton = document.activeElement && document.activeElement.closest && document.activeElement.closest('button, a');
    if (e.key === 'Escape' || (e.key === 'Enter' && !onButton)) {
      e.preventDefault();
      close();
    }
    // 面板内的按键到此为止，不再冒泡给游戏
    if (!isBrowserShortcut(e)) e.stopPropagation();
  }
  const isBrowserShortcut = e => e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key);

  // ── 键盘拦截（阻止游戏接收按键） ─────────────────────────────────────────

  function startKeyCapture() {
    if (keyCapture) return;
    keyCapture = e => {
      // 保留浏览器系统快捷键（F5、Ctrl+R 等）；面板内的按键先交给面板（trapFocus 处理后再拦截），
      // 面板外的按键在捕获阶段直接拦截，游戏收不到
      if (isBrowserShortcut(e) || (wrap && wrap.contains(e.target))) return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', keyCapture, { capture: true });
  }

  function stopKeyCapture() {
    if (!keyCapture) return;
    window.removeEventListener('keydown', keyCapture, { capture: true });
    keyCapture = null;
  }

  // ── 渲染面板内容 ──────────────────────────────────────────────────────────

  /** 填充面板数据并触发卡片渲染 */
  async function populatePanel(stats, screenshot) {
    const d = (stats.date instanceof Date) ? stats.date : new Date();

    // Logo
    document.getElementById('share-logo').src = logoUrl;

    // 日期
    document.getElementById('share-date').textContent = formatDate(d);

    // 英雄区
    const headline = pickHeadline(stats);
    document.getElementById('share-hero-title').textContent = headline.title;
    document.getElementById('share-hero-value').textContent = headline.value;

    // 统计网格
    const statGrid = document.getElementById('share-stat-grid');
    const coins = stats.coins != null ? stats.coins : null;
    const ach   = stats.achievements;
    const rows = [
      { label: '极速',     value: formatSpeed(stats.topSpeedKmh) },
      { label: '0–100 用时', value: formatLaunch(stats.launchSec) },
      { label: '最高海拔', value: formatAltitude(stats.maxAltM) },
      { label: '里程',     value: stats.distanceKm != null ? `${Number(stats.distanceKm).toFixed(1)} km` : '—' },
      {
        label: '金币',
        value: coins != null ? String(coins) : '—',
        gold: true,
        coin: true,
      },
      {
        label: '成就',
        value: ach ? `${ach.unlocked} / ${ach.total}` : '—',
        cy: true,
      },
    ];
    statGrid.innerHTML = rows.map(r => `
      <div class="share-stat-cell">
        <span class="share-stat-label">${r.label}</span>
        <b class="share-stat-value${r.gold ? ' share-stat-gold' : ''}${r.cy ? ' share-stat-cy' : ''}">
          ${r.coin ? '<i class="share-coin"></i>' : ''}${r.value}
        </b>
      </div>
    `).join('');

    // 徽章行
    const badgeWrap = document.getElementById('share-badges');
    const badgeDefs = [
      { key: 'reachedSpace',  label: '进入太空' },
      { key: 'metOldFriend',  label: '与前辈同框' },
      { key: 'home',          label: '安全返航' },
    ];
    badgeWrap.innerHTML = badgeDefs.map(b => `
      <span class="share-badge${stats[b.key] ? ' share-badge-earned' : ''}">${b.label}</span>
    `).join('');

    // 按钮显示逻辑
    const shareBtn = document.getElementById('share-share');
    const copyBtn  = document.getElementById('share-copy');
    if (typeof navigator !== 'undefined' && navigator.canShare) {
      // 先用假 PNG 文件探测；若支持则显示
      try {
        const testFile = new File([''], 'test.png', { type: 'image/png' });
        if (navigator.canShare({ files: [testFile] })) {
          shareBtn.style.display = '';
        }
      } catch (_) {}
    }
    if (typeof ClipboardItem !== 'undefined' &&
        navigator.clipboard && navigator.clipboard.write) {
      copyBtn.style.display = '';
    }

    // ── 绑定按钮事件（每次打开都重新绑定，避免旧引用） ─────────────────────
    document.getElementById('share-close').onclick    = () => close();
    document.getElementById('share-continue').onclick = () => close();

    document.getElementById('share-save').onclick = async () => {
      const c = currentCardCanvas;
      if (!c) return;
      const a = document.createElement('a');
      a.download = `mars-roadster-${formatDate(d).replace(/-/g, '')}-${_hhmmNow()}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    };

    shareBtn.onclick = async () => {
      const c = currentCardCanvas;
      if (!c) return;
      try {
        const blob = await canvasToBlob(c);
        const file = new File([blob], `mars-roadster-${formatDate(d)}.png`, { type: 'image/png' });
        await navigator.share({ files: [file] });
      } catch (_) {}
    };

    copyBtn.onclick = async () => {
      const c = currentCardCanvas;
      if (!c) return;
      try {
        const blob = await canvasToBlob(c);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copyBtn.textContent = '已复制 ✓';
        setTimeout(() => { copyBtn.textContent = '复制图片'; }, 2200);
      } catch (_) {}
    };

    // 格式切换
    document.getElementById('share-fmt-toggle').onclick = async e => {
      const btn = e.target.closest('[data-fmt]');
      if (!btn) return;
      const fmt = btn.dataset.fmt;
      if (fmt === currentFormat) return;
      currentFormat = fmt;
      document.querySelectorAll('#share-fmt-toggle .share-fmt-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.fmt === fmt);
      });
      await refreshCardPreview(stats, screenshot);
    };

    // 渲染卡片预览
    await refreshCardPreview(stats, screenshot);
  }

  /** 重新渲染卡片并更新预览 canvas */
  async function refreshCardPreview(stats, screenshot) {
    const loading = document.getElementById('share-preview-loading');
    const previewCanvas = document.getElementById('share-preview-canvas');
    if (loading) loading.style.display = 'flex';

    try {
      const card = await renderCardBound(stats, screenshot, currentFormat);
      currentCardCanvas = card;

      // 将卡片缩放绘制到预览 canvas
      const wrap = document.getElementById('share-preview-canvas-wrap');
      if (!wrap || !previewCanvas) return;
      const maxW = wrap.clientWidth || 600;
      const scale = Math.min(1, maxW / card.width);
      previewCanvas.width  = card.width;
      previewCanvas.height = card.height;
      previewCanvas.style.width  = `${Math.round(card.width * scale)}px`;
      previewCanvas.style.height = `${Math.round(card.height * scale)}px`;
      const pCtx = previewCanvas.getContext('2d');
      pCtx.drawImage(card, 0, 0);
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  // ── 公开 API ──────────────────────────────────────────────────────────────

  /**
   * 打开成绩面板。
   * @param {object} stats       本局成绩
   * @param {*}      screenshot  截图源（可为 null）
   */
  async function open(stats = {}, screenshot = null) {
    if (_open) return;
    if (!ensurePanel()) return;

    _open = true;
    currentFormat = 'landscape';
    previousFocus = document.activeElement;
    startKeyCapture();

    // 显示面板
    wrap.classList.add('share-visible');

    // 填充内容（异步）
    await populatePanel(stats, screenshot);

    // 将焦点移入面板
    const panel = document.getElementById('share-panel');
    if (panel) panel.focus();

    // 焦点陷阱
    wrap.addEventListener('keydown', trapFocus);
  }

  /** 关闭面板并通知回调 */
  function close() {
    if (!_open || !wrap) return;
    _open = false;
    wrap.classList.remove('share-visible');
    wrap.removeEventListener('keydown', trapFocus);
    stopKeyCapture();
    // 还原焦点
    if (previousFocus && previousFocus.focus) {
      try { previousFocus.focus(); } catch (_) {}
    }
    // 通知外部
    for (const fn of closeListeners) {
      try { fn(); } catch (_) {}
    }
  }

  /**
   * 注册面板关闭回调。
   * @param {Function} fn
   */
  function onClose(fn) {
    if (typeof fn === 'function') closeListeners.push(fn);
  }

  return {
    open,
    close,
    get isOpen() { return _open; },
    onClose,
    renderCard: renderCardBound,
  };
}

// ─── 内部小工具 ───────────────────────────────────────────────────────────────

/** 返回当前时间 HHMM 字符串（用于文件名） */
function _hhmmNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

/** Canvas → Blob（Promise 包装） */
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png');
  });
}
