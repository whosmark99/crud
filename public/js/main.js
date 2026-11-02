/* ==========================================================
   Shared app shell + helpers (sidebar, topbar, theme, toasts,
   dialogs, API wrapper). Loaded on every dashboard page.
   ========================================================== */
(function () {
  const App = (window.App = window.App || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  App.$ = $; App.$$ = $$;

  /* ---------- Utilities ---------- */
  App.esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.initials = (name) => (String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();
  App.parseDate = (s) => (s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : null);
  App.fmtDate = (s) => {
    if (!s) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : App.parseDate(s);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  App.timeAgo = (s) => {
    const d = App.parseDate(s); if (!d) return '';
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 45) return 'just now';
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [name, secs] of units) {
      if (sec >= secs) { const n = Math.floor(sec / secs); return `${n} ${name}${n > 1 ? 's' : ''} ago`; }
    }
    return 'just now';
  };
  App.currency = '₱';
  App.money = (n) => App.currency + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  App.debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  App.statusBadge = (s) => `<span class="badge ${String(s).toLowerCase().replace(/\s+/g, '-')}">${App.esc(s)}</span>`;
  App.icons = () => { if (window.lucide) window.lucide.createIcons(); };
  App.icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;

  /* ---------- API ---------- */
  App.api = async (url, opts = {}) => {
    const init = { method: opts.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (opts.body instanceof FormData) init.body = opts.body;
    else if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch(url, init); }
    catch (e) { const err = new Error('Can’t reach the server. Check your connection and try again.'); err.network = true; throw err; }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (res.status === 401 && !opts.allow401) { window.location.href = '/login'; throw new Error('Session expired'); }
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong. Please try again.'); err.errors = data.errors || {}; err.status = res.status; throw err; }
    return data;
  };

  /* ---------- Theme ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  App.getThemePref = () => localStorage.getItem('theme') || 'light';
  App.resolveTheme = (pref) => (pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref);
  App.applyTheme = (pref, animate = true) => {
    const root = document.documentElement;
    if (animate) { root.classList.add('theme-anim'); setTimeout(() => root.classList.remove('theme-anim'), 400); }
    root.dataset.theme = App.resolveTheme(pref);
    window.dispatchEvent(new CustomEvent('themechange', { detail: root.dataset.theme }));
  };
  App.setTheme = (pref) => { localStorage.setItem('theme', pref); App.applyTheme(pref); updateThemeIcon(); };
  mq.addEventListener && mq.addEventListener('change', () => { if (App.getThemePref() === 'system') App.applyTheme('system'); });
  function updateThemeIcon() {
    const btn = $('#theme-toggle'); if (!btn) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.innerHTML = App.icon(dark ? 'sun' : 'moon');
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    App.icons();
  }

  /* ---------- Toasts ---------- */
  App.toast = (message, type = 'success') => {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const icons = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="t-ico">${App.icon(icons[type] || 'info')}</span><div class="t-text">${App.esc(message)}</div><button aria-label="Dismiss">${App.icon('x')}</button>`;
    box.appendChild(el); App.icons();
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
    el.querySelector('button').addEventListener('click', close);
    setTimeout(close, type === 'error' ? 6000 : 3800);
  };

  /* ---------- Modal helpers (same component for add/edit/confirm) ---------- */
  App.openModal = (el) => {
    if (typeof el === 'string') el = document.getElementById(el);
    el.classList.add('open'); document.body.classList.add('modal-open');
    el.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const f = el.querySelector('[data-autofocus], input:not([type=hidden]):not([type=file]), select, textarea'); f && f.focus({ preventScroll: true }); }, 60);
  };
  App.closeModal = (el) => {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
    if (!$('.modal-overlay.open')) document.body.classList.remove('modal-open');
  };
  document.addEventListener('click', (e) => {
    const overlay = e.target.classList && e.target.classList.contains('modal-overlay') ? e.target : null;
    if (overlay && !overlay.dataset.static) App.closeModal(overlay);
    const closer = e.target.closest('[data-close-modal]');
    if (closer) App.closeModal(closer.closest('.modal-overlay'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const open = $$('.modal-overlay.open').pop(); if (open) App.closeModal(open); closeDropdowns(); }
  });

  App.confirm = ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = true, icon = 'trash-2' } = {}) =>
    new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'alertdialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="modal sm">
          <div class="modal-body"><div class="confirm-body">
            <div class="confirm-icon ${danger ? '' : 'info'}">${App.icon(icon)}</div>
            <div><h3>${App.esc(title)}</h3><p>${App.esc(message)}</p></div>
          </div></div>
          <div class="modal-foot">
            <button class="btn" data-no>Cancel</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes data-autofocus>${App.esc(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay); App.icons();
      requestAnimationFrame(() => App.openModal(overlay));
      let done = false;
      const finish = (val) => {
        if (done) return; done = true;
        obs.disconnect(); App.closeModal(overlay); setTimeout(() => overlay.remove(), 260); resolve(val);
      };
      overlay.querySelector('[data-yes]').addEventListener('click', () => finish(true));
      overlay.querySelector('[data-no]').addEventListener('click', () => finish(false));
      // Closing via overlay click / Esc counts as cancel.
      const obs = new MutationObserver(() => { if (!overlay.classList.contains('open')) finish(false); });
      obs.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    });

  /* Form helpers shared by pages */
  App.clearErrors = (form) => {
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    $$('.field-error', form).forEach((e) => (e.textContent = ''));
  };
  App.showErrors = (form, errors = {}) => {
    let first = null;
    Object.entries(errors).forEach(([name, msg]) => {
      const input = form.elements[name]; if (!input) return;
      const field = input.closest('.field'); if (!field) return;
      field.classList.add('invalid');
      const slot = field.querySelector('.field-error'); if (slot) slot.textContent = msg;
      if (!first) first = input;
    });
    if (first) first.focus();
  };
  App.setLoading = (btn, on) => { btn.classList.toggle('loading', on); btn.disabled = on; };
  App.bindPasswordToggles = (root = document) => {
    $$('.toggle-pw', root).forEach((btn) => {
      if (btn.dataset.bound) return; btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = App.icon(show ? 'eye-off' : 'eye'); btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        App.icons();
      });
    });
  };

  /* ---------- Dropdowns ---------- */
  function closeDropdowns(except) { $$('.dropdown.open').forEach((d) => { if (d !== except) d.classList.remove('open'); }); }
  document.addEventListener('click', (e) => { const dd = e.target.closest('.dropdown'); if (!dd) closeDropdowns(); });

  /* ---------- Shell ---------- */
  const NAV = [
    { href: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', page: 'dashboard' },
    { href: '/inventory', label: 'Laptop Inventory', icon: 'laptop', page: 'inventory' },
    { href: '/brands', label: 'Brands', icon: 'award', page: 'brands' },
    { href: '/reports', label: 'Reports', icon: 'chart-column', page: 'reports' },
    { href: '/settings', label: 'Settings', icon: 'settings', page: 'settings' }
  ];

  function buildShell(user, settings) {
    const page = document.body.dataset.page;
    const main = $('#page');
    document.body.classList.add('app');
    if (localStorage.getItem('sidebar') === 'collapsed') document.body.classList.add('sidebar-collapsed');

    const navHtml = NAV.map((n) => `
      <a class="nav-link${n.page === page ? ' active' : ''}" href="${n.href}" data-tooltip="${App.esc(n.label)}"${n.action ? ` data-action="${n.action}"` : ''}${n.page === page ? ' aria-current="page"' : ''}>
        ${App.icon(n.icon)}<span class="nav-label">${App.esc(n.label)}</span>
      </a>`).join('');

    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar'; sidebar.id = 'sidebar'; sidebar.setAttribute('aria-label', 'Main navigation');
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="brand-mark">${App.icon('laptop')}</div>
        <div class="brand-text"><strong>Laptop Inventory</strong><span id="org-name">${App.esc(settings.company_name || '')}</span></div>
      </div>
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Collapse sidebar" title="Collapse / expand sidebar">${App.icon('chevrons-left')}</button>
      <nav class="sidebar-nav">${navHtml}</nav>
      <a class="sidebar-profile" href="/profile" data-tooltip="${App.esc(user.full_name)}">
        <div class="avatar" data-user-avatar>${App.esc(App.initials(user.full_name))}</div>
        <div class="meta"><strong data-user-name>${App.esc(user.full_name)}</strong><span data-user-role>${App.esc(user.role)}</span></div>
        ${App.icon('chevron-up')}
      </a>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop'; backdrop.id = 'sidebar-backdrop';

    const wrap = document.createElement('div');
    wrap.className = 'content-wrap';
    wrap.innerHTML = `
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu">${App.icon('menu')}</button>
        <div class="topbar-spacer"></div>
        <div class="dropdown" id="notif-dd">
          <button class="icon-btn" id="notif-btn" aria-label="Notifications" aria-haspopup="true">${App.icon('bell')}<span class="badge-dot" id="notif-count" hidden>0</span></button>
          <div class="dropdown-menu right notif-menu">
            <div class="notif-head"><span>Notifications</span><small class="cell-sub">Recent activity</small></div>
            <div class="notif-list" id="notif-list"><div class="empty">Loading…</div></div>
          </div>
        </div>
        <button class="icon-btn" id="theme-toggle" aria-label="Toggle dark mode"></button>
        <div class="topbar-date" id="topbar-date"></div>
        <div class="dropdown" id="user-dd">
          <button class="user-trigger" aria-haspopup="true" aria-expanded="false">
            <div class="avatar" data-user-avatar>${App.esc(App.initials(user.full_name))}</div>
            <div class="meta"><strong data-user-name>${App.esc(user.full_name)}</strong><span data-user-role>${App.esc(user.role)}</span></div>
            ${App.icon('chevron-down')}
          </button>
          <div class="dropdown-menu right" role="menu">
            <a class="menu-item" href="/profile" role="menuitem">${App.icon('user')} My Profile</a>
            <a class="menu-item" href="/settings" role="menuitem">${App.icon('settings')} Account Settings</a>
            <div class="menu-divider"></div>
            <button class="menu-item danger" id="logout-btn" role="menuitem">${App.icon('log-out')} Logout</button>
          </div>
        </div>
      </header>`;

    document.body.prepend(sidebar, backdrop);
    document.body.appendChild(wrap);
    wrap.appendChild(main);
    $('#topbar-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    updateThemeIcon(); App.icons();

    /* sidebar collapse / expand */
    $('#sidebar-toggle').addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'expanded');
      $('#sidebar-toggle').setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 300); // let charts re-fit
    });
    /* mobile drawer */
    const closeDrawer = () => document.body.classList.remove('drawer-open');
    $('#menu-btn').addEventListener('click', () => document.body.classList.add('drawer-open'));
    backdrop.addEventListener('click', closeDrawer);
    window.addEventListener('resize', () => { if (window.innerWidth > 900) closeDrawer(); });

    /* nav: page transition + "Add Laptop" shortcut when already on inventory */
    sidebar.addEventListener('click', (e) => {
      const link = e.target.closest('a'); if (!link) return;
      if (link.dataset.action === 'add-laptop' && location.pathname === '/inventory' && App.onAddLaptop) {
        e.preventDefault(); closeDrawer(); App.onAddLaptop(); return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey || link.target) return;
      e.preventDefault(); closeDrawer();
      document.body.classList.add('leaving');
      setTimeout(() => { window.location.href = link.getAttribute('href'); }, 110);
    });
    window.addEventListener('pageshow', () => document.body.classList.remove('leaving'));

    /* dropdowns */
    ['user-dd', 'notif-dd'].forEach((id) => {
      const dd = $('#' + id);
      dd.firstElementChild.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !dd.classList.contains('open');
        closeDropdowns(dd); dd.classList.toggle('open', willOpen);
        dd.firstElementChild.setAttribute('aria-expanded', String(willOpen));
        if (id === 'notif-dd' && willOpen) markNotificationsSeen();
      });
    });

    $('#theme-toggle').addEventListener('click', () => {
      App.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    $('#logout-btn').addEventListener('click', async () => {
      closeDropdowns();
      const ok = await App.confirm({ title: 'Log out?', message: 'You’ll need to sign in again to access the dashboard.', confirmText: 'Log out', danger: false, icon: 'log-out' });
      if (!ok) return;
      try { await App.api('/api/auth/logout', { method: 'POST', allow401: true }); } catch (e) { /* ignore */ }
      window.location.href = '/login';
    });

    loadNotifications();
  }

  /* ---------- Notifications ---------- */
  let notifItems = [];
  const actionIcon = (a) => (a.includes('delete') ? 'trash-2' : a.includes('update') ? 'pencil' : a.startsWith('user') ? 'user' : 'plus');
  async function loadNotifications() {
    try {
      const { items } = await App.api('/api/dashboard/notifications');
      notifItems = items; renderNotifications();
    } catch (e) { /* non-critical */ }
  }
  function renderNotifications() {
    const seen = Number(localStorage.getItem('notifSeen') || 0);
    const unread = notifItems.filter((n) => n.id > seen).length;
    const badge = $('#notif-count');
    badge.hidden = unread === 0; badge.textContent = unread > 9 ? '9+' : unread;
    const list = $('#notif-list');
    if (!notifItems.length) { list.innerHTML = '<div class="empty"><strong>You’re all caught up</strong>Activity from your team shows up here.</div>'; return; }
    list.innerHTML = notifItems.map((n) => `
      <div class="notif-item${n.id > seen ? ' unread' : ''}">
        <div class="ico">${App.icon(actionIcon(n.action))}</div>
        <div><p>${App.esc(n.description)}</p><small>${App.esc(n.full_name || 'Someone')} · ${App.timeAgo(n.created_at)}</small></div>
      </div>`).join('');
    App.icons();
  }
  function markNotificationsSeen() {
    if (!notifItems.length) return;
    // Keep the "unread" highlight visible while the menu is open, clear the badge.
    localStorage.setItem('notifSeen', String(Math.max(...notifItems.map((n) => n.id))));
    $('#notif-count').hidden = true;
  }

  /* Refresh name/avatar everywhere after a profile edit */
  App.updateUser = (user) => {
    App.user = user;
    $$('[data-user-name]').forEach((e) => (e.textContent = user.full_name));
    $$('[data-user-role]').forEach((e) => (e.textContent = user.role));
    $$('[data-user-avatar]').forEach((e) => (e.textContent = App.initials(user.full_name)));
  };

  /* ---------- Boot ---------- */
  App.applyTheme(App.getThemePref(), false);
  App.ready = (async () => {
    const [{ user }, { settings }] = await Promise.all([App.api('/api/auth/me'), App.api('/api/settings')]);
    App.user = user; App.settings = settings; App.currency = settings.currency || '₱';
    buildShell(user, settings);
    return { user, settings };
  })();
  App.ready.catch((e) => { if (e && !/Session expired/.test(e.message)) console.error(e); });
})();