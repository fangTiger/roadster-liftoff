/**
 * room-browser.js — 多人房间浏览器 UI 模块
 * 纯 ES 模块，无外部依赖，无构建步骤。
 * CSS 类前缀：rb-
 */

// ── 纯辅助函数（导出供测试使用） ─────────────────────────────────────────────

/**
 * 把房间摘要数组转换为 UI 行模型（纯函数，无副作用）。
 * @param {object[]} rows  summary[] from directory.list()
 * @param {function} t     i18n 函数
 * @returns {object[]}
 */
export function buildRowModels(rows, t) {
  return rows.map(row => {
    const displayName = row.name
      ? row.name
      : t('room.defaultName', { host: row.hostName });
    const trackLabel = t('race.track' + row.trackId);
    const modeLabel = t('room.mode.' + row.mode);
    let statusKey, statusMod;
    if (!row.joinable) {
      if (row.reason === 'FULL') { statusKey = 'room.full'; statusMod = 'full'; }
      else { statusKey = 'room.racing'; statusMod = 'racing'; }
    } else {
      statusKey = 'room.waiting'; statusMod = 'waiting';
    }
    return {
      code: row.code,
      displayName,
      hostName: row.hostName,
      trackLabel,
      modeLabel,
      players: row.players,
      max: row.max ?? 6,
      locked: row.locked,
      joinable: row.joinable,
      statusLabel: t(statusKey),
      statusMod,
    };
  });
}

/**
 * 将 4 位密码输入框的焦点移到下一个（或上一个）。
 * 返回应该接收焦点的框的索引（纯计算，不操作 DOM）。
 * @param {number} currentIndex  当前框索引 0..3
 * @param {'forward'|'back'} direction
 * @returns {number}
 */
export function nextPinFocus(currentIndex, direction) {
  if (direction === 'forward') return Math.min(3, currentIndex + 1);
  return Math.max(0, currentIndex - 1);
}

/**
 * 验证 4 位数字密码字符串是否合法。
 * @param {string} pw
 * @returns {boolean}
 */
export function isValidPin(pw) {
  return /^\d{4}$/.test(pw);
}

// ── 内部工具函数 ──────────────────────────────────────────────────────────────

/** 创建带类名的元素 */
function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** 安全地设置纯文本（防止 XSS，名称/host 名等用户输入必须经过此函数） */
function setText(elem, text) {
  elem.textContent = String(text ?? '');
}

/** 锁图标 SVG（内联，同源，安全） */
function lockIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'rb-lock-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zm-1.5 3a1.5 1.5 0 0 1 3 0v2h-3V4z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/** 刷新图标 SVG */
function refreshIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M13.65 2.35A8 8 0 1 0 15 8h-1.5a6.5 6.5 0 1 1-1.1-3.65l-1.9 1.9H15V1l-1.35 1.35z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/** 构建 4 位 PIN 输入框组 */
function buildPinBoxes(t) {
  const wrap = el('div', 'rb-pin-boxes');
  const inputs = [];
  for (let i = 0; i < 4; i++) {
    const input = el('input', 'rb-pin-box', {
      type: 'text',
      inputmode: 'numeric',
      maxlength: '1',
      autocomplete: 'off',
      'aria-label': t('room.browser.pinDigit', { n: i + 1 }),
    });
    input.dataset.pinIndex = i;
    inputs.push(input);
    wrap.appendChild(input);
  }

  // 读取当前 4 位值
  function getValue() {
    return inputs.map(inp => inp.value).join('');
  }

  // 绑定交互逻辑
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', e => {
      const raw = e.target.value;
      // 只保留数字
      const digit = raw.replace(/\D/g, '').slice(-1);
      inp.value = digit;
      if (digit && idx < 3) inputs[idx + 1].focus();
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
    });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace') {
        if (inp.value === '' && idx > 0) {
          inputs[idx - 1].value = '';
          inputs[idx - 1].focus();
        } else {
          inp.value = '';
        }
        e.preventDefault();
        wrap.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (e.key === 'ArrowLeft' && idx > 0) { inputs[idx - 1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowRight' && idx < 3) { inputs[idx + 1].focus(); e.preventDefault(); }
    });

    inp.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const digits = text.replace(/\D/g, '').slice(0, 4);
      if (!digits) return;
      e.preventDefault();
      for (let j = 0; j < 4; j++) {
        inputs[j].value = digits[j] ?? '';
      }
      inputs[Math.min(digits.length, 3)].focus();
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 点击时全选（方便替换）
    inp.addEventListener('focus', () => inp.select());
  });

  function clear() {
    inputs.forEach(inp => { inp.value = ''; });
  }

  function focus() {
    inputs[0].focus();
  }

  return { wrap, getValue, clear, focus, inputs };
}

