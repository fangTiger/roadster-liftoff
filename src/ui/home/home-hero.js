/**
 * home-hero.js — Mars Roadster 首屏英雄区模块
 * 职责：标题动画、模式卡片、链上直播条
 * 纯 ES 模块，无依赖，无构建步骤。
 */

// ─── 纯工具函数（可导出供测试）────────────────────────────────────────────

/**
 * 格式化圈速毫秒 → "m:ss.sss"（< 60 s 时省去分钟部分）
 * @param {number} ms
 * @returns {string}
 */
export function formatLap(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---';
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis  = totalMs % 1000;
  const mm = String(millis).padStart(3, '0');
  const ss = String(seconds).padStart(2, '0');
  if (minutes > 0) return `${minutes}:${ss}.${mm}`;
  return `${ss}.${mm}`;
}

/**
 * 缩短以太坊地址 → "0x1234…abcd"
 * @param {string} addr
 * @returns {string}
 */
export function shortAddr(addr) {
  if (typeof addr !== 'string' || addr.length < 10) return addr || '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

/**
 * 相对时间字符串（纯函数，方便测试）
 * @param {number} at  — epochMs
 * @param {number} now — epochMs
 * @param {function} t — i18n 函数
 * @returns {string}
 */
export function relativeTime(at, now, t) {
  const diff = Math.max(0, now - at);
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)  return t('home.timeJustNow');
  const min = Math.floor(sec / 60);
  if (min < 60)  return t('home.timeMinAgo', { n: min });
  const hr  = Math.floor(min / 60);
  if (hr < 24)   return t('home.timeHrAgo',  { n: hr });
  const day = Math.floor(hr / 24);
  return t('home.timeDayAgo', { n: day });
}

// ─── 内部常量 ─────────────────────────────────────────────────────────────

/** 悬停防抖延迟 ms */
const HOVER_DEBOUNCE = 80;
/** 预览层淡入时长 ms */
const PREVIEW_FADE   = 450;
/** Ken Burns 缩放倍率 */
const KB_SCALE       = 1.06;
/** KB 持续时间 s */
const KB_DURATION    = 8;

// ─── 主工厂 ───────────────────────────────────────────────────────────────

/**
 * 创建首屏英雄区
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {function} opts.t
 * @param {Array}    opts.modes
 * @param {function} [opts.onModeHover]
 * @param {function} [opts.onModeSelect]
 * @param {boolean}  [opts.reducedMotion]
 */
