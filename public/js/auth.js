/* Login + Register pages */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* theme (persisted, shared with the dashboard) */
  const stored = () => localStorage.getItem('theme') || 'light';
  const resolve = (p) => (p === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p);
  const setIcon = () => {
    const btn = $('#theme-toggle'); if (!btn) return;
    btn.innerHTML = `<i data-lucide="${document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
    window.lucide && window.lucide.createIcons();
  };
  document.documentElement.dataset.theme = resolve(stored());
  const themeBtn = $('#theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('theme-anim'); setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
    localStorage.setItem('theme', next); document.documentElement.dataset.theme = next; setIcon();
  });

  /* toast */
  function toast(msg, type = 'success') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="t-ico"><i data-lucide="${type === 'error' ? 'circle-alert' : 'circle-check'}"></i></span><div class="t-text">${esc(msg)}</div>`;
    box.appendChild(el); window.lucide && window.lucide.createIcons();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, type === 'error' ? 5500 : 3500);
  }

  /* show / hide password */
  $$('.toggle-pw').forEach((btn) => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    window.lucide && window.lucide.createIcons();
  }));

  const form = $('#auth-form'); if (!form) return;
  const mode = form.dataset.mode;

  const clear = () => {
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    $$('.field-error', form).forEach((e) => (e.textContent = ''));
  };
  const show = (errors) => {
    let first = null;
    Object.entries(errors).forEach(([name, msg]) => {
      const input = form.elements[name]; if (!input) return;
      const f = input.closest('.field'); f.classList.add('invalid');
      f.querySelector('.field-error').textContent = msg; if (!first) first = input;
    });
    if (first) first.focus();
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(v) {
    const e = {};
    if (mode === 'login') {
      if (!v.identifier.trim()) e.identifier = 'Enter your username or email.';
      if (!v.password) e.password = 'Enter your password.';
    } else {
      if (v.full_name.trim().length < 2) e.full_name = 'Enter your full name.';
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(v.username.trim())) e.username = 'Use 3–30 letters, numbers, dots, dashes or underscores.';
      if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.';
      if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Use 8+ characters with a letter and a number.';
      if (v.password !== v.confirm_password) e.confirm_password = 'Passwords do not match.';
    }
    return e;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); clear();
    const v = Object.fromEntries(new FormData(form));
    if (mode === 'login') v.remember = form.elements.remember.checked;
    const errs = validate(v);
    if (Object.keys(errs).length) return show(errs);

    const btn = $('button[type=submit]', form);
    btn.classList.add('loading'); btn.disabled = true;
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v), credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.errors) show(data.errors);
        toast(data.error || 'Something went wrong. Please try again.', 'error');
        return;
      }
      if (mode === 'login') { toast(data.message || 'Welcome back!'); setTimeout(() => (window.location.href = data.redirect || '/dashboard'), 500); }
      else { toast(data.message); setTimeout(() => (window.location.href = '/login?registered=1'), 900); }
    } catch (e) {
      toast('Can’t reach the server. Check your connection and try again.', 'error');
    } finally { btn.classList.remove('loading'); btn.disabled = false; }
  });

  if (new URLSearchParams(location.search).get('registered')) setTimeout(() => toast('Account created. Sign in to continue.'), 250);
  setIcon();
})();
