import { t, onLangChange } from '../i18n/i18n.js';
import { wallet as defaultWallet } from '../chain/wallet.js';
import { shortAddr } from '../chain/records.js';
import { readBestGhost } from './ghost-store.js';
import { decode } from './sim/replay.js';
import { trackHash } from './track/build.js';

// /api/ghost 的列表已在服务端读取链上榜单并过滤已核实且有录像的玩家。
// 选图页共享来源，每图只读一次榜单；录像按地址缓存，失败可重新选择重试。
export function createGhostSource({ fetcher = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const lists = new Map(), replays = new Map();
  async function request(url) {
    const controller = new AbortController(); let timer;
    try {
      return await Promise.race([(async () => {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) throw Object.assign(new Error('影子读取失败'), { status: response.status });
        return response.json();
      })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('影子读取超时')); }, timeoutMs); })]);
    } finally { clearTimeout(timer); }
  }
  return {
    list(trackId) {
      if (!lists.has(trackId)) lists.set(trackId, request(`/api/ghost?trackId=${trackId}`).then(rows => {
        if (!Array.isArray(rows)) throw new Error('影子榜单无效');
        const seen = new Set();
        return rows.filter(row => {
          const address = row.address?.toLowerCase();
          if (!/^0x[0-9a-f]{40}$/.test(address || '') || seen.has(address) || !(Number(row.bestMs) > 0)) return false;
          seen.add(address); return true;
        }).slice(0, 10);
      }));
      return lists.get(trackId);
    },
    replay(def, address) {
      const key = `${def.id}/${address.toLowerCase()}`;
      if (!replays.has(key)) replays.set(key, request(`/api/ghost?trackId=${def.id}&address=${encodeURIComponent(address)}`).then(replay => {
        if (replay.trackId !== def.id || replay.track !== trackHash(def) || replay.laps !== def.laps) throw new Error('影子录像不匹配');
        decode(replay); return replay;
      }).catch(error => { replays.delete(key); throw error; }));
      return replays.get(key);
    },
  };
}

