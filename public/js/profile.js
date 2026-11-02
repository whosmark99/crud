/* Profile page + Settings page (profile form, password form, theme, table prefs, app settings). */
(function () {
  const App = window.App;
  const { $, $$, esc } = App;
  const page = document.body.dataset.page;

  function fillProfile(user) {
    if ($('#pf-avatar')) $('#pf-avatar').textContent = App.initials(user.full_name);
    if ($('#pf-name')) $('#pf-name').textContent = user.full_name;
    if ($('#pf-role')) $('#pf-role').textContent = user.role;
    if ($('#pf-fullname')) $('#pf-fullname').textContent = user.full_name;
    if ($('#pf-username')) $('#pf-username').textContent = user.username;
    if ($('#pf-email')) $('#pf-email').textContent = user.email;
    if ($('#pf-created')) $('#pf-created').textContent = App.fmtDate(user.created_at);
  }

  function setupProfileForm() {
    const form = $('#profile-form'); if (!form) return;
    const fill = () => { ['full_name', 'username', 'email'].forEach((k) => { form.elements[k].value = App.user[k]; }); App.clearErrors(form); };
    fill();
    const open = $('#edit-profile-btn');
    if (open) open.addEventListener('click', () => { fill(); App.openModal('profile-modal'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); App.clearErrors(form);
      const btn = form.querySelector('[type=submit]'); App.setLoading(btn, true);
      try {
        const res = await App.api('/api/profile', { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
        App.updateUser(res.user); fillProfile(res.user);
        App.closeModal('profile-modal'); App.toast(res.message);
      } catch (err) {
        if (err.errors && Object.keys(err.errors).length) App.showErrors(form, err.errors);
        App.toast(err.message, 'error');
      } finally { App.setLoading(btn, false); }
    });
    const reset = $('#profile-reset'); if (reset) reset.addEventListener('click', fill);
  }

  function setupPasswordForm() {
    const form = $('#password-form'); if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); App.clearErrors(form);
      const body = Object.fromEntries(new FormData(form));
      const errs = {};
      if (!body.current_password) errs.current_password = 'Enter your current password.';
      if (!body.new_password || body.new_password.length < 8) errs.new_password = 'Use at least 8 characters.';
      if (body.new_password !== body.confirm_password) errs.confirm_password = 'Passwords do not match.';
      if (Object.keys(errs).length) return App.showErrors(form, errs);
      const btn = form.querySelector('[type=submit]'); App.setLoading(btn, true);
      try {
        const res = await App.api('/api/profile/password', { method: 'POST', body });
        form.reset(); App.toast(res.message);
      } catch (err) {
        if (err.errors && Object.keys(err.errors).length) App.showErrors(form, err.errors);
        App.toast(err.message, 'error');
      } finally { App.setLoading(btn, false); }
    });
  }

  function setupSettings() {
    if (page !== 'settings') return;
    // Theme preference
    const seg = $('#theme-seg');
    const sync = () => $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.theme === App.getThemePref()));
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; App.setTheme(b.dataset.theme); sync(); App.toast('Theme updated.'); });
    sync();
    // Table preference
    const rows = $('#pref-rows'); rows.value = localStorage.getItem('rows') || '10';
    rows.addEventListener('change', () => { localStorage.setItem('rows', rows.value); App.toast('Rows per page saved.'); });
    // Sidebar preference
    const side = $('#pref-sidebar'); side.checked = localStorage.getItem('sidebar') === 'collapsed';
    side.addEventListener('change', () => {
      document.body.classList.toggle('sidebar-collapsed', side.checked);
      localStorage.setItem('sidebar', side.checked ? 'collapsed' : 'expanded'); App.toast('Sidebar preference saved.');
    });
    // Application settings (administrators only)
    const form = $('#app-settings-form');
    const isAdmin = App.user.role === 'Administrator';
    form.elements.company_name.value = App.settings.company_name || '';
    form.elements.currency.value = App.settings.currency || '';
    if (!isAdmin) {
      Array.from(form.elements).forEach((el) => (el.disabled = true));
      $('#admin-note').hidden = false;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); App.clearErrors(form);
      const btn = form.querySelector('[type=submit]'); App.setLoading(btn, true);
      try {
        const res = await App.api('/api/settings', { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
        App.settings = res.settings; App.currency = res.settings.currency;
        $('#org-name').textContent = res.settings.company_name;
        App.toast(res.message);
      } catch (err) {
        if (err.errors && Object.keys(err.errors).length) App.showErrors(form, err.errors);
        App.toast(err.message, 'error');
      } finally { App.setLoading(btn, false); }
    });
  }

  App.ready.then(() => {
    App.bindPasswordToggles();
    fillProfile(App.user);
    setupProfileForm(); setupPasswordForm(); setupSettings();
  });
})();
