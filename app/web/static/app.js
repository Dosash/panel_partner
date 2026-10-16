/*
 * Партнёрки — панель партнёрских программ. Vanilla JS SPA без сборки, hash-роутинг.
 *
 *   1. Helpers            6. Data (programs cache, meta)
 *   2. Icons              7. Router
 *   3. API                8. Pages: overview, programs, program, form, settings
 *   4. UI primitives      9. Boot
 *   5. Shell
 *
 * Все URL относительные и опираются на <base href="<prefix>/"> из index.html.
 */
(function () {
  'use strict';

  // ======================================================================= 1. Helpers

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fmtNum = (v) => new Intl.NumberFormat('ru-RU').format(num(v));

  function fmtDate(ts, withTime = false) {
    if (!ts) return '';
    const d = new Date(num(ts) * 1000);
    const opts = withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleString('ru-RU', opts).replace(' г.', '');
  }

  function fmtRelative(ts) {
    if (!ts) return '';
    const diff = Math.round(Date.now() / 1000 - num(ts));
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`;
    return fmtDate(ts);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ }
  }

  function metaContent(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') || '' : '';
  }

  function hostOf(url) {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall back below */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  const STATUS_LABELS = { active: 'Активна', paused: 'На паузе', archived: 'В архиве' };
  const STATUS_TONES = { active: 'success', paused: 'warning', archived: 'neutral' };
  const STATUS_ORDER = ['active', 'paused', 'archived'];

  // ======================================================================= 2. Icons

  const ICON_PATHS = {
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.54l.5.33a1 1 0 0 0 1.33-.15L21 7"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    edit: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.38 2.62a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4Z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M10.3 4.2 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M4 5v14a2 2 0 0 0 2 2h14V7"/><path d="M16 13h4v4h-4a2 2 0 0 1 0-4z"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0-1-1v-3"/>',
    download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
    grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play: '<path d="M8 5.6v12.8a.6.6 0 0 0 .92.5l10.1-6.4a.6.6 0 0 0 0-1L8.92 5.1A.6.6 0 0 0 8 5.6z"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkles: '<path d="M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17-5-5 5-5"/><path d="M5 12h11"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8"/><path d="m16 7 3 3"/><path d="m18.5 4.5 2 2"/>',
    shield: '<path d="M12 3 4 6v6c0 4.4 3.4 8.1 8 9 4.6-.9 8-4.6 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  };

  function icon(name, cls = '') {
    return `<svg class="i${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`;
  }

  // ======================================================================= 3. API

  class ApiError extends Error {
    constructor(message, status, field) {
      super(message);
      this.status = status;
      this.field = field || '';
    }
  }

  // Set by the shell: called when the API answers 401 (the password is enabled and the session is gone).
  let onAuthRequired = null;

  async function request(method, path, body) {
    // X-Requested-With is the CSRF check of the API (every non-GET request needs it).
    const init = { method, headers: { Accept: 'application/json', 'X-Requested-With': 'fetch' }, cache: 'no-store', credentials: 'same-origin' };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch {
      throw new ApiError('Нет связи с сервером панели', 0);
    }
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!res.ok) {
      const message = (data && data.error) || `Ошибка ${res.status}`;
      if (res.status === 401 && data && data.auth_required && onAuthRequired) {
        onAuthRequired();
        const err = new ApiError(message, 401);
        err.silent = true;
        throw err;
      }
      throw new ApiError(message, res.status, data && data.field);
    }
    return data;
  }

  const api = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };

  // ======================================================================= 4. UI primitives

  function toast(message, type = 'info', timeout) {
    const box = $('#toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const iconName = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info';
    el.innerHTML = `${icon(iconName, 'toast-icon')}<span class="toast-text"></span><button type="button" class="toast-close" aria-label="Закрыть уведомление">${icon('x')}</button>`;
    $('.toast-text', el).textContent = String(message || '');
    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 220);
    };
    $('.toast-close', el).addEventListener('click', close);
    setTimeout(close, timeout ?? (type === 'error' ? 6500 : 3500));
  }

  function handleError(err) {
    if (!err || err.silent) return;
    if (!(err instanceof ApiError)) console.error(err);
    toast((err && err.message) || 'Что-то пошло не так', 'error');
  }

  let modalSeq = 0;

  /** Opens a modal <dialog>; resolves with the value of the clicked action or null when dismissed. */
  function openModal({ title, body = '', actions = [], wide = false, onSubmit = null }) {
    return new Promise((resolve) => {
      const titleId = `modal-title-${++modalSeq}`;
      const dlg = document.createElement('dialog');
      dlg.className = `modal${wide ? ' modal-wide' : ''}`;
      dlg.setAttribute('aria-labelledby', titleId);
      const foot = actions.map((a) => `<button type="button" class="btn btn-${a.kind || 'secondary'}" data-modal-value="${esc(a.value)}"${a.submit ? ' data-submit="1"' : ''}${a.autofocus ? ' autofocus' : ''}>${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`).join('');
      dlg.innerHTML = `<div class="modal-box">
        <div class="modal-head"><h2 id="${titleId}">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-modal-close aria-label="Закрыть">${icon('x')}</button></div>
        <div class="modal-body"></div>
        <p class="modal-error" role="alert" hidden></p>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>`;
      const bodyEl = $('.modal-body', dlg);
      if (body instanceof Node) bodyEl.appendChild(body);
      else bodyEl.innerHTML = body;
      const errEl = $('.modal-error', dlg);
      const opener = document.activeElement;
      let result = null;
      let downOnBackdrop = false;
      let working = false;
      const close = () => { if (!working) dlg.close(); };
      dlg.addEventListener('cancel', (e) => { if (working) e.preventDefault(); });
      dlg.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === dlg; });
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) {
          if (downOnBackdrop) close();
          return;
        }
        if (e.target.closest('[data-modal-close]')) { close(); return; }
        const btn = e.target.closest('[data-modal-value]');
        if (!btn || working) return;
        const value = btn.dataset.modalValue;
        if (!onSubmit || btn.dataset.submit !== '1') {
          result = value;
          dlg.close();
          return;
        }
        working = true;
        errEl.hidden = true;
        $$('.modal-foot .btn', dlg).forEach((b) => { b.disabled = true; });
        btn.classList.add('is-busy');
        Promise.resolve()
          .then(() => onSubmit(value, dlg))
          .then((res) => {
            working = false;
            if (res === false) return;
            result = res === undefined ? value : res;
            dlg.close();
          })
          .catch((err) => {
            working = false;
            if (!(err instanceof ApiError)) console.error(err);
            errEl.textContent = (err && err.message) || 'Что-то пошло не так';
            errEl.hidden = false;
          })
          .finally(() => {
            if (!dlg.open) return;
            btn.classList.remove('is-busy');
            $$('.modal-foot .btn', dlg).forEach((b) => { b.disabled = false; });
          });
      });
      dlg.addEventListener('close', () => {
        dlg.remove();
        if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
        resolve(result);
      });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  }

  async function confirmModal({ title, message = '', html = '', confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger = false, confirmIcon = '' }) {
    const body = `${message ? `<p>${esc(message)}</p>` : ''}${html}`;
    const value = await openModal({
      title,
      body,
      actions: [
        { label: cancelLabel, value: 'cancel', kind: 'secondary', autofocus: danger },
        { label: confirmLabel, value: 'ok', kind: danger ? 'danger' : 'primary', autofocus: !danger, icon: confirmIcon },
      ],
    });
    return value === 'ok';
  }

  async function busy(btn, fn) {
    if (btn && btn.disabled) return undefined;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-busy');
      btn.setAttribute('aria-busy', 'true');
    }
    try {
      return await fn();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
      }
    }
  }

  /** Delegated click handling for `[data-action]` inside `root` (and the topbar actions slot). */
  function onAction(root, handlers) {
    const hosts = [root];
    if (root === state.pageRoot && state.pageActions) hosts.push(state.pageActions);
    hosts.forEach((host) => host.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !host.contains(el)) return;
      const handler = handlers[el.dataset.action];
      if (!handler) return;
      e.preventDefault();
      if (el.disabled) return;
      Promise.resolve().then(() => handler(el, e)).catch(handleError);
    }));
  }

  function skeletonCards(n = 3) {
    return `<div class="loading" aria-busy="true" aria-label="Загрузка">${Array.from({ length: n }, (_, i) => `<div class="card sk-card"><div class="skeleton" style="width:40%;--d:${i * 0.1}s"></div><div class="skeleton" style="width:85%;--d:${i * 0.1 + 0.05}s"></div><div class="skeleton" style="width:60%;--d:${i * 0.1 + 0.1}s"></div></div>`).join('')}</div>`;
  }

  function emptyState({ icon: name = 'handshake', title, text = '', actions = '' }) {
    return `<div class="empty"><div class="empty-icon">${icon(name)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actions ? `<div class="empty-actions">${actions}</div>` : ''}</div>`;
  }

  // ======================================================================= 5. Shell

  const state = {
    pageRoot: null,
    pageActions: null,
    programs: null,     // cached list from GET api/programs
    meta: null,
    dirty: false,       // the edit form has unsaved changes
    route: '',
    listFilters: { q: '', category: '', status: '', fav: false },
    listView: storageGet('partners.view') === 'table' ? 'table' : 'cards',
    auth: { enabled: false, authenticated: true },
    loginShown: false,
  };

  function pageHead(title, sub = '', actionsHtml = '') {
    document.title = `${title} — Партнёрки`;
    const h1 = $('#page-title');
    h1.textContent = title;
    const subEl = $('#page-sub');
    subEl.textContent = sub;
    subEl.hidden = !sub;
    const slot = $('#page-actions');
    const fresh = slot.cloneNode(false);
    fresh.innerHTML = actionsHtml;
    slot.replaceWith(fresh);
    state.pageActions = fresh;
  }

  function setNav(name) {
    $$('.nav-item').forEach((a) => {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function setVersion(v) {
    const el = $('#app-version');
    const version = v || metaContent('panel-version');
    if (el) el.textContent = version ? `v${version}` : '';
  }

  function updateNavCount(n) {
    const el = $('#nav-count');
    if (!el) return;
    el.textContent = fmtNum(n);
    el.hidden = !(n > 0);
  }

  // ---- theme: localStorage "panel-theme" = light | dark | system, shared by all panels

  const THEME_KEY = 'panel-theme';
  const THEMES = ['system', 'light', 'dark'];
  const THEME_LABELS = { system: 'Как в системе', light: 'Светлая', dark: 'Тёмная' };
  const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };
  let currentTheme = 'system';

  function readTheme() {
    const t = storageGet(THEME_KEY);
    return THEMES.includes(t) ? t : 'system';
  }
  function applyTheme(value) {
    const rootEl = document.documentElement;
    if (value === 'light' || value === 'dark') rootEl.dataset.theme = value;
    else delete rootEl.dataset.theme;
  }
  function setTheme(value) {
    currentTheme = THEMES.includes(value) ? value : 'system';
    storageSet(THEME_KEY, currentTheme);
    applyTheme(currentTheme);
    paintThemeControls();
  }
  function paintThemeControls() {
    const btn = $('#theme-toggle');
    if (btn) {
      btn.innerHTML = icon(THEME_ICONS[currentTheme]);
      const label = `Тема: ${THEME_LABELS[currentTheme].toLowerCase()}. Нажмите, чтобы сменить`;
      btn.title = label;
      btn.setAttribute('aria-label', label);
    }
    $$('[data-action="theme"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === currentTheme)));
  }

  // ---- off-canvas sidebar below 960 px

  const drawerQuery = window.matchMedia('(max-width: 959.98px)');
  function openDrawer() {
    if (!drawerQuery.matches) return;
    document.body.classList.add('nav-open');
    $('#backdrop').hidden = false;
    $('#burger').setAttribute('aria-expanded', 'true');
    const first = $('#sidebar a:not([hidden])');
    if (first) first.focus();
  }
  function closeDrawer({ focusBurger = false } = {}) {
    if (!document.body.classList.contains('nav-open')) return;
    document.body.classList.remove('nav-open');
    $('#backdrop').hidden = true;
    $('#burger').setAttribute('aria-expanded', 'false');
    if (focusBurger) $('#burger').focus();
  }

  // ---- status pill (GET api/health)

  let healthTip = '';
  async function refreshHealth() {
    let data = null;
    try {
      const res = await fetch('api/health', { cache: 'no-store', headers: { Accept: 'application/json' } });
      data = await res.json().catch(() => null);
      if (!res.ok && !(data && data.status === 'error')) data = null;
    } catch {
      data = null;
    }
    renderHealth(data);
  }
  function renderHealth(d) {
    const pill = $('#status-pill');
    if (!pill) return;
    let tone;
    let label;
    const lines = [];
    if (d && d.status === 'ok') {
      tone = 'success';
      label = 'Работает';
      if (d.programs !== undefined) {
        lines.push(`Программ: ${fmtNum(d.programs)}, ссылок: ${fmtNum(d.links)}`);
        updateNavCount(num(d.programs));
      } else {
        lines.push(d.auth ? 'Доступ по паролю включён' : 'Панель работает');
      }
    } else if (d && d.status === 'error') {
      tone = 'danger';
      label = 'Ошибка';
      lines.push(...((d.problems || []).filter((x) => typeof x === 'string')));
    } else {
      tone = 'danger';
      label = 'Нет связи';
      lines.push('Нет ответа от сервера панели');
    }
    if (d && d.version) setVersion(d.version);
    healthTip = lines.join('\n');
    pill.className = `status-pill badge b-${tone}`;
    pill.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="status-label">${esc(label)}</span>`;
    pill.title = healthTip;
    pill.setAttribute('aria-label', `Состояние панели: ${label}. ${lines.join('. ')}`);
  }

  function initShell() {
    const hub = metaContent('panel-hub');
    const link = $('#hub-link');
    if (link && hub && /^(\/|\.{1,2}\/|https?:\/\/)/i.test(hub)) {
      link.href = hub;
      link.hidden = false;
    }
    setVersion('');
    currentTheme = readTheme();
    applyTheme(currentTheme);
    paintThemeControls();
    $('#theme-toggle').addEventListener('click', () => {
      setTheme(THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length]);
    });
    window.addEventListener('storage', (e) => {
      if (e.key !== THEME_KEY) return;
      currentTheme = readTheme();
      applyTheme(currentTheme);
      paintThemeControls();
    });
    $('#burger').addEventListener('click', () => {
      if (document.body.classList.contains('nav-open')) closeDrawer();
      else openDrawer();
    });
    $('#backdrop').addEventListener('click', () => closeDrawer({ focusBurger: true }));
    $('#sidebar').addEventListener('click', (e) => {
      if (e.target.closest('a[href]')) closeDrawer();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open') && !document.querySelector('dialog[open]')) {
        closeDrawer({ focusBurger: true });
      }
    });
    const onQuery = () => { if (!drawerQuery.matches) closeDrawer(); };
    if (drawerQuery.addEventListener) drawerQuery.addEventListener('change', onQuery);
    else drawerQuery.addListener(onQuery);
    $('#logout-btn').addEventListener('click', () => logoutHere().catch(handleError));
    $('#login-form').addEventListener('submit', (e) => onLoginSubmit(e).catch(handleError));
    onAuthRequired = showLogin;
    $('#status-pill').addEventListener('click', async () => {
      await refreshHealth();
      if (healthTip) toast(healthTip.split('\n').join(' · '), $('#status-pill').classList.contains('b-success') ? 'info' : 'error');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshHealth();
    });
    refreshHealth();
  }

  // ---- password: login screen, sidebar «Выйти»

  async function refreshAuth() {
    try {
      const st = await api.get('api/auth/status');
      state.auth = { enabled: Boolean(st.enabled), authenticated: Boolean(st.authenticated) };
    } catch {
      state.auth = { enabled: false, authenticated: true };
    }
    paintAuthControls();
    return state.auth;
  }

  function paintAuthControls() {
    const btn = $('#logout-btn');
    if (btn) btn.hidden = !state.auth.enabled;
  }

  function showLogin() {
    state.auth.authenticated = false;
    state.dirty = false;
    const box = $('#login');
    if (!box || state.loginShown) return;
    state.loginShown = true;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    closeDrawer();
    box.hidden = false;
    $('#app').setAttribute('aria-hidden', 'true');
    $('#login-error').textContent = '';
    const input = $('#login-password');
    input.value = '';
    setTimeout(() => input.focus(), 30);
  }

  function hideLogin() {
    const box = $('#login');
    if (!box) return;
    state.loginShown = false;
    box.hidden = true;
    $('#app').removeAttribute('aria-hidden');
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const input = $('#login-password');
    const errEl = $('#login-error');
    errEl.textContent = '';
    const password = input.value;
    if (!password) {
      errEl.textContent = 'Введите пароль';
      input.focus();
      return;
    }
    await busy($('#login-submit'), async () => {
      try {
        await api.post('api/auth/login', { password });
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 429 || err.status === 400)) {
          errEl.textContent = err.message;
          input.select();
          return;
        }
        throw err;
      }
      state.auth = { enabled: true, authenticated: true };
      paintAuthControls();
      hideLogin();
      invalidate();
      toast('Вы вошли в панель', 'success', 2000);
      refreshHealth();
      render(); // the route the user was heading to
    });
  }

  async function logoutHere() {
    try {
      await api.post('api/auth/logout');
    } catch (err) {
      if (!(err && err.silent)) throw err;
    }
    invalidate();
    toast('Вы вышли', 'info', 2000);
    showLogin();
  }

  // ======================================================================= 6. Data

  async function loadPrograms(force = false) {
    if (state.programs && !force) return state.programs;
    const data = await api.get('api/programs');
    state.programs = Array.isArray(data && data.programs) ? data.programs : [];
    updateNavCount(state.programs.length);
    return state.programs;
  }

  async function loadMeta(force = false) {
    if (state.meta && !force) return state.meta;
    state.meta = await api.get('api/meta');
    if (state.meta && state.meta.version) setVersion(state.meta.version);
    return state.meta;
  }

  function invalidate() {
    state.programs = null;
    state.meta = null;
  }

  function findProgram(id) {
    return (state.programs || []).find((p) => p.id === id) || null;
  }

  async function toggleFavorite(program, btn) {
    const next = !program.favorite;
    const updated = await busy(btn, () => api.patch(`api/programs/${program.id}`, { favorite: next }));
    Object.assign(program, updated);
    state.meta = null;
    toast(next ? 'Добавлено в избранное' : 'Убрано из избранного', 'success', 1800);
    return program;
  }

  // ======================================================================= 7. Router

  const ROUTES = [
    { re: /^\/?$/, page: 'overview' },
    { re: /^\/programs\/?$/, page: 'programs' },
    { re: /^\/programs\/(\d+)\/?$/, page: 'program' },
    { re: /^\/programs\/(\d+)\/edit\/?$/, page: 'edit' },
    { re: /^\/new\/?$/, page: 'new' },
    { re: /^\/settings\/?$/, page: 'settings' },
  ];

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    for (const r of ROUTES) {
      const m = r.re.exec(path);
      if (m) return { page: r.page, id: m[1] ? Number(m[1]) : null, params, path: raw };
    }
    return { page: '404', id: null, params, path: raw };
  }

  let ignoreNextHash = false;
  let lastHash = location.hash || '#/';

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  async function onHashChange() {
    if (ignoreNextHash) {
      ignoreNextHash = false;
      return;
    }
    if (state.dirty) {
      const target = location.hash;
      ignoreNextHash = true;
      location.hash = lastHash;
      const leave = await confirmModal({
        title: 'Есть несохранённые изменения',
        message: 'Покинуть страницу? Внесённые правки будут потеряны.',
        confirmLabel: 'Покинуть',
        danger: true,
      });
      if (leave) {
        state.dirty = false;
        location.hash = target;
      }
      return;
    }
    render();
  }

  const PAGES = {};

  async function render() {
    if (state.loginShown) return; // the login screen renders the route after a successful login
    const route = parseHash();
    lastHash = location.hash || '#/';
    state.route = route.page;
    state.dirty = false;
    closeDrawer();
    const view = $('#view');
    const root = document.createElement('div');
    root.className = `page page-${route.page}`;
    view.replaceChildren(root);
    state.pageRoot = root;
    const page = PAGES[route.page] || PAGES['404'];
    try {
      await page(root, route);
    } catch (err) {
      handleError(err);
      root.innerHTML = emptyState({ icon: 'alert', title: 'Не удалось загрузить страницу', text: (err && err.message) || '' , actions: `<a class="btn btn-secondary" href="${esc(location.hash || '#/')}" data-action="reload">${icon('clock')}<span>Повторить</span></a>` });
      onAction(root, { reload: () => render() });
    }
    window.scrollTo({ top: 0 });
  }

  // ======================================================================= 8. Pages

  function statusBadge(status) {
    return `<span class="badge b-${STATUS_TONES[status] || 'neutral'}"><span class="dot" aria-hidden="true"></span>${esc(STATUS_LABELS[status] || status)}</span>`;
  }

  function starButton(program, cls = '') {
    const on = Boolean(program.favorite);
    return `<button type="button" class="icon-btn sm star-btn${on ? ' is-on' : ''} ${cls}" data-action="fav" data-id="${program.id}" aria-pressed="${on}" aria-label="${on ? 'Убрать из избранного' : 'В избранное'}" title="${on ? 'Убрать из избранного' : 'В избранное'}">${icon('star')}</button>`;
  }

  function tagList(tags, clickable = false) {
    if (!tags || !tags.length) return '';
    return `<div class="tags">${tags.map((t) => (clickable
      ? `<button type="button" class="tag" data-action="tag" data-tag="${esc(t)}" title="Найти по тегу">#${esc(t)}</button>`
      : `<span class="tag">#${esc(t)}</span>`)).join('')}</div>`;
  }

  // ---- overview

  PAGES.overview = async (root) => {
    setNav('overview');
    pageHead('Обзор', 'Партнёрские программы', `<a class="btn btn-primary" href="#/new">${icon('plus')}<span>Добавить</span></a>`);
    root.innerHTML = `<div class="tiles">${[0, 1, 2, 3].map(() => '<div class="tile"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="width:30%"></div></div>').join('')}</div>${skeletonCards(2)}`;
    const programs = await loadPrograms();
    const active = programs.filter((p) => p.status === 'active').length;
    const favorites = programs.filter((p) => p.favorite).length;
    const links = programs.reduce((n, p) => n + (p.links ? p.links.length : 0), 0);
    const recent = programs.slice().sort((a, b) => b.updated_at - a.updated_at).slice(0, 8);
    const byCat = new Map();
    programs.forEach((p) => {
      const key = p.category || '';
      byCat.set(key, (byCat.get(key) || 0) + 1);
    });
    const cats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
    const maxCat = cats.length ? cats[0][1] : 1;

    root.innerHTML = `
      <div class="tiles">
        <a class="tile" href="#/programs"><span class="tile-label">Всего программ</span><span class="tile-value">${fmtNum(programs.length)}</span></a>
        <a class="tile" href="#/programs?status=active"><span class="tile-label">Активных</span><span class="tile-value">${fmtNum(active)}</span></a>
        <a class="tile" href="#/programs?fav=1"><span class="tile-label">Избранных</span><span class="tile-value">${fmtNum(favorites)}</span></a>
        <div class="tile"><span class="tile-label">Ссылок</span><span class="tile-value">${fmtNum(links)}</span><span class="tile-hint">реферальные и промо</span></div>
      </div>
      ${programs.length === 0 ? emptyState({
        title: 'Пока нет ни одной программы',
        text: 'Добавьте первую партнёрскую программу: что она делает, ссылки, промокоды и условия выплат.',
        actions: `<a class="btn btn-primary" href="#/new">${icon('plus')}<span>Добавить программу</span></a><a class="btn btn-secondary" href="#/settings">${icon('upload')}<span>Импорт из бэкапа</span></a>`,
      }) : `
      <div class="ov-grid">
        <section class="card">
          <div class="card-head"><h2>${icon('clock')}Недавно изменённые</h2><a class="btn btn-ghost btn-sm" href="#/programs"><span>Все программы</span></a></div>
          <ul class="recent">${recent.map((p) => `<li><a href="#/programs/${p.id}"><span class="recent-name">${p.favorite ? `<span class="star-btn is-on" aria-label="Избранное">${icon('star')}</span> ` : ''}${esc(p.name)}</span>${statusBadge(p.status)}<span class="recent-meta">${esc(fmtRelative(p.updated_at))}</span></a></li>`).join('')}</ul>
        </section>
        <section class="card">
          <div class="card-head"><h2>${icon('folder')}По категориям</h2></div>
          ${cats.length ? `<ul class="cat-list">${cats.map(([name, count]) => `<li><a href="#/programs?category=${encodeURIComponent(name || '-')}"><span class="cat-name">${name ? esc(name) : '<span class="muted">Без категории</span>'}</span><span class="cat-bar"><i style="width:${Math.max(6, Math.round(count / maxCat * 100))}%"></i></span><span class="count">${fmtNum(count)}</span></a></li>`).join('')}</ul>` : '<p class="muted">Категории появятся, когда вы укажете их у программ.</p>'}
        </section>
      </div>`}`;
  };

  // ---- programs list

  function matchesQuery(p, q) {
    if (!q) return true;
    const hay = [p.name, p.description, p.category, p.payout_terms, p.payout_method, p.login, p.notes, (p.tags || []).join(' '),
      ...(p.links || []).flatMap((l) => [l.title, l.url, l.promo_code, l.note])].join('\n').toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
  }

  function filterPrograms(programs, f) {
    const q = f.q.trim().toLowerCase();
    return programs.filter((p) => {
      if (f.status && p.status !== f.status) return false;
      if (f.fav && !p.favorite) return false;
      if (f.category) {
        if (f.category === '-' ? p.category : p.category !== f.category) return false;
      }
      return matchesQuery(p, q);
    });
  }

  function payoutLine(p) {
    const parts = [];
    if (p.payout_model) parts.push(`<b>${esc(p.payout_model)}</b>`);
    if (p.payout_terms) parts.push(esc(p.payout_terms.split('\n')[0]));
    if (!parts.length) return '';
    return `<div class="prog-payout">${icon('wallet')}<span>${parts.join(' · ')}</span></div>`;
  }

  function programCard(p) {
    const links = p.links || [];
    const site = p.website_url || (links[0] && links[0].url) || '';
    return `<article class="card prog-card${p.status === 'archived' ? ' is-archived' : ''}" data-id="${p.id}">
      <div class="prog-head">
        <div class="prog-title">
          <a href="#/programs/${p.id}">${esc(p.name)}</a>
          <div class="prog-meta">${statusBadge(p.status)}${p.category ? `<span class="cat-chip">${icon('folder')}${esc(p.category)}</span>` : ''}${site ? `<span class="cat-chip">${icon('globe')}${esc(hostOf(site))}</span>` : ''}</div>
        </div>
        ${starButton(p)}
      </div>
      ${p.description ? `<p class="prog-desc">${esc(p.description)}</p>` : ''}
      ${payoutLine(p)}
      ${tagList(p.tags, true)}
      <div class="prog-foot">
        <span>${icon('link')} ${fmtNum(links.length)} ${plural(links.length, 'ссылка', 'ссылки', 'ссылок')}</span>
        <span class="spacer"></span>
        <span title="Изменено ${esc(fmtDate(p.updated_at, true))}">${esc(fmtRelative(p.updated_at))}</span>
        <a class="icon-btn sm" href="#/programs/${p.id}/edit" aria-label="Редактировать" title="Редактировать">${icon('edit')}</a>
      </div>
    </article>`;
  }

  function programRow(p) {
    const links = p.links || [];
    return `<tr data-id="${p.id}">
      <td class="star-cell">${starButton(p)}</td>
      <td class="name-cell"><a href="#/programs/${p.id}">${esc(p.name)}</a>${p.description ? `<span class="name-sub">${esc(p.description)}</span>` : ''}</td>
      <td>${p.category ? esc(p.category) : '<span class="muted">—</span>'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${p.payout_model ? `<b>${esc(p.payout_model)}</b>` : ''}${p.payout_terms ? `<span class="muted small"> ${esc(p.payout_terms.split('\n')[0])}</span>` : ''}</td>
      <td class="num">${fmtNum(links.length)}</td>
      <td class="num muted small nowrap">${esc(fmtRelative(p.updated_at))}</td>
      <td class="actions-cell"><span class="row-actions"><a class="icon-btn sm" href="#/programs/${p.id}/edit" aria-label="Редактировать" title="Редактировать">${icon('edit')}</a></span></td>
    </tr>`;
  }

  PAGES.programs = async (root, route) => {
    setNav('programs');
    pageHead('Программы', 'Все партнёрские программы', `<a class="btn btn-primary" href="#/new">${icon('plus')}<span>Добавить</span></a>`);
    const f = state.listFilters;
    if (route.params.has('status')) f.status = route.params.get('status') || '';
    if (route.params.has('fav')) f.fav = route.params.get('fav') === '1';
    if (route.params.has('category')) f.category = route.params.get('category') || '';
    if (route.params.has('q')) f.q = route.params.get('q') || '';
    if (route.params.toString()) {
      ignoreNextHash = true;
      history.replaceState(null, '', `${location.pathname}#/programs`);
      lastHash = '#/programs';
      ignoreNextHash = false;
    }
    root.innerHTML = skeletonCards(3);
    const [programs, meta] = await Promise.all([loadPrograms(), loadMeta()]);
    const categories = meta.categories || [];
    if (f.category && f.category !== '-' && !categories.includes(f.category)) f.category = '';

    root.innerHTML = `
      <div class="toolbar" role="search">
        <label class="search"><span class="sr-only">Поиск</span>${icon('search')}<input class="input" id="q" type="search" placeholder="Поиск: название, описание, теги, ссылки, промокоды" autocomplete="off" value="${esc(f.q)}"><button type="button" class="icon-btn clear" data-action="clear-q" aria-label="Очистить поиск"${f.q ? '' : ' hidden'}>${icon('x')}</button></label>
        <select class="input" id="f-category" aria-label="Категория">
          <option value="">Все категории</option>
          ${categories.map((c) => `<option value="${esc(c)}"${f.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
          <option value="-"${f.category === '-' ? ' selected' : ''}>Без категории</option>
        </select>
        <select class="input" id="f-status" aria-label="Статус">
          <option value="">Все статусы</option>
          ${STATUS_ORDER.map((s) => `<option value="${s}"${f.status === s ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-secondary btn-sm${f.fav ? ' star-btn is-on' : ''}" data-action="toggle-fav" aria-pressed="${f.fav}">${icon('star')}<span>Избранные</span></button>
        <div class="toolbar-end">
          <span class="result-count" id="result-count"></span>
          <div class="segmented" role="group" aria-label="Вид">
            <button type="button" class="seg" data-action="view" data-view="cards" aria-pressed="${state.listView === 'cards'}" title="Карточки">${icon('grid')}</button>
            <button type="button" class="seg" data-action="view" data-view="table" aria-pressed="${state.listView === 'table'}" title="Таблица">${icon('rows')}</button>
          </div>
        </div>
      </div>
      <div id="list"></div>`;

    const listEl = $('#list', root);
    const paint = () => {
      const items = filterPrograms(programs, f);
      const total = programs.length;
      $('#result-count', root).textContent = items.length === total ? `${fmtNum(total)} ${plural(total, 'программа', 'программы', 'программ')}` : `${fmtNum(items.length)} из ${fmtNum(total)}`;
      $('[data-action="clear-q"]', root).hidden = !f.q;
      $$('[data-action="view"]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.listView)));
      if (!total) {
        listEl.innerHTML = emptyState({
          title: 'Программ пока нет',
          text: 'Добавьте первую партнёрскую программу или импортируйте бэкап в настройках.',
          actions: `<a class="btn btn-primary" href="#/new">${icon('plus')}<span>Добавить программу</span></a>`,
        });
        return;
      }
      if (!items.length) {
        listEl.innerHTML = emptyState({ icon: 'search', title: 'Ничего не найдено', text: 'Попробуйте изменить запрос или снять фильтры.', actions: `<button type="button" class="btn btn-secondary" data-action="reset">${icon('x')}<span>Сбросить фильтры</span></button>` });
        return;
      }
      if (state.listView === 'table') {
        listEl.innerHTML = `<div class="card flush"><div class="table-wrap"><table class="table"><thead><tr><th><span class="sr-only">Избранное</span></th><th>Название</th><th>Категория</th><th>Статус</th><th>Выплаты</th><th class="num">Ссылки</th><th class="num">Изменено</th><th><span class="sr-only">Действия</span></th></tr></thead><tbody>${items.map(programRow).join('')}</tbody></table></div></div>`;
      } else {
        listEl.innerHTML = `<div class="prog-cards">${items.map(programCard).join('')}</div>`;
      }
    };
    paint();

    let timer = 0;
    $('#q', root).addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { f.q = e.target.value; paint(); }, 120);
    });
    $('#f-category', root).addEventListener('change', (e) => { f.category = e.target.value; paint(); });
    $('#f-status', root).addEventListener('change', (e) => { f.status = e.target.value; paint(); });

    onAction(root, {
      'clear-q': () => { f.q = ''; $('#q', root).value = ''; paint(); $('#q', root).focus(); },
      'toggle-fav': (btn) => { f.fav = !f.fav; btn.setAttribute('aria-pressed', String(f.fav)); btn.classList.toggle('star-btn', f.fav); btn.classList.toggle('is-on', f.fav); paint(); },
      view: (btn) => { state.listView = btn.dataset.view === 'table' ? 'table' : 'cards'; storageSet('partners.view', state.listView); paint(); },
      reset: () => {
        Object.assign(f, { q: '', category: '', status: '', fav: false });
        $('#q', root).value = '';
        $('#f-category', root).value = '';
        $('#f-status', root).value = '';
        const favBtn = $('[data-action="toggle-fav"]', root);
        favBtn.setAttribute('aria-pressed', 'false');
        favBtn.classList.remove('star-btn', 'is-on');
        paint();
      },
      tag: (btn) => { f.q = btn.dataset.tag; $('#q', root).value = f.q; paint(); },
      fav: async (btn) => {
        const p = findProgram(Number(btn.dataset.id));
        if (!p) return;
        await toggleFavorite(p, btn);
        paint();
      },
    });
  };

  // ---- program page

  function linkItem(l, i) {
    return `<li class="link-item" data-index="${i}">
      <div class="link-main">
        ${l.title ? `<span class="link-title">${esc(l.title)}</span>` : ''}
        <a class="link-url" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(l.url)}</a>
        ${l.promo_code ? `<span class="link-promo">${icon('ticket')}Промокод <code>${esc(l.promo_code)}</code></span>` : ''}
        ${l.note ? `<span class="link-note">${esc(l.note)}</span>` : ''}
      </div>
      <div class="link-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="copy" data-text="${esc(l.url)}" data-what="Ссылка">${icon('copy')}<span>Копировать</span></button>
        ${l.promo_code ? `<button type="button" class="btn btn-secondary btn-sm" data-action="copy" data-text="${esc(l.promo_code)}" data-what="Промокод">${icon('ticket')}<span>Промокод</span></button>` : ''}
        <a class="icon-btn sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке">${icon('external')}</a>
      </div>
    </li>`;
  }

  function kvRow(label, valueHtml, iconName = '') {
    if (!valueHtml) return '';
    return `<dt>${iconName ? icon(iconName) : ''}${esc(label)}</dt><dd>${valueHtml}</dd>`;
  }

  function urlCell(url) {
    if (!url) return '';
    return `<span class="inline-copy"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a><button type="button" class="icon-btn sm" data-action="copy" data-text="${esc(url)}" data-what="Ссылка" aria-label="Копировать" title="Копировать">${icon('copy')}</button></span>`;
  }

  PAGES.program = async (root, route) => {
    setNav('programs');
    pageHead('Программа', '');
    root.innerHTML = skeletonCards(2);
    await loadPrograms();
    let p = findProgram(route.id);
    if (!p) {
      try {
        p = await api.get(`api/programs/${route.id}`);
      } catch (err) {
        if (err.status === 404) {
          pageHead('Программа не найдена');
          root.innerHTML = emptyState({ icon: 'alert', title: 'Такой программы нет', text: 'Возможно, она была удалена.', actions: `<a class="btn btn-secondary" href="#/programs">${icon('back')}<span>К списку</span></a>` });
          return;
        }
        throw err;
      }
    }

    const paint = () => {
      pageHead(p.name, p.category || 'Партнёрская программа', `${starButton(p, 'btn btn-ghost btn-icon')}<a class="btn btn-primary" href="#/programs/${p.id}/edit">${icon('edit')}<span>Редактировать</span></a>`);
      const links = p.links || [];
      root.innerHTML = `
      <div class="prog-page">
        <div class="col">
          <section class="card">
            <div class="prog-badges">${statusBadge(p.status)}${p.category ? `<span class="badge b-neutral">${icon('folder')}${esc(p.category)}</span>` : ''}${p.favorite ? `<span class="badge b-accent">${icon('star')}Избранное</span>` : ''}</div>
            ${p.description ? `<h2 class="small muted" style="margin:16px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Что делает</h2><p class="text-block">${esc(p.description)}</p>` : '<p class="muted" style="margin-top:12px">Описание не заполнено.</p>'}
            ${tagList(p.tags, false) ? `<div style="margin-top:14px">${tagList(p.tags, false)}</div>` : ''}
          </section>
          ${p.notes ? `<section class="card"><div class="card-head"><h2>${icon('note')}Заметки</h2></div><p class="text-block">${esc(p.notes)}</p></section>` : ''}
        </div>
        <div class="col">
          <section class="card">
            <div class="card-head"><h2>${icon('wallet')}Выплаты</h2></div>
            ${(p.payout_model || p.payout_terms || p.payout_min || p.payout_method) ? `<dl class="kv">
              ${kvRow('Модель', p.payout_model ? `<b>${esc(p.payout_model)}</b>` : '')}
              ${kvRow('Условия', p.payout_terms ? `<span class="text-block">${esc(p.payout_terms)}</span>` : '')}
              ${kvRow('Минимум', esc(p.payout_min))}
              ${kvRow('Способ', esc(p.payout_method))}
            </dl>` : '<p class="muted">Условия выплат не указаны.</p>'}
          </section>
          <section class="card">
            <div class="card-head"><h2>${icon('globe')}Доступ</h2></div>
            ${(p.website_url || p.cabinet_url || p.login) ? `<dl class="kv">
              ${kvRow('Сайт', urlCell(p.website_url))}
              ${kvRow('Кабинет', urlCell(p.cabinet_url))}
              ${kvRow('Логин', p.login ? `<span class="inline-copy"><span class="mono">${esc(p.login)}</span><button type="button" class="icon-btn sm" data-action="copy" data-text="${esc(p.login)}" data-what="Логин" aria-label="Копировать" title="Копировать">${icon('copy')}</button></span>` : '')}
            </dl>` : '<p class="muted">Сайт и кабинет не указаны.</p>'}
            <p class="hint">${icon('lock')}Пароли здесь не хранятся — используйте менеджер паролей.</p>
          </section>
          <section class="card">
            <div class="card-head"><h2>${icon('link')}Ссылки <span class="count">${fmtNum(links.length)}</span></h2></div>
            ${links.length ? `<ul class="links-list">${links.map(linkItem).join('')}</ul>` : `<div class="empty"><div class="empty-icon">${icon('link')}</div><h3>Ссылок пока нет</h3><p>Добавьте реферальные ссылки и промокоды в редакторе программы.</p><div class="empty-actions"><a class="btn btn-secondary btn-sm" href="#/programs/${p.id}/edit">${icon('plus')}<span>Добавить ссылки</span></a></div></div>`}
          </section>
          <section class="card">
            <div class="card-head"><h2>${icon('clock')}История</h2></div>
            <dl class="kv">
              ${kvRow('Создана', esc(fmtDate(p.created_at, true)))}
              ${kvRow('Изменена', esc(fmtDate(p.updated_at, true)))}
            </dl>
            <div class="card-actions">
              ${p.status !== 'active' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="status" data-status="active">${icon('play')}<span>Активировать</span></button>` : ''}
              ${p.status !== 'paused' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="status" data-status="paused">${icon('pause')}<span>На паузу</span></button>` : ''}
              ${p.status !== 'archived' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="status" data-status="archived">${icon('archive')}<span>В архив</span></button>` : ''}
            </div>
          </section>
          <section class="card danger-zone">
            <div class="card-head"><h2>${icon('alert')}Удаление</h2></div>
            <p class="small muted" style="margin:0 0 12px">Программа и все её ссылки будут удалены безвозвратно.</p>
            <button type="button" class="btn btn-secondary btn-sm is-danger" data-action="delete">${icon('trash')}<span>Удалить программу</span></button>
          </section>
        </div>
      </div>`;
    };
    paint();

    onAction(root, {
      copy: async (btn) => {
        const ok = await copyText(btn.dataset.text);
        toast(ok ? `${btn.dataset.what || 'Текст'}: скопировано` : 'Не удалось скопировать', ok ? 'success' : 'error', 1800);
      },
      fav: async (btn) => {
        await toggleFavorite(p, btn);
        paint();
      },
      status: async (btn) => {
        const updated = await busy(btn, () => api.patch(`api/programs/${p.id}`, { status: btn.dataset.status }));
        Object.assign(p, updated);
        toast(`Статус: ${STATUS_LABELS[p.status]}`, 'success', 2000);
        paint();
      },
      delete: async () => {
        const ok = await confirmModal({
          title: 'Удалить программу?',
          message: `«${p.name}» и ${fmtNum((p.links || []).length)} ${plural((p.links || []).length, 'ссылка', 'ссылки', 'ссылок')} будут удалены безвозвратно.`,
          confirmLabel: 'Удалить',
          danger: true,
          confirmIcon: 'trash',
        });
        if (!ok) return;
        await api.delete(`api/programs/${p.id}`);
        invalidate();
        toast('Программа удалена', 'success');
        navigate('#/programs');
      },
    });
  };

  // ---- form (new / edit)

  function emptyProgram() {
    return { name: '', category: '', status: 'active', description: '', website_url: '', cabinet_url: '', login: '',
      payout_model: '', payout_terms: '', payout_min: '', payout_method: '', tags: [], notes: '', favorite: false, links: [] };
  }

  function fieldHtml({ name, label, value = '', type = 'text', placeholder = '', hint = '', list = '', span = false, rows = 0, required = false, maxlength = 0, mono = false }) {
    const attrs = `class="input${mono ? ' mono' : ''}" name="${name}" id="f-${name}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}${list ? ` list="${list}"` : ''}${required ? ' required' : ''}${maxlength ? ` maxlength="${maxlength}"` : ''} autocomplete="off"`;
    const control = rows
      ? `<textarea ${attrs} rows="${rows}">${esc(value)}</textarea>`
      : `<input ${attrs} type="${type}" value="${esc(value)}"${type === 'url' ? ' inputmode="url" spellcheck="false"' : ''}>`;
    return `<label class="field${span ? ' span-2' : ''}" data-field="${name}"><span class="label">${esc(label)}${required ? ' <span class="muted">*</span>' : ''}</span>${control}${hint ? `<span class="hint">${hint}</span>` : ''}<span class="field-error"></span></label>`;
  }

  function linkRowHtml(l, i) {
    return `<div class="link-row" data-row="${i}">
      <div class="grip" aria-hidden="true">${icon('grip')}</div>
      <div class="fields">
        <label class="field" data-field="links.${i}.title"><span class="label">Подпись</span><input class="input input-sm" name="links.${i}.title" placeholder="Канал, гео, лендинг…" value="${esc(l.title)}" maxlength="100" autocomplete="off"><span class="field-error"></span></label>
        <label class="field" data-field="links.${i}.promo_code"><span class="label">Промокод</span><input class="input input-sm mono" name="links.${i}.promo_code" placeholder="PROMO2026" value="${esc(l.promo_code)}" maxlength="100" autocomplete="off" spellcheck="false"><span class="field-error"></span></label>
        <label class="field wide" data-field="links.${i}.url"><span class="label">Ссылка <span class="muted">*</span></span><input class="input input-sm" name="links.${i}.url" type="url" inputmode="url" placeholder="https://example.com/?ref=abc" value="${esc(l.url)}" required autocomplete="off" spellcheck="false"><span class="field-error"></span></label>
        <label class="field wide" data-field="links.${i}.note"><span class="label">Заметка</span><input class="input input-sm" name="links.${i}.note" placeholder="Для какого трафика, условия…" value="${esc(l.note)}" maxlength="300" autocomplete="off"><span class="field-error"></span></label>
      </div>
      <div class="ops">
        <button type="button" class="icon-btn" data-action="link-up" aria-label="Выше" title="Выше">${icon('up')}</button>
        <button type="button" class="icon-btn" data-action="link-down" aria-label="Ниже" title="Ниже">${icon('down')}</button>
        <button type="button" class="icon-btn is-danger" data-action="link-remove" aria-label="Удалить ссылку" title="Удалить ссылку">${icon('trash')}</button>
      </div>
    </div>`;
  }

  async function programForm(root, program, { isNew }) {
    const meta = await loadMeta();
    const draft = JSON.parse(JSON.stringify(program));
    const title = isNew ? 'Новая программа' : `Редактирование: ${program.name}`;
    pageHead(isNew ? 'Добавить программу' : 'Редактирование', isNew ? 'Новая партнёрская программа' : program.name,
      `<a class="btn btn-secondary" href="${isNew ? '#/programs' : `#/programs/${program.id}`}">${icon('x')}<span>Отмена</span></a><button type="button" class="btn btn-primary" data-action="save">${icon('save')}<span>Сохранить</span></button>`);
    document.title = `${title} — Партнёрки`;

    const payoutOptions = (meta.payout_models || []).map((m) => `<option value="${esc(m)}"${draft.payout_model === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
    root.innerHTML = `
      <form id="program-form" class="card form-card" novalidate>
        <datalist id="dl-categories">${(meta.categories || []).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <datalist id="dl-tags">${(meta.tags || []).map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        <section class="form-section">
          <h2>${icon('handshake')}Программа</h2>
          <div class="form-grid">
            ${fieldHtml({ name: 'name', label: 'Название', value: draft.name, placeholder: 'Например, Example Partners', required: true, maxlength: 200 })}
            ${fieldHtml({ name: 'category', label: 'Категория', value: draft.category, placeholder: 'Хостинг, VPN, финансы…', list: 'dl-categories', maxlength: 100 })}
            <label class="field" data-field="status"><span class="label">Статус</span><select class="input" name="status" id="f-status">${STATUS_ORDER.map((s) => `<option value="${s}"${draft.status === s ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}</select><span class="field-error"></span></label>
            <label class="field" data-field="favorite"><span class="label">Избранное</span><span class="chk" style="height:36px"><input type="checkbox" name="favorite" id="f-favorite"${draft.favorite ? ' checked' : ''}><span>Показывать в избранном</span></span></label>
            ${fieldHtml({ name: 'description', label: 'Что делает программа', value: draft.description, placeholder: 'Чем занимается, что продвигаем, кому подходит', rows: 4, span: true, maxlength: 4000 })}
            ${fieldHtml({ name: 'tags', label: 'Теги', value: (draft.tags || []).join(', '), placeholder: 'через запятую: игры, cpa, ru', list: 'dl-tags', span: true, hint: 'Через запятую. Теги помогают искать и группировать программы.' })}
          </div>
        </section>
        <section class="form-section">
          <h2>${icon('globe')}Сайт и доступ</h2>
          <div class="form-grid">
            ${fieldHtml({ name: 'website_url', label: 'Сайт программы', value: draft.website_url, type: 'url', placeholder: 'https://partners.example.com' })}
            ${fieldHtml({ name: 'cabinet_url', label: 'Кабинет партнёра', value: draft.cabinet_url, type: 'url', placeholder: 'https://partners.example.com/login' })}
            ${fieldHtml({ name: 'login', label: 'Логин / e-mail', value: draft.login, placeholder: 'login@example.com', mono: true, maxlength: 200, hint: `${icon('lock')}Только логин. <b>Пароли здесь не храните</b> — для них есть менеджер паролей.`, span: true })}
          </div>
        </section>
        <section class="form-section">
          <h2>${icon('wallet')}Условия выплат</h2>
          <div class="form-grid">
            <label class="field" data-field="payout_model"><span class="label">Модель</span><select class="input" name="payout_model" id="f-payout_model"><option value="">Не указана</option>${payoutOptions}</select><span class="field-error"></span></label>
            ${fieldHtml({ name: 'payout_min', label: 'Минимальная выплата', value: draft.payout_min, placeholder: '50 $ / 5 000 ₽', maxlength: 100 })}
            ${fieldHtml({ name: 'payout_terms', label: 'Условия', value: draft.payout_terms, placeholder: 'Например: 40% RevShare пожизненно, холд 14 дней', rows: 3, span: true, maxlength: 4000 })}
            ${fieldHtml({ name: 'payout_method', label: 'Способ выплаты', value: draft.payout_method, placeholder: 'Карта, USDT, PayPal, WebMoney…', maxlength: 100, span: true })}
          </div>
        </section>
        <section class="form-section">
          <h2>${icon('link')}Ссылки и промокоды <span class="count" id="links-count">${fmtNum((draft.links || []).length)}</span></h2>
          <div class="link-rows" id="link-rows"></div>
          <div class="card-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="link-add">${icon('plus')}<span>Добавить ссылку</span></button></div>
        </section>
        <section class="form-section">
          <h2>${icon('note')}Заметки</h2>
          ${fieldHtml({ name: 'notes', label: 'Заметки', value: draft.notes, placeholder: 'Менеджер, контакты поддержки, особенности, что обещали…', rows: 4, span: true, maxlength: 4000 })}
        </section>
        <div class="form-foot">
          <span class="dirty" id="dirty-note" hidden>${icon('alert')} Есть несохранённые изменения</span>
          <span class="spacer"></span>
          <a class="btn btn-secondary" href="${isNew ? '#/programs' : `#/programs/${program.id}`}"><span>Отмена</span></a>
          <button type="submit" class="btn btn-primary">${icon('save')}<span>${isNew ? 'Создать программу' : 'Сохранить'}</span></button>
        </div>
      </form>`;

    const form = $('#program-form', root);
    const rowsEl = $('#link-rows', root);
    const links = (draft.links || []).map((l) => ({ title: l.title || '', url: l.url || '', promo_code: l.promo_code || '', note: l.note || '' }));

    const readLinkRows = () => {
      $$('.link-row', rowsEl).forEach((row, i) => {
        const get = (k) => (row.querySelector(`[name="links.${i}.${k}"]`) || {}).value || '';
        links[i] = { title: get('title'), url: get('url'), promo_code: get('promo_code'), note: get('note') };
      });
    };
    const paintLinks = () => {
      rowsEl.innerHTML = links.length ? links.map(linkRowHtml).join('') : `<p class="muted small" style="margin:0">Ссылок пока нет. Добавьте реферальную ссылку, промокод и подпись (канал, гео, лендинг).</p>`;
      $('#links-count', root).textContent = fmtNum(links.length);
      $$('.link-row', rowsEl).forEach((row, i) => {
        $('[data-action="link-up"]', row).disabled = i === 0;
        $('[data-action="link-down"]', row).disabled = i === links.length - 1;
      });
    };
    paintLinks();

    const markDirty = () => {
      if (!state.dirty) {
        state.dirty = true;
        $('#dirty-note', root).hidden = false;
      }
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);

    const clearErrors = () => {
      $$('.field.has-error', form).forEach((f) => {
        f.classList.remove('has-error');
        $('.field-error', f).textContent = '';
      });
      $$('.link-row.is-error', form).forEach((r) => r.classList.remove('is-error'));
    };
    const showError = (field, message) => {
      const holder = field ? $(`[data-field="${field}"]`, form) : null;
      if (holder) {
        holder.classList.add('has-error');
        $('.field-error', holder).textContent = message;
        const row = holder.closest('.link-row');
        if (row) row.classList.add('is-error');
        const input = $('input, textarea, select', holder);
        if (input) {
          input.focus();
          input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
      toast(message, 'error');
    };

    const collect = () => {
      readLinkRows();
      const v = (n) => (form.elements[n] ? form.elements[n].value : '');
      return {
        name: v('name'), category: v('category'), status: v('status'), description: v('description'),
        website_url: v('website_url'), cabinet_url: v('cabinet_url'), login: v('login'),
        payout_model: v('payout_model'), payout_terms: v('payout_terms'), payout_min: v('payout_min'), payout_method: v('payout_method'),
        tags: v('tags').split(',').map((t) => t.trim()).filter(Boolean),
        notes: v('notes'), favorite: form.elements.favorite.checked,
        links: links.map((l) => ({ ...l })),
      };
    };

    const save = async (btn) => {
      clearErrors();
      const payload = collect();
      if (!payload.name.trim()) return showError('name', 'Название: заполните поле');
      const badUrl = (u) => u.trim() && !/^https?:\/\/\S+$/i.test(u.trim());
      if (badUrl(payload.website_url)) return showError('website_url', 'Сайт программы: нужен адрес вида https://example.com');
      if (badUrl(payload.cabinet_url)) return showError('cabinet_url', 'Кабинет партнёра: нужен адрес вида https://example.com');
      for (let i = 0; i < payload.links.length; i++) {
        if (!payload.links[i].url.trim()) return showError(`links.${i}.url`, `Ссылка ${i + 1}: укажите адрес`);
        if (badUrl(payload.links[i].url)) return showError(`links.${i}.url`, `Ссылка ${i + 1}: нужен адрес вида https://example.com`);
      }
      try {
        const saved = await busy(btn, () => (isNew ? api.post('api/programs', payload) : api.put(`api/programs/${program.id}`, payload)));
        state.dirty = false;
        invalidate();
        toast(isNew ? 'Программа создана' : 'Изменения сохранены', 'success');
        navigate(`#/programs/${saved.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) showError(err.field, err.message);
        else throw err;
      }
      return undefined;
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save($('button[type="submit"]', form)).catch(handleError);
    });
    form.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save($('button[type="submit"]', form)).catch(handleError);
      }
    });
    onAction(root, {
      save: (btn) => save(btn),
      'link-add': () => {
        readLinkRows();
        links.push({ title: '', url: '', promo_code: '', note: '' });
        paintLinks();
        markDirty();
        const last = $$('.link-row', rowsEl).pop();
        if (last) $('input[name$=".url"]', last).focus();
      },
      'link-remove': (btn) => {
        readLinkRows();
        const i = Number(btn.closest('.link-row').dataset.row);
        links.splice(i, 1);
        paintLinks();
        markDirty();
      },
      'link-up': (btn) => {
        readLinkRows();
        const i = Number(btn.closest('.link-row').dataset.row);
        if (i > 0) { [links[i - 1], links[i]] = [links[i], links[i - 1]]; paintLinks(); markDirty(); $$('.link-row', rowsEl)[i - 1].querySelector('[data-action="link-up"]').focus(); }
      },
      'link-down': (btn) => {
        readLinkRows();
        const i = Number(btn.closest('.link-row').dataset.row);
        if (i < links.length - 1) { [links[i + 1], links[i]] = [links[i], links[i + 1]]; paintLinks(); markDirty(); $$('.link-row', rowsEl)[i + 1].querySelector('[data-action="link-down"]').focus(); }
      },
    });
    setTimeout(() => { const f = $('#f-name', form); if (f && isNew) f.focus(); }, 30);
  }

  PAGES.new = async (root) => {
    setNav('new');
    root.innerHTML = skeletonCards(2);
    await programForm(root, emptyProgram(), { isNew: true });
  };

  PAGES.edit = async (root, route) => {
    setNav('programs');
    root.innerHTML = skeletonCards(2);
    await loadPrograms();
    let p = findProgram(route.id);
    if (!p) {
      try {
        p = await api.get(`api/programs/${route.id}`);
      } catch (err) {
        if (err.status === 404) {
          pageHead('Программа не найдена');
          root.innerHTML = emptyState({ icon: 'alert', title: 'Такой программы нет', actions: `<a class="btn btn-secondary" href="#/programs">${icon('back')}<span>К списку</span></a>` });
          return;
        }
        throw err;
      }
    }
    await programForm(root, p, { isNew: false });
  };

  // ---- settings

  PAGES.settings = async (root) => {
    setNav('settings');
    pageHead('Настройки', 'Бэкап, импорт и оформление');
    const version = metaContent('panel-version');
    root.innerHTML = `
      <div class="settings-grid">
        <section class="card">
          <div class="card-head"><h2>${icon('download')}Экспорт</h2></div>
          <p class="small muted" style="margin:0 0 12px">Все программы и ссылки одним JSON-файлом. Храните его как бэкап — из него можно восстановить данные через импорт.</p>
          <a class="btn btn-primary" href="api/export" download>${icon('download')}<span>Скачать JSON</span></a>
        </section>
        <section class="card">
          <div class="card-head"><h2>${icon('upload')}Импорт</h2></div>
          <p class="small muted" style="margin:0 0 12px">Добавляет программы из файла экспорта. Существующие записи не меняются и не удаляются; дубликаты не проверяются.</p>
          <input type="file" class="file-input" id="import-file" accept="application/json,.json">
          <button type="button" class="btn btn-secondary" data-action="import">${icon('upload')}<span>Выбрать файл…</span></button>
          <div class="import-result" id="import-result"></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>${icon('sun')}Оформление</h2></div>
          <p class="small muted" style="margin:0 0 12px">Тема общая для всех панелей на этом адресе.</p>
          <div class="segmented" role="group" aria-label="Тема">
            ${THEMES.map((v) => `<button type="button" class="seg" data-action="theme" data-theme="${v}" aria-pressed="${currentTheme === v}">${THEME_LABELS[v]}</button>`).join('')}
          </div>
        </section>
        <section class="card" id="auth-card">
          <div class="card-head"><h2>${icon('shield')}Доступ по паролю</h2></div>
          <div id="auth-body"></div>
        </section>
        <section class="card about">
          <div class="card-head"><h2>${icon('info')}О панели</h2></div>
          <dl class="kv">
            <dt>Версия</dt><dd id="about-version">${esc(version || '—')}</dd>
            <dt>Хранилище</dt><dd>SQLite, файл <code>data/partners.db</code></dd>
            <dt>Пароли кабинетов</dt><dd>не хранятся — только логины</dd>
          </dl>
        </section>
      </div>`;
    const fileInput = $('#import-file', root);
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const resultEl = $('#import-result', root);
      try {
        if (file.size > 2 * 1024 * 1024) throw new ApiError('Файл больше 2 МБ', 413);
        let payload;
        try {
          payload = JSON.parse(await file.text());
        } catch {
          throw new ApiError('Файл не является корректным JSON', 400);
        }
        const count = Array.isArray(payload) ? payload.length : Array.isArray(payload && payload.programs) ? payload.programs.length : 0;
        const ok = await confirmModal({
          title: 'Импортировать программы?',
          message: `В файле «${file.name}» ${fmtNum(count)} ${plural(count, 'программа', 'программы', 'программ')}. Они будут добавлены к существующим.`,
          confirmLabel: 'Импортировать',
          confirmIcon: 'upload',
        });
        if (!ok) return;
        const res = await api.post('api/import', payload);
        invalidate();
        refreshHealth();
        const errs = Array.isArray(res.errors) ? res.errors : [];
        resultEl.innerHTML = `<div class="callout${errs.length ? ' is-warn' : ''}" style="margin-top:12px">${icon(errs.length ? 'alert' : 'check')}<div>Добавлено: <b>${fmtNum(res.added)}</b>${res.skipped ? `, пропущено: <b>${fmtNum(res.skipped)}</b>` : ''}${errs.length ? `<ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div></div>`;
        toast(`Импортировано: ${fmtNum(res.added)}`, 'success');
      } catch (err) {
        handleError(err);
      }
    });
    const pwField = (name, label, autocomplete) => `<label class="field" data-field="${name}"><span class="label">${esc(label)}</span><input class="input" type="password" name="${name}" autocomplete="${autocomplete}" minlength="8" maxlength="128" required><span class="field-error"></span></label>`;
    const authBody = $('#auth-body', root);
    let authMode = 'view'; // view | change
    const paintAuth = () => {
      const a = state.auth;
      if (!a.enabled) {
        authBody.innerHTML = `
          <p class="small muted" style="margin:0 0 12px">Сейчас панель открыта всем, у кого есть доступ к её адресу. Включите пароль, если панель видна из сети.</p>
          <form class="auth-form" id="auth-enable" novalidate>
            ${pwField('password', 'Новый пароль', 'new-password')}
            ${pwField('password2', 'Повторите пароль', 'new-password')}
            <p class="hint" style="margin:0 0 12px">От 8 до 128 символов. Эта вкладка останется в системе, вводить пароль заново не придётся.</p>
            <div class="auth-actions"><button type="submit" class="btn btn-primary">${icon('lock')}<span>Включить</span></button></div>
          </form>`;
        return;
      }
      authBody.innerHTML = `
        <div class="auth-state"><span class="badge b-success"><span class="dot" aria-hidden="true"></span>Включён</span><span class="small muted">Вход по паролю обязателен для всех устройств.</span></div>
        ${authMode === 'change' ? `
        <form class="auth-form" id="auth-change" novalidate>
          ${pwField('current', 'Текущий пароль', 'current-password')}
          ${pwField('new', 'Новый пароль', 'new-password')}
          ${pwField('new2', 'Повторите новый пароль', 'new-password')}
          <p class="hint" style="margin:0 0 12px">После смены все другие устройства будут разлогинены.</p>
          <div class="auth-actions"><button type="submit" class="btn btn-primary">${icon('key')}<span>Сменить пароль</span></button><button type="button" class="btn btn-secondary" data-action="auth-cancel"><span>Отмена</span></button></div>
        </form>` : `
        <div class="auth-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="auth-change">${icon('key')}<span>Сменить пароль</span></button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="auth-logout">${icon('logout')}<span>Выйти на этом устройстве</span></button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="auth-logout-all">${icon('logout')}<span>Выйти на всех устройствах</span></button>
          <button type="button" class="btn btn-secondary btn-sm is-danger" data-action="auth-disable">${icon('x')}<span>Отключить пароль</span></button>
        </div>
        <p class="hint">Забыли пароль? На сервере: <code>python -m app reset-password</code>.</p>`}`;
    };
    const fieldError = (form, name, message) => {
      const holder = $(`[data-field="${name}"]`, form);
      if (holder) {
        holder.classList.add('has-error');
        $('.field-error', holder).textContent = message;
        $('input', holder).focus();
      } else {
        toast(message, 'error');
      }
    };
    const clearFieldErrors = (form) => $$('.field.has-error', form).forEach((f) => { f.classList.remove('has-error'); $('.field-error', f).textContent = ''; });
    const checkPair = (form, a, b) => {
      const v1 = form.elements[a].value;
      const v2 = form.elements[b].value;
      if (v1.length < 8) { fieldError(form, a, 'Не короче 8 символов'); return null; }
      if (v1.length > 128) { fieldError(form, a, 'Не длиннее 128 символов'); return null; }
      if (v1 !== v2) { fieldError(form, b, 'Пароли не совпадают'); return null; }
      return v1;
    };
    root.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.id !== 'auth-enable' && form.id !== 'auth-change') return;
      e.preventDefault();
      clearFieldErrors(form);
      busy($('button[type="submit"]', form), async () => {
        try {
          if (form.id === 'auth-enable') {
            const password = checkPair(form, 'password', 'password2');
            if (password === null) return;
            await api.post('api/auth/enable', { password });
            state.auth = { enabled: true, authenticated: true };
            toast('Доступ по паролю включён', 'success');
          } else {
            const current = form.elements.current.value;
            if (!current) { fieldError(form, 'current', 'Введите текущий пароль'); return; }
            const next = checkPair(form, 'new', 'new2');
            if (next === null) return;
            await api.post('api/auth/change', { current, new: next });
            authMode = 'view';
            toast('Пароль изменён', 'success');
          }
        } catch (err) {
          if (err instanceof ApiError && err.field) { fieldError(form, err.field, err.message); return; }
          throw err;
        }
        paintAuthControls();
        refreshHealth();
        paintAuth();
      }).catch(handleError);
    });
    onAction(root, {
      import: () => fileInput.click(),
      theme: (btn) => setTheme(btn.dataset.theme),
      'auth-change': () => { authMode = 'change'; paintAuth(); setTimeout(() => { const f = $('#auth-change input', root); if (f) f.focus(); }, 30); },
      'auth-cancel': () => { authMode = 'view'; paintAuth(); },
      'auth-logout': () => logoutHere(),
      'auth-logout-all': async () => {
        const ok = await confirmModal({ title: 'Выйти на всех устройствах?', message: 'Все сессии будут завершены, включая эту. Войти заново можно сразу.', confirmLabel: 'Выйти везде', danger: true, confirmIcon: 'logout' });
        if (!ok) return;
        await api.post('api/auth/logout-all');
        invalidate();
        toast('Все сессии завершены', 'info');
        showLogin();
      },
      'auth-disable': async () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>Панель снова будет открыта всем, у кого есть доступ к её адресу. Все сессии будут завершены.</p>
          <label class="field"><span class="label">Текущий пароль</span><input class="input" type="password" data-current autocomplete="current-password"></label>`;
        const ok = await openModal({
          title: 'Отключить пароль?',
          body,
          actions: [{ label: 'Отмена', value: 'cancel' }, { label: 'Отключить', value: 'ok', kind: 'danger', submit: true, icon: 'x' }],
          onSubmit: async () => {
            const current = $('[data-current]', body).value;
            if (!current) throw new ApiError('Введите текущий пароль', 400);
            await api.post('api/auth/disable', { current });
          },
        });
        if (ok !== 'ok') return;
        state.auth = { enabled: false, authenticated: true };
        paintAuthControls();
        refreshHealth();
        toast('Пароль отключён', 'success');
        paintAuth();
      },
    });
    paintAuth();
    try {
      const meta = await loadMeta();
      if (meta.version) $('#about-version', root).textContent = meta.version;
    } catch { /* not critical */ }
  };

  PAGES['404'] = async (root) => {
    setNav('');
    pageHead('Страница не найдена');
    root.innerHTML = emptyState({ icon: 'alert', title: 'Такой страницы нет', actions: `<a class="btn btn-primary" href="#/">${icon('dashboard')}<span>На обзор</span></a>` });
  };

  // ======================================================================= 9. Boot

  function fillStaticIcons() {
    $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  }

  function boot() {
    if (location.search) history.replaceState(null, '', `${location.pathname}${location.hash}`);
    fillStaticIcons();
    initShell();
    window.addEventListener('hashchange', onHashChange);
    const skip = $('.skip-link');
    if (skip) skip.addEventListener('click', (e) => { e.preventDefault(); $('#view').focus(); });
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    refreshAuth().then((a) => {
      if (a.enabled && !a.authenticated) showLogin();
      else render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