export function mountGhostOptions(container, def, { record = readBestGhost(def), wallet = defaultWallet, storage, fetcher, timeoutMs, requestedAddress = null, source = createGhostSource({ fetcher, timeoutMs }) } = {}) {
  const group = document.createElement('div'), trigger = document.createElement('button'), list = document.createElement('div'), status = document.createElement('p');
  group.className = 'race-ghost-options'; trigger.type = 'button'; trigger.className = 'race-ghost-trigger'; list.className = 'race-ghost-list';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', `ghost-list-${def.id}`);
  list.id = `ghost-list-${def.id}`; list.setAttribute('role', 'listbox'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  group.append(trigger, list, status); container.append(group);
  let selected = record ? 'best' : 'none', selectedReplay = record?.replay ?? null, name = '', mine = record, entries = [], listLoading = true, loading = false, expanded = false, active = 0;
  let error = '', listError = '', skipped = false, dead = false, manual = false, version = 0, pending = Promise.resolve(), account = wallet.state.account;
  const requested = /^0x[0-9a-f]{40}$/i.test(requestedAddress || '') ? requestedAddress.toLowerCase() : null;
  let remembered = null;
  try { remembered = (storage ?? globalThis.localStorage).getItem(`race.ghost.choice.${def.id}`); } catch {}
  const bestLabel = () => t('race.ghost.best') + (mine ? ` · ${mine.bestLap.toFixed(3)} s` : '');
  function choices() {
    return [{ value: 'none', label: t('race.ghost.none') }, { value: 'best', label: bestLabel(), disabled: !mine }, ...entries.map((entry, index) => ({ value: entry.address.toLowerCase(), label: `${index + 1} · ${shortAddr(entry.address)}` + (Number(entry.bestMs) > 0 ? ` · ${(Number(entry.bestMs) / 1000).toFixed(3)} s` : '') }))];
  }
  function paint() {
    if (dead) return;
    const rows = choices(), current = rows.find(row => row.value === selected);
    const message = skipped ? t('race.ghost.skipped') : error || listError ? t(error || listError) : loading ? t('race.ghost.downloading') : listLoading ? t('race.ghost.loading') : !entries.length ? t('race.ghost.empty') : '';
    trigger.textContent = `${t('race.ghost.title')}：${current?.label ?? (selected.startsWith('0x') ? shortAddr(selected) : t('race.ghost.none'))} ▾` + (message ? ` · ${message}` : '');
    trigger.setAttribute('aria-expanded', String(expanded)); trigger.setAttribute('aria-label', trigger.textContent);
    trigger.setAttribute('aria-activedescendant', expanded ? `ghost-${def.id}-${active}` : '');
    list.hidden = !expanded; list.setAttribute('aria-label', t('race.ghost.title')); list.replaceChildren();
    rows.forEach((row, index) => {
      const option = document.createElement('div'); option.id = `ghost-${def.id}-${index}`; option.textContent = row.label;
      option.setAttribute('role', 'option'); option.setAttribute('data-value', row.value); option.setAttribute('aria-selected', String(row.value === selected)); option.setAttribute('aria-disabled', String(!!row.disabled)); option.setAttribute('data-active', String(active === index));
      option.onclick = () => { if (!row.disabled) { expanded = false; trigger.focus({ preventScroll: true }); return select(row.value); } };
      list.append(option);
    });
    status.textContent = message; status.hidden = !expanded || !message;
  }
  function setOpen(value) {
    expanded = value;
    if (value) active = Math.max(0, choices().findIndex(row => row.value === selected));
    paint();
  }
  function persist(value) { try { (storage ?? globalThis.localStorage).setItem(`race.ghost.choice.${def.id}`, value); } catch {} }
  async function apply(value, id) {
    if (dead || id !== version) return false;
    selected = value; selectedReplay = null; name = ''; skipped = false;
    if (value === 'none' || value === 'best' && mine) {
      selectedReplay = value === 'best' ? mine.replay : null; loading = false; paint(); return true;
    }
    const entry = entries.find(row => row.address.toLowerCase() === value);
    if (!entry) return false;
    loading = true; paint();
    try {
      const replay = await source.replay(def, entry.address);
      if (dead || id !== version) return false;
      selectedReplay = replay; name = shortAddr(entry.address); return true;
    } catch { if (!dead && id === version) error = 'race.ghost.failed'; return false; }
    finally { if (!dead && id === version) { loading = false; paint(); } }
  }
  function select(value) {
    const id = ++version; manual = true; remembered = value; persist(value); error = ''; loading = false;
    pending = apply(value, id); return pending;
  }
  // 榜单与我的录像并行读取；切账户、手动改选、卸载都使旧评估失效。
  const leaders = source.list(def.id).then(rows => { if (!dead) { entries = rows; listLoading = false; paint(); } }, () => {
    if (!dead) { listError = 'race.ghost.listFailed'; listLoading = false; paint(); }
  });
  async function readMine(owner, id) {
    if (record || !owner) return record;
    try {
      const replay = await source.replay(def, owner);
      if (!Number.isFinite(replay.bestMs) || replay.bestMs <= 0) throw new Error('我的影子圈速无效');
      const best = { replay, bestLap: replay.bestMs / 1000 };
      if (!dead && owner === wallet.state.account) { mine = best; paint(); }
      return best;
    } catch (err) { if (!dead && id === version && err.status !== 404) { error = 'race.ghost.failed'; paint(); } return null; }
  }
  function evaluate() {
    const id = ++version, owner = wallet.state.account;
    error = ''; skipped = false; mine = record;
    const immediate = !requested && (remembered === 'none' || remembered === 'best' && record);
    if (immediate) manual = true;
    selected = requested || remembered || (record ? 'best' : 'none'); selectedReplay = selected === 'best' && record ? record.replay : null; name = '';
    loading = !!requested || !immediate && (!!remembered || !record && !!owner); paint();
    pending = (async () => {
      const personal = readMine(owner, id);
      const [best] = await Promise.all([personal, leaders]);
      if (dead || id !== version) return;
      mine = best; loading = false;
      if (requested && !manual) {
        loading = true; selected = requested; selectedReplay = null; paint();
        try {
          const replay = await source.replay(def, requested);
          if (dead || id !== version) return;
          if (!entries.some(row => row.address.toLowerCase() === requested)) entries.push({ address: requested, bestMs: replay.bestMs });
          loading = false; selected = requested; selectedReplay = replay; name = shortAddr(requested); manual = true; remembered = requested; persist(requested); paint(); return;
        } catch {
          if (dead || id !== version) return;
          if (!entries.some(row => row.address.toLowerCase() === requested)) entries.push({ address: requested });
          loading = false; selected = requested; selectedReplay = null; name = shortAddr(requested); error = 'race.ghost.failed'; paint(); return;
        }
      }
      if (immediate) { paint(); return; }
      const rememberedValue = remembered?.toLowerCase(), available = choices().find(row => row.value === rememberedValue && !row.disabled);
      if (available && await apply(available.value, id)) { if (!dead && id === version) manual = true; return; }
      if (dead || id !== version) return;
      manual = false; remembered = null;
      if (mine) await apply('best', id);
      else if (entries.length && await apply(entries[0].address.toLowerCase(), id)) return;
      else await apply('none', id);
    })();
    return pending;
  }
  trigger.onclick = () => setOpen(!expanded);
  trigger.onkeydown = event => {
    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab'].includes(event.key)) return;
    event.stopPropagation();
    if (event.key === 'Tab') { setOpen(false); return; }
    event.preventDefault();
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!expanded) { setOpen(true); return; }
    const rows = choices();
    if (event.key === 'Enter' || event.key === ' ') { if (!rows[active].disabled) { setOpen(false); void select(rows[active].value); } return; }
    const direction = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
    if (event.key === 'Home') active = -1;
    if (event.key === 'End') active = rows.length;
    do { active = (active + direction + rows.length) % rows.length; } while (rows[active].disabled);
    paint();
    // 只滚动列表自身，避免窄屏页面跳动。
    const item = list.children[active];
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  };
  function outside(event) { if (expanded && !group.contains(event.target)) setOpen(false); }
  document.addEventListener('pointerdown', outside);
  const unsubscribe = wallet.subscribe(() => {
    const next = wallet.state.account;
    if (next === account) return; account = next;
    if (!manual || selected === 'best') { if (selected === 'best' && manual) remembered = 'best'; void evaluate(); }
    else { mine = record; paint(); void readMine(next, version); }
  }), unlang = onLangChange(paint);
  void evaluate();
  return {
    get requestedReady() { return !!requested && selected === requested && !!selectedReplay; }, get replay() { return selectedReplay; }, get name() { return name; }, get ready() { return pending; }, get loading() { return loading; },
    takeReplay() { if (loading) { skipped = true; paint(); } return selectedReplay; },
    destroy() { dead = true; ++version; unsubscribe(); unlang(); document.removeEventListener('pointerdown', outside); group.remove(); },
  };
}