export function createHomeHero({
  container,
  t,
  modes = [],
  onModeHover   = () => {},
  onModeSelect  = () => {},
  reducedMotion,
} = {}) {
  // ── 运动感知 ──────────────────────────────────────────────────────────
  let _reduced = typeof reducedMotion === 'boolean'
    ? reducedMotion
    : (typeof matchMedia !== 'undefined'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false);

  // matchMedia 变化监听
  let _mql = null;
  const _mqlHandler = (e) => { _reduced = e.matches; };
  if (typeof reducedMotion !== 'boolean' && typeof matchMedia !== 'undefined') {
    _mql = matchMedia('(prefers-reduced-motion: reduce)');
    _mql.addEventListener('change', _mqlHandler);
  }

  // ── 状态 ──────────────────────────────────────────────────────────────
  let _root        = null;   // .hh-root div
  let _destroyed   = false;
  let _visible     = false;
  let _liveData    = null;

  // 悬停防抖 timer
  let _hoverTimer  = null;
  // 当前激活 preview 索引
  let _activePreview = -1;
  // video src 已设置的集合（避免重复设置）
  let _videoLoaded = new Set();
  // 当前播放 video 元素引用
  let _playingVideo = null;

  // ── DOM 懒建 ──────────────────────────────────────────────────────────

  function _ensureDOM() {
    if (_root) return;

    _root = document.createElement('div');
    _root.className = 'hh-root';
    _root.setAttribute('aria-hidden', 'true');

    // 预览层容器（在卡片之后、场景之上）
    const previewLayer = document.createElement('div');
    previewLayer.className = 'hh-preview-layer';
    previewLayer.setAttribute('aria-hidden', 'true');
    _root.appendChild(previewLayer);

    // 渐晕遮罩
    const vignette = document.createElement('div');
    vignette.className = 'hh-vignette';
    vignette.setAttribute('aria-hidden', 'true');
    _root.appendChild(vignette);

    // 主内容
    const main = document.createElement('div');
    main.className = 'hh-main';
    _root.appendChild(main);

    // 标题块
    const titleBlock = document.createElement('div');
    titleBlock.className = 'hh-title-block';
    main.appendChild(titleBlock);

    // 眉标（cyan，字间距）
    const eyebrow = document.createElement('p');
    eyebrow.className = 'hh-eyebrow';
    eyebrow.setAttribute('aria-hidden', 'true'); // 装饰性文字，屏幕阅读器忽略
    titleBlock.appendChild(eyebrow);

    // h1 标题
    const h1 = document.createElement('h1');
    h1.className = 'hh-title';
    titleBlock.appendChild(h1);

    // 副标题
    const subtitle = document.createElement('p');
    subtitle.className = 'hh-subtitle';
    titleBlock.appendChild(subtitle);

    // 卡片行
    const cardRow = document.createElement('div');
    cardRow.className = 'hh-card-row';
    cardRow.setAttribute('role', 'list');
    main.appendChild(cardRow);

    // 插槽（游戏控制引导等）
    const slot = document.createElement('div');
    slot.className = 'hh-slot-footer';
    main.appendChild(slot);

    // 链上直播条（最底部）
    const strip = document.createElement('div');
    strip.className = 'hh-live-strip';
    strip.setAttribute('aria-live', 'polite');
    strip.setAttribute('aria-atomic', 'true');
    _root.appendChild(strip);

    container.appendChild(_root);

    // 渲染预览层
    _renderPreviews(previewLayer);
    // 渲染文字
    _renderText();
    // 渲染卡片
    _renderCards(cardRow);
    // 渲染直播条
    _renderLiveStrip(strip);

    // 卡片键盘导航（← →）
    cardRow.addEventListener('keydown', _onCardRowKeydown);

    // 初始隐藏
    _root.setAttribute('aria-hidden', 'true');
    _root.style.visibility = 'hidden';
    _root.style.opacity    = '0';
  }

  // ── 文字渲染 ──────────────────────────────────────────────────────────

  function _renderText() {
    if (!_root) return;
    const eyebrow  = _root.querySelector('.hh-eyebrow');
    const h1       = _root.querySelector('.hh-title');
    const subtitle = _root.querySelector('.hh-subtitle');

    // eyebrow
    eyebrow.textContent = t('home.eyebrow');

    // h1 — "Mars " + gradient span for "Roadster"
    // 字母动画时每个字母用 <span class="hh-letter">
    h1.textContent = '';
    const marsText = t('home.titleMars');   // "Mars"
    const rText    = t('home.titleRoadster'); // "Roadster"

    // Mars 部分（逐字）
    for (const ch of marsText + ' ') {
      const sp = document.createElement('span');
      sp.className = 'hh-letter';
      sp.textContent = ch === ' ' ? '\u00A0' : ch;
      h1.appendChild(sp);
    }
    // Roadster 部分（accent gradient 包裹，逐字）
    const gradSpan = document.createElement('span');
    gradSpan.className = 'hh-title-accent';
    for (const ch of rText) {
      const sp = document.createElement('span');
      sp.className = 'hh-letter';
      sp.textContent = ch;
      gradSpan.appendChild(sp);
    }
    h1.appendChild(gradSpan);

    // 光扫元素（叠在标题上方）
    let sweep = _root.querySelector('.hh-title-sweep');
    if (!sweep) {
      sweep = document.createElement('div');
      sweep.className = 'hh-title-sweep';
      sweep.setAttribute('aria-hidden', 'true');
      _root.querySelector('.hh-title-block').appendChild(sweep);
    }

    // 副标题
    subtitle.textContent = t('home.subtitle');
  }

  // ── 预览层 ────────────────────────────────────────────────────────────

  function _renderPreviews(layer) {
    layer.innerHTML = '';
    modes.forEach((mode, i) => {
      const div = document.createElement('div');
      div.className = 'hh-preview-item';
      div.dataset.idx = i;
      div.style.opacity = '0';
      div.style.transform = 'scale(1)';

      if (mode.preview?.type === 'video') {
        const vid = document.createElement('video');
        vid.muted   = true;
        vid.loop    = true;
        vid.playsInline = true;
        vid.setAttribute('playsinline', '');
        // poster 立即设置（安全）
        if (mode.preview.poster) vid.poster = mode.preview.poster;
        // src 延迟到首次 hover（保留引用）
        vid.dataset.lazySrc = mode.preview.src || '';
        vid.addEventListener('error', () => { /* 静默处理加载失败 */ });
        div.appendChild(vid);
      } else if (mode.preview?.type === 'image') {
        const img = document.createElement('img');
        img.src = mode.preview.src || '';
        img.alt = '';
        img.addEventListener('error', () => { img.style.display = 'none'; });
        div.appendChild(img);
      }

      layer.appendChild(div);
    });
  }

  // ── 卡片渲染 ──────────────────────────────────────────────────────────

  function _renderCards(row) {
    row.innerHTML = '';

    modes.forEach((mode, i) => {
      const li = document.createElement('div');
      li.className = 'hh-card-wrap';
      li.setAttribute('role', 'listitem');

      const btn = document.createElement('button');
      btn.className = 'hh-card' + (mode.disabled ? ' hh-card--disabled' : '');
      btn.setAttribute('role', 'button');
      btn.tabIndex = i === 0 ? 0 : -1;  // 初始只有第一个在 tab 顺序中
      btn.setAttribute('aria-disabled', mode.disabled ? 'true' : 'false');
      btn.setAttribute('aria-label', mode.title + (mode.disabled ? (' — ' + t('home.comingSoon')) : ''));

      // 缩略图
      const thumb = document.createElement('div');
      thumb.className = 'hh-card-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      if (mode.preview?.type === 'image') {
        const img = document.createElement('img');
        img.src = mode.preview.src || '';
        img.alt = '';
        img.addEventListener('error', () => { img.style.display = 'none'; });
        thumb.appendChild(img);
      } else if (mode.preview?.type === 'video' && mode.preview.poster) {
        const img = document.createElement('img');
        img.src = mode.preview.poster;
        img.alt = '';
        img.addEventListener('error', () => { img.style.display = 'none'; });
        thumb.appendChild(img);
      }
      btn.appendChild(thumb);

      // 内容
      const content = document.createElement('div');
      content.className = 'hh-card-content';

      const titleEl = document.createElement('div');
      titleEl.className = 'hh-card-title';
      titleEl.textContent = mode.title;  // 纯 textContent，防 XSS

      const descEl = document.createElement('div');
      descEl.className = 'hh-card-desc';
      descEl.textContent = mode.desc || '';  // 纯 textContent

      content.appendChild(titleEl);
      content.appendChild(descEl);

      // badge
      if (mode.badge) {
        const badge = document.createElement('span');
        badge.className = 'hh-card-badge';
        badge.textContent = mode.badge;
        content.appendChild(badge);
      }

      // 箭头
      const arrow = document.createElement('span');
      arrow.className = 'hh-card-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      // 原创内联 SVG 箭头
      arrow.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M5 9h8M9.5 5.5L13 9l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

      btn.appendChild(content);
      btn.appendChild(arrow);

      // 光晕扫光元素
      const sheen = document.createElement('div');
      sheen.className = 'hh-card-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      btn.appendChild(sheen);

      // 禁用卡片：tooltip
      if (mode.disabled) {
        const tip = document.createElement('span');
        tip.className = 'hh-card-tooltip';
        tip.role = 'tooltip';
        tip.textContent = mode.badge || t('home.comingSoon');
        btn.appendChild(tip);
      }

      // 事件
      btn.addEventListener('click', (e) => _onCardClick(e, mode, i));
      btn.addEventListener('mouseenter', () => _onCardEnter(i));
      btn.addEventListener('mouseleave', () => _onCardLeave());
      btn.addEventListener('focus', () => _onCardEnter(i));
      btn.addEventListener('blur', () => _onCardLeave());
      btn.addEventListener('keydown', (e) => {
        if (mode.disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onModeSelect(mode.id);
        }
      });

      li.appendChild(btn);
      row.appendChild(li);
    });
  }

  // ── 卡片交互 ──────────────────────────────────────────────────────────

  function _onCardClick(e, mode, idx) {
    if (mode.disabled) {
      // 摇动动画
      const btn = e.currentTarget;
      btn.classList.remove('hh-card--shake');
      // 强制回流触发重播
      void btn.offsetWidth;
      btn.classList.add('hh-card--shake');
      btn.addEventListener('animationend', () => btn.classList.remove('hh-card--shake'), { once: true });
      return;
    }
    onModeSelect(mode.id);
  }

  function _onCardEnter(idx) {
    clearTimeout(_hoverTimer);
    _hoverTimer = setTimeout(() => {
      _activatePreview(idx);
      onModeHover(modes[idx]?.id ?? null);
    }, HOVER_DEBOUNCE);
  }

  function _onCardLeave() {
    clearTimeout(_hoverTimer);
    _hoverTimer = setTimeout(() => {
      _deactivatePreview();
      onModeHover(null);
    }, HOVER_DEBOUNCE);
  }

  function _onCardRowKeydown(e) {
    const cards = [..._root.querySelectorAll('.hh-card')];
    const focused = document.activeElement;
    const idx = cards.indexOf(focused);
    if (idx === -1) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (idx + 1) % cards.length;
      cards[next].tabIndex = 0;
      cards[idx].tabIndex = -1;
      cards[next].focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (idx - 1 + cards.length) % cards.length;
      cards[prev].tabIndex = 0;
      cards[idx].tabIndex = -1;
      cards[prev].focus();
    }
  }

  // ── 预览层交互 ────────────────────────────────────────────────────────

  function _activatePreview(idx) {
    if (!_root) return;
    const items = _root.querySelectorAll('.hh-preview-item');

    if (_activePreview === idx) return;
    _deactivatePreview(false); // 不重置 _activePreview 暂时

    _activePreview = idx;
    const item = items[idx];
    if (!item) return;

    // 视频：首次 hover 才设置 src
    const vid = item.querySelector('video');
    if (vid && !_videoLoaded.has(idx)) {
      const lazySrc = vid.dataset.lazySrc;
      if (lazySrc) {
        vid.src = lazySrc;
        _videoLoaded.add(idx);
      }
    }
    if (vid) {
      // 停止上一个视频
      if (_playingVideo && _playingVideo !== vid) {
        _playingVideo.pause();
        _playingVideo.currentTime = 0;
      }
      const playPromise = vid.play();
      if (playPromise) playPromise.catch(() => {/* 自动播放失败时静默 */});
      _playingVideo = vid;
    }

    if (_reduced) {
      item.style.transition = 'none';
      item.style.opacity = '0.55';
      item.style.transform = `scale(${KB_SCALE})`;
    } else {
      item.style.transition = `opacity ${PREVIEW_FADE}ms ease, transform ${KB_DURATION}s ease-out`;
      // 先重置 scale 再触发
      item.style.transform = 'scale(1.0)';
      // 强制回流
      void item.offsetWidth;
      item.style.opacity    = '0.55';
      item.style.transform  = `scale(${KB_SCALE})`;
    }
  }

  function _deactivatePreview(resetIdx = true) {
    if (!_root) return;
    const items = _root.querySelectorAll('.hh-preview-item');
    items.forEach(item => {
      if (_reduced) {
        item.style.transition = 'none';
        item.style.opacity    = '0';
      } else {
        item.style.transition = `opacity ${PREVIEW_FADE}ms ease`;
        item.style.opacity    = '0';
      }
      // 视频暂停
      const vid = item.querySelector('video');
      if (vid && !vid.paused) { vid.pause(); vid.currentTime = 0; }
    });
    if (_playingVideo) { _playingVideo = null; }
    if (resetIdx) _activePreview = -1;
  }

  // ── 链上直播条 ────────────────────────────────────────────────────────

  function _renderLiveStrip(strip) {
    if (!strip) return;
    strip.innerHTML = '';

    const data = _liveData;
    // null 或 minted===0 且无 tracks 时隐藏
    if (!data || (data.minted === 0 && (!data.tracks || data.tracks.length === 0))) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;

    // 内容容器（允许 marquee）
    const inner = document.createElement('div');
    inner.className = 'hh-strip-inner';

    // 段落构建辅助函数
    const addSeg = (text) => {
      const seg = document.createElement('span');
      seg.className = 'hh-strip-seg';
      seg.textContent = text; // 纯 textContent 防 XSS
      inner.appendChild(seg);
      const dot = document.createElement('span');
      dot.className = 'hh-strip-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '·';
      inner.appendChild(dot);
    };

    // 已铸造数
    if (data.minted > 0) {
      addSeg(t('home.liveMinted', { n: data.minted }));
    }

    // 各赛道最佳
    if (Array.isArray(data.tracks)) {
      data.tracks.forEach(tr => {
        if (!tr) return;
        const lapStr  = formatLap(tr.bestMs);
        const addrStr = shortAddr(tr.holder);
        // textContent 拼接，名称来自外部数据
        addSeg(`${tr.name}  ${lapStr}  ${addrStr}`);
      });
    }

    // 最新事件
    if (data.latest) {
      const l = data.latest;
      const kindKey = l.kind === 'mint'        ? 'home.liveKindMint'
                    : l.kind === 'best'        ? 'home.liveKindBest'
                    : l.kind === 'achievement' ? 'home.liveKindAch'
                    : 'home.liveKindMint';
      const kindText = t(kindKey);
      const relStr   = relativeTime(l.at, Date.now(), t);
      const holderStr = shortAddr(l.holder);
      addSeg(`${t('home.liveLatest')} ${holderStr} ${kindText}${l.trackName ? ' ' + l.trackName : ''}${l.ms ? ' ' + formatLap(l.ms) : ''} ${relStr}`);
    }

    // 去掉末尾多余的分隔点
    if (inner.lastElementChild?.classList.contains('hh-strip-dot')) inner.lastElementChild.remove();
    strip.appendChild(inner);

    // 检测是否需要 marquee（下一帧量宽度）
    if (!_reduced) {
      requestAnimationFrame(() => {
        if (!strip.isConnected) return;
        const overflows = inner.scrollWidth > strip.clientWidth + 4;
        inner.classList.toggle('hh-strip-marquee', overflows);
      });
    }

    // 悬停暂停 marquee
    strip.addEventListener('mouseenter', () => inner.style.animationPlayState = 'paused');
    strip.addEventListener('mouseleave', () => inner.style.animationPlayState = '');
  }

  // ── 字母动画 ──────────────────────────────────────────────────────────

  function _animateTitle() {
    if (!_root) return;
    const letters = _root.querySelectorAll('.hh-letter');
    const sweep   = _root.querySelector('.hh-title-sweep');

    if (_reduced) {
      // 无动画，直接显示
      letters.forEach(l => { l.style.opacity = '1'; l.style.filter = 'none'; });
      if (sweep) sweep.style.display = 'none';
      return;
    }

    // 初始状态：各字母 dim + blur
    letters.forEach(l => {
      l.style.opacity    = '0.08';
      l.style.filter     = 'blur(6px)';
      l.style.transition = 'none';
    });

    // 错排逐字亮起
    const BASE_DELAY = 60; // ms per letter
    letters.forEach((l, i) => {
      setTimeout(() => {
        l.style.transition = 'opacity 320ms ease, filter 320ms ease';
        l.style.opacity    = '1';
        l.style.filter     = 'blur(0) drop-shadow(0 0 8px rgba(255,138,92,.55))';
        // 光晕短暂后消退
        setTimeout(() => {
          l.style.filter = 'blur(0)';
        }, 400);
      }, BASE_DELAY * i);
    });

    // 光扫：在最后一个字母亮起后触发
    const sweepDelay = BASE_DELAY * letters.length + 80;
    if (sweep) {
      setTimeout(() => {
        sweep.style.display = '';
        sweep.classList.add('hh-title-sweep--run');
        sweep.addEventListener('animationend', () => {
          sweep.classList.remove('hh-title-sweep--run');
          sweep.style.display = 'none';
        }, { once: true });
      }, sweepDelay);
    }
  }

  // ── show / hide ───────────────────────────────────────────────────────

  function show() {
    _ensureDOM();

    _root.setAttribute('aria-hidden', 'false');
    _root.inert = false;

    if (_reduced) {
      // 即时显示
      _root.style.transition  = 'none';
      _root.style.visibility  = 'visible';
      _root.style.opacity     = '1';
      _root.querySelector('.hh-eyebrow').style.opacity = '1';
      _root.querySelector('.hh-subtitle').style.opacity = '1';
      // 字母直接全亮
      _animateTitle();
      // 卡片直接可见
      _root.querySelectorAll('.hh-card').forEach(c => {
        c.style.opacity   = '1';
        c.style.transform = 'translateY(0)';
      });
      _visible = true;
      return;
    }

    // 阶段：眉标 → 标题 → 副标题 → 卡片错排
    _root.style.transition = 'none';
    _root.style.visibility = 'visible';
    _root.style.opacity    = '0';

    // 眉标淡入
    const eyebrow  = _root.querySelector('.hh-eyebrow');
    const subtitle = _root.querySelector('.hh-subtitle');
    const cards    = _root.querySelectorAll('.hh-card');

    eyebrow.style.opacity  = '0';
    eyebrow.style.transition = 'none';
    subtitle.style.opacity = '0';
    subtitle.style.transition = 'none';
    cards.forEach(c => {
      c.style.opacity   = '0';
      c.style.transform = 'translateY(24px)';
      c.style.transition = 'none';
    });

    // 根节点淡入（容器透明度立即可见）
    requestAnimationFrame(() => {
      _root.style.transition = 'opacity 400ms ease';
      _root.style.opacity    = '1';

      // 眉标 200ms 后
      setTimeout(() => {
        eyebrow.style.transition = 'opacity 400ms ease';
        eyebrow.style.opacity    = '1';
      }, 200);

      // 标题逐字 400ms 后
      setTimeout(() => {
        _animateTitle();
      }, 400);

      // 副标题在标题末尾后
      const titleDuration = 60 * (_root.querySelectorAll('.hh-letter').length) + 400;
      setTimeout(() => {
        subtitle.style.transition = 'opacity 400ms ease';
        subtitle.style.opacity    = '1';
      }, 400 + titleDuration);

      // 卡片错排（副标题后 80ms 起）
      const cardsStart = 400 + titleDuration + 80;
      cards.forEach((c, i) => {
        setTimeout(() => {
          c.style.transition = 'opacity 400ms ease, transform 400ms ease';
          c.style.opacity    = '1';
          c.style.transform  = 'translateY(0)';
        }, cardsStart + i * 80);
      });
    });

    _visible = true;
  }

  function hide() {
    if (!_root) return;
    _root.setAttribute('aria-hidden', 'true');
    _root.inert = true;
    clearTimeout(_hoverTimer);

    if (_reduced) {
      _root.style.transition = 'none';
      _root.style.opacity    = '0';
      _root.style.visibility = 'hidden';
    } else {
      _root.style.transition = 'opacity 300ms ease';
      _root.style.opacity    = '0';
      setTimeout(() => {
        if (_root && !_visible) {
          _root.style.visibility = 'hidden';
          _root.inert = true;
        }
      }, 300);
    }
    _visible = false;
    _deactivatePreview();
  }

  // ── setLive ───────────────────────────────────────────────────────────

  function setLive(data) {
    _liveData = data;
    if (!_root) return;
    const strip = _root.querySelector('.hh-live-strip');
    if (strip) _renderLiveStrip(strip);
  }

  // ── setLang ───────────────────────────────────────────────────────────

  function setLang() {
    if (!_root) return;
    const focused = document.activeElement;
    _renderText();
    // 原地刷新卡片，保持方向键导航位置与当前焦点。
    _root.querySelectorAll('.hh-card').forEach((card, i) => {
      const mode = modes[i];
      card.setAttribute('aria-label', mode.title + (mode.disabled ? ' — ' + t('home.comingSoon') : ''));
      card.querySelector('.hh-card-title').textContent = mode.title;
      card.querySelector('.hh-card-desc').textContent = mode.desc || '';
      const badge = card.querySelector('.hh-card-badge');
      if (badge) badge.textContent = mode.badge || '';
      const tip = card.querySelector('.hh-card-tooltip');
      if (tip) tip.textContent = mode.badge || t('home.comingSoon');
    });
    const strip = _root.querySelector('.hh-live-strip');
    if (strip) _renderLiveStrip(strip);
    // 保留焦点
    if (focused && _root.contains(focused)) {
      // 焦点已在 _root 内，无需处理
    }
  }

  // ── focusFirst ────────────────────────────────────────────────────────

  function focusFirst() {
    _ensureDOM();
    const first = _root.querySelector('.hh-card:not([aria-disabled="true"])');
    if (first) first.focus({ preventScroll: true });
  }

  // ── resize ────────────────────────────────────────────────────────────
  // （预留；目前 CSS 响应式处理，无需 JS 计算）

  // ── destroy ───────────────────────────────────────────────────────────

  function destroy() {
    if (_destroyed) return;
    _destroyed = true;

    clearTimeout(_hoverTimer);

    if (_mql) {
      _mql.removeEventListener('change', _mqlHandler);
      _mql = null;
    }

    // 停止所有视频
    if (_root) {
      _root.querySelectorAll('video').forEach(v => { v.pause(); v.src = ''; });
      _root.remove();
    }
    _root         = null;
    _playingVideo = null;
    _videoLoaded  = new Set();
  }

  // ── 公开 API ─────────────────────────────────────────────────────────

  return {
    show,
    hide,
    setLive,
    setLang,
    focusFirst,
    destroy,
  };
}