/** 构建模态对话框骨架 */
function buildModal(titleText, onClose, t) {
  const backdrop = el('div', 'rb-modal-backdrop');
  backdrop.setAttribute('role', 'presentation');

  const dialog = el('div', 'rb-modal');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'rb-modal-title-' + Math.random().toString(36).slice(2));

  const header = el('div', 'rb-modal__header');
  const title = el('h2', 'rb-modal__title');
  title.id = dialog.getAttribute('aria-labelledby');
  setText(title, titleText);
  const closeBtn = el('button', 'rb-modal__close');
  setText(closeBtn, '×');
  closeBtn.setAttribute('aria-label', t('room.browser.close'));
  header.appendChild(title);
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const body = el('div', 'rb-modal__body');
  dialog.appendChild(body);

  backdrop.appendChild(dialog);

  // 点击背景关闭
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) onClose();
  });
  closeBtn.addEventListener('click', onClose);

  // Escape 关闭
  function handleKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }
  backdrop.addEventListener('keydown', handleKey);

  // 焦点陷阱
  function getFocusable() {
    return Array.from(dialog.querySelectorAll(
      'button:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])'
    ));
  }
  backdrop.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { last.focus(); e.preventDefault(); }
    } else {
      if (document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  return { backdrop, dialog, body };
}

// ── 主工厂 ────────────────────────────────────────────────────────────────────

/**
 * 创建房间浏览器 UI。
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {function} opts.t          i18n 函数
 * @param {function} opts.onJoin     ({ code, password }) => Promise<{ok,code?}>
 * @param {function} opts.onCreate   ({ name, locked, password }) => Promise<{ok,code?}>
 * @param {function} opts.onRefresh  () => void
 */
export function createRoomBrowser({ container, t, onJoin, onCreate, onRefresh }) {
  // ── 根元素 ──────────────────────────────────────────────────────────────────
  const root = el('div', 'rb-root');
  container.appendChild(root);

  // ── 当前数据状态 ─────────────────────────────────────────────────────────────
  let _rows = [];           // buildRowModels 的结果
  let _status = 'connecting'; // 'connecting'|'online'|'offline'
  let _onlineCount = 0;
  let _modalBackdrop = null;

  // ── 顶部 Header ─────────────────────────────────────────────────────────────
  const header = el('div', 'rb-header');
  const headerLeft = el('div', 'rb-header__left');
  const titleEl = el('h1', 'rb-header__title');
  setText(titleEl, t('room.browser.title'));
  const countEl = el('p', 'rb-header__count');
  headerLeft.appendChild(titleEl);
  headerLeft.appendChild(countEl);

  const headerRight = el('div', 'rb-header__actions');
  const refreshBtn = el('button', 'rb-btn rb-btn--icon');
  refreshBtn.setAttribute('aria-label', t('room.browser.refresh'));
  refreshBtn.appendChild(refreshIconSvg());
  const createBtn = el('button', 'rb-btn rb-btn--primary');
  setText(createBtn, t('room.browser.create'));
  headerRight.appendChild(refreshBtn);
  headerRight.appendChild(createBtn);

  header.appendChild(headerLeft);
  header.appendChild(headerRight);
  root.appendChild(header);

  // ── 状态条 ──────────────────────────────────────────────────────────────────
  const statusBar = el('div', 'rb-status-bar');
  root.appendChild(statusBar);

  // ── 列表区 ──────────────────────────────────────────────────────────────────
  const listWrap = el('div', 'rb-list-wrap');
  const listEl = el('ul', 'rb-list');
  listEl.setAttribute('role', 'list');
  listWrap.appendChild(listEl);
  root.appendChild(listWrap);

  // ── 内部渲染函数 ─────────────────────────────────────────────────────────────

  function _renderCount() {
    const n = _rows.length;
    const m = _onlineCount;
    setText(countEl, t('room.browser.count', { n, m }));
  }

  function _renderStatusBar() {
    statusBar.className = 'rb-status-bar rb-status-bar--' + _status;
    if (_status === 'connecting') {
      setText(statusBar, t('room.browser.connecting'));
      statusBar.hidden = false;
    } else if (_status === 'offline') {
      statusBar.hidden = false;
      statusBar.textContent = '';
      const msg = el('span');
      setText(msg, t('room.browser.offline'));
      const retryBtn = el('button', 'rb-btn rb-btn--sm');
      setText(retryBtn, t('room.browser.retry'));
      retryBtn.addEventListener('click', onRefresh);
      statusBar.appendChild(msg);
      statusBar.appendChild(retryBtn);
    } else {
      statusBar.hidden = true;
    }
  }

  /** 构建席位点阵 */
  function _buildSeatDots(players, max) {
    const wrap = el('span', 'rb-seats');
    for (let i = 0; i < max; i++) {
      const dot = el('span', 'rb-seat-dot' + (i < players ? ' rb-seat-dot--filled' : ''));
      wrap.appendChild(dot);
    }
    return wrap;
  }

  /** 根据 row model 创建或更新一个 <li> 节点 */
  function _buildRow(model) {
    const li = el('li', 'rb-row' + (model.joinable ? '' : ' rb-row--dim'));
    li.dataset.code = model.code;
    li.dataset.model = JSON.stringify(model);

    const info = el('div', 'rb-row__info');

    const nameRow = el('div', 'rb-row__name-row');
    const nameEl = el('span', 'rb-row__name');
    setText(nameEl, model.displayName);
    nameRow.appendChild(nameEl);
    if (model.locked) nameRow.appendChild(lockIconSvg());
    info.appendChild(nameRow);

    const meta = el('div', 'rb-row__meta');
    const hostEl = el('span', 'rb-row__host');
    setText(hostEl, model.hostName);
    const trackEl = el('span', 'rb-row__track');
    setText(trackEl, model.trackLabel + ' · ' + model.modeLabel);
    meta.appendChild(hostEl);
    meta.appendChild(trackEl);
    info.appendChild(meta);

    const right = el('div', 'rb-row__right');

    const playersWrap = el('div', 'rb-row__players');
    const playersCount = el('span', 'rb-row__player-count');
    setText(playersCount, model.players + '/' + model.max);
    playersWrap.appendChild(playersCount);
    playersWrap.appendChild(_buildSeatDots(model.players, model.max));
    right.appendChild(playersWrap);

    const statusChip = el('span', 'rb-chip rb-chip--' + model.statusMod);
    setText(statusChip, model.statusLabel);
    right.appendChild(statusChip);

    const joinBtn = el('button', 'rb-btn rb-btn--join');
    setText(joinBtn, t('room.browser.join'));
    joinBtn.disabled = !model.joinable;
    if (!model.joinable) joinBtn.setAttribute('aria-disabled', 'true');
    right.appendChild(joinBtn);

    li.appendChild(info);
    li.appendChild(right);

    // 加入点击
    joinBtn.addEventListener('click', () => {
      if (model.locked) {
        _openJoinModal(model.code);
      } else {
        _doJoin(model.code, null, null);
      }
    });

    // 行本身也可 Enter 触发（键盘友好）
    li.setAttribute('tabindex', '0');
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' && model.joinable && e.target === li) joinBtn.click();
    });

    return li;
  }

  /** 差量更新列表（保持滚动位置和焦点） */
  function _renderList() {
    if (_rows.length === 0 && _status !== 'offline') {
      _renderEmptyState();
      return;
    }

    // 保留未变化的行与焦点，只清除空状态。
    const existing = new Map();
    for (const child of [...listEl.children]) {
      if (child.dataset.code) existing.set(child.dataset.code, child);
      else child.remove();
    }

    const newCodes = new Set(_rows.map(r => r.code));

    // 删除不再存在的行
    for (const [code, node] of existing) {
      if (!newCodes.has(code)) node.remove();
    }

    // 插入/更新行（保持顺序）
    _rows.forEach((model, idx) => {
      const existingNode = existing.get(model.code);
      if (existingNode) {
        if (existingNode.dataset.model !== JSON.stringify(model)) {
          const replacement = _buildRow(model);
          const focused = existingNode.contains(document.activeElement);
          const joinFocused = existingNode.querySelector('.rb-btn--join') === document.activeElement;
          existingNode.replaceWith(replacement);
          if (focused) (joinFocused ? replacement.querySelector('.rb-btn--join') : replacement).focus();
          existing.set(model.code, replacement);
        }
        const current = existing.get(model.code);
        if (listEl.children[idx] !== current) listEl.insertBefore(current, listEl.children[idx] || null);
      } else {
        const newRow = _buildRow(model);
        newRow.classList.add('rb-row--new');
        // 删除新入动画类（prefers-reduced-motion 由 CSS 处理）
        setTimeout(() => newRow.classList.remove('rb-row--new'), 600);
        listEl.insertBefore(newRow, listEl.children[idx] || null);
      }
    });
  }

  function _renderEmptyState() {
    listEl.textContent = '';
    const empty = el('li', 'rb-empty-state');
    empty.setAttribute('role', 'listitem');
    const msg = el('p', 'rb-empty-state__msg');
    setText(msg, t('room.browser.empty'));
    const bigBtn = el('button', 'rb-btn rb-btn--primary rb-btn--lg');
    setText(bigBtn, t('room.browser.create'));
    bigBtn.addEventListener('click', _openCreateModal);
    empty.appendChild(msg);
    empty.appendChild(bigBtn);
    listEl.appendChild(empty);
  }

  // ── 模态：加入加锁房间 ────────────────────────────────────────────────────

  function _openJoinModal(code) {
    _closeModal();

    const { backdrop, body } = buildModal(t('room.browser.enterPassword'), _closeModal, t);

    const pin = buildPinBoxes(t);
    body.appendChild(pin.wrap);

    const errorEl = el('p', 'rb-modal__error');
    errorEl.hidden = true;
    body.appendChild(errorEl);

    const actions = el('div', 'rb-modal__actions');
    const confirmBtn = el('button', 'rb-btn rb-btn--primary');
    setText(confirmBtn, t('room.browser.confirm'));
    confirmBtn.disabled = true;
    const cancelBtn = el('button', 'rb-btn');
    setText(cancelBtn, t('room.browser.cancel'));
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    body.appendChild(actions);

    pin.wrap.addEventListener('change', () => {
      confirmBtn.disabled = !isValidPin(pin.getValue());
    });

    cancelBtn.addEventListener('click', _closeModal);

    confirmBtn.addEventListener('click', async () => {
      const pw = pin.getValue();
      if (!isValidPin(pw)) return;
      confirmBtn.disabled = true;
      errorEl.hidden = true;
      await _doJoin(code, pw, { confirmBtn, errorEl, pin });
    });

    // Enter 提交
    backdrop.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click();
    });

    document.body.appendChild(backdrop);
    _modalBackdrop = backdrop;
    pin.focus();
  }

  async function _doJoin(code, password, modalCtx) {
    const result = await onJoin({ code, password: password || undefined });
    if (result.ok) {
      _closeModal();
      return;
    }
    // 错误处理
    if (!modalCtx) {
      // 无密码房间加入失败：重新渲染即可
      return;
    }
    const { confirmBtn, errorEl, pin } = modalCtx;
    confirmBtn.disabled = false;

    let errMsg;
    if (result.code === 'BAD_PASSWORD') errMsg = t('room.browser.badPassword');
    else if (result.code === 'LOCKED_OUT') errMsg = t('room.browser.lockedOut');
    else if (result.code === 'PASSWORD_REQUIRED') errMsg = t('room.browser.passwordRequired');
    else if (result.code === 'FULL') errMsg = t('room.browser.roomFull');
    else if (result.code === 'RACING') errMsg = t('room.browser.roomRacing');
    else errMsg = t('room.browser.joinFailed');

    setText(errorEl, errMsg);
    errorEl.hidden = false;
    pin.clear();
    pin.focus();
  }

  // ── 模态：建房 ───────────────────────────────────────────────────────────────

  function _openCreateModal() {
    _closeModal();

    const { backdrop, body } = buildModal(t('room.browser.createTitle'), _closeModal, t);

    // 房间名称
    const nameLabel = el('label', 'rb-form-label');
    setText(nameLabel, t('room.browser.roomNameLabel'));
    const nameInput = el('input', 'rb-form-input', {
      type: 'text',
      maxlength: '20',
      autocomplete: 'off',
    });
    nameInput.setAttribute('aria-label', t('room.browser.roomNameLabel'));
    nameLabel.appendChild(nameInput);
    body.appendChild(nameLabel);

    // 公开 / 加锁 切换
    const segWrap = el('div', 'rb-segment');
    const openBtn = el('button', 'rb-segment__btn rb-segment__btn--active');
    setText(openBtn, t('room.browser.public'));
    openBtn.setAttribute('aria-pressed', 'true');
    const lockBtn = el('button', 'rb-segment__btn');
    setText(lockBtn, t('room.browser.locked'));
    lockBtn.setAttribute('aria-pressed', 'false');
    segWrap.appendChild(openBtn);
    segWrap.appendChild(lockBtn);
    body.appendChild(segWrap);

    // 密码输入区（默认隐藏）
    const pwSection = el('div', 'rb-pw-section');
    pwSection.hidden = true;
    const pwLabel = el('p', 'rb-form-hint');
    setText(pwLabel, t('room.browser.setPassword'));
    const pin = buildPinBoxes(t);
    pwSection.appendChild(pwLabel);
    pwSection.appendChild(pin.wrap);
    body.appendChild(pwSection);

    const errorEl = el('p', 'rb-modal__error');
    errorEl.hidden = true;
    body.appendChild(errorEl);

    // 建房按钮
    const actions = el('div', 'rb-modal__actions');
    const confirmBtn = el('button', 'rb-btn rb-btn--primary');
    setText(confirmBtn, t('room.browser.createConfirm'));
    const cancelBtn = el('button', 'rb-btn');
    setText(cancelBtn, t('room.browser.cancel'));
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    body.appendChild(actions);

    let isLocked = false;

    function updateValidity() {
      const nameOk = nameInput.value.trim().length > 0 || true; // 名称可空（后端填默认）
      const pwOk = !isLocked || isValidPin(pin.getValue());
      confirmBtn.disabled = !pwOk;
    }

    openBtn.addEventListener('click', () => {
      isLocked = false;
      openBtn.classList.add('rb-segment__btn--active');
      lockBtn.classList.remove('rb-segment__btn--active');
      openBtn.setAttribute('aria-pressed', 'true');
      lockBtn.setAttribute('aria-pressed', 'false');
      pwSection.hidden = true;
      pin.clear();
      updateValidity();
    });

    lockBtn.addEventListener('click', () => {
      isLocked = true;
      lockBtn.classList.add('rb-segment__btn--active');
      openBtn.classList.remove('rb-segment__btn--active');
      lockBtn.setAttribute('aria-pressed', 'true');
      openBtn.setAttribute('aria-pressed', 'false');
      pwSection.hidden = false;
      pin.focus();
      updateValidity();
    });

    nameInput.addEventListener('input', updateValidity);
    pin.wrap.addEventListener('change', updateValidity);
    cancelBtn.addEventListener('click', _closeModal);

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      errorEl.hidden = true;
      const name = nameInput.value.trim();
      const password = isLocked ? pin.getValue() : undefined;
      const result = await onCreate({ name, locked: isLocked, password });
      if (result.ok) {
        _closeModal();
        return;
      }
      confirmBtn.disabled = false;
      let errMsg;
      if (result.code === 'BAD_PASSWORD') errMsg = t('room.browser.badPassword');
      else if (result.code === 'BAD_LOCKED') errMsg = t('room.browser.badParams');
      else errMsg = t('room.browser.createFailed');
      setText(errorEl, errMsg);
      errorEl.hidden = false;
    });

    updateValidity();
    document.body.appendChild(backdrop);
    _modalBackdrop = backdrop;
    nameInput.focus();
  }

  function _closeModal() {
    if (_modalBackdrop) {
      _modalBackdrop.remove();
      _modalBackdrop = null;
    }
  }

  // ── 按钮事件 ─────────────────────────────────────────────────────────────────

  refreshBtn.addEventListener('click', onRefresh);
  createBtn.addEventListener('click', _openCreateModal);

  // ── 公共 API ─────────────────────────────────────────────────────────────────

  /**
   * 用新的房间摘要数组更新列表。
   * @param {{ rows: object[], online?: number }} data
   */
  function update({ rows = [], online = 0 } = {}) {
    _rows = buildRowModels(rows, t);
    _onlineCount = online;
    _renderCount();
    _renderList();
  }

  /**
   * 设置连接状态。
   * @param {'connecting'|'online'|'offline'} status
   */
  function setStatus(status) {
    _status = status;
    _renderStatusBar();
    if (status === 'online') _renderCount();
  }

  /** 展示房间浏览器（若使用了 hidden 控制） */
  function open() {
    root.hidden = false;
    root.removeAttribute('hidden');
  }

  /** 隐藏房间浏览器 */
  function close() {
    root.hidden = true;
    _closeModal();
  }

  /** 销毁并清理 DOM */
  function destroy() {
    _closeModal();
    root.remove();
  }

  // 初始渲染
  _renderStatusBar();
  _renderCount();
  _renderList();

  function refreshLabels() {
    _closeModal();
    setText(titleEl, t('room.browser.title'));
    setText(createBtn, t('room.browser.create'));
    refreshBtn.setAttribute('aria-label', t('room.browser.refresh'));
    _renderStatusBar();
  }
  return { update, setStatus, open, close, destroy, refreshLabels, promptPassword: _openJoinModal };
}
