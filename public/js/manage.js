/* Brands & Categories management (same component, two configs). */
(function () {
  const App = window.App;
  const { $, esc } = App;
  const page = document.body.dataset.page;
  const cfg = {
    brands: { endpoint: '/api/brands', label: 'Brand', plural: 'brands', icon: 'award' },
    categories: { endpoint: '/api/categories', label: 'Category', plural: 'categories', icon: 'tags' }
  }[page];
  if (!cfg) return;

  let rows = [];
  let editing = null;
  const form = $('#name-form');

  function render() {
    const q = $('#filter').value.trim().toLowerCase();
    const list = rows.filter((r) => r.name.toLowerCase().includes(q));
    $('#count').textContent = `${rows.length} ${rows.length === 1 ? cfg.label.toLowerCase() : cfg.plural}`;
    if (!list.length) {
      $('#tbody').innerHTML = `<tr><td colspan="4"><div class="empty">${App.icon(cfg.icon)}<strong>${q ? 'No matches' : `No ${cfg.plural} yet`}</strong>${q ? 'Try a different search.' : `Add your first ${cfg.label.toLowerCase()}.`}</div></td></tr>`;
      App.icons(); return;
    }
    $('#tbody').innerHTML = list.map((r) => `
      <tr data-id="${r.id}">
        <td class="cell-strong">${esc(r.name)}</td>
        <td>${r.laptop_count} laptop${r.laptop_count === 1 ? '' : 's'}</td>
        <td>${App.fmtDate(r.created_at)}</td>
        <td class="actions">
          <button class="row-btn" data-act="edit" title="Edit" aria-label="Edit ${esc(r.name)}">${App.icon('pencil')}</button>
          <button class="row-btn danger" data-act="delete" title="Delete" aria-label="Delete ${esc(r.name)}">${App.icon('trash-2')}</button>
        </td>
      </tr>`).join('');
    App.icons();
  }

  async function load() {
    try { rows = (await App.api(cfg.endpoint)).items; render(); }
    catch (e) { App.toast(e.message, 'error'); $('#tbody').innerHTML = '<tr><td colspan="4"><div class="empty"><strong>Couldn’t load the list</strong>Refresh to try again.</div></td></tr>'; }
  }

  function openForm(row) {
    editing = row || null;
    form.reset(); App.clearErrors(form);
    $('#modal-title').textContent = row ? `Edit ${cfg.label.toLowerCase()}` : `Add ${cfg.label.toLowerCase()}`;
    $('#save-label').textContent = row ? 'Save changes' : `Add ${cfg.label.toLowerCase()}`;
    if (row) form.elements.name.value = row.name;
    App.openModal('name-modal');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); App.clearErrors(form);
    const name = form.elements.name.value.trim();
    if (name.length < 2) return App.showErrors(form, { name: `Enter a ${cfg.label.toLowerCase()} name (2+ characters).` });
    const btn = $('#save-btn'); App.setLoading(btn, true);
    try {
      const res = await App.api(editing ? `${cfg.endpoint}/${editing.id}` : cfg.endpoint, { method: editing ? 'PUT' : 'POST', body: { name } });
      App.closeModal('name-modal'); App.toast(res.message); await load();
    } catch (err) {
      if (err.errors && err.errors.name) App.showErrors(form, err.errors); else App.toast(err.message, 'error');
    } finally { App.setLoading(btn, false); }
  });

  $('#tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const row = rows.find((r) => r.id === Number(btn.closest('tr').dataset.id)); if (!row) return;
    if (btn.dataset.act === 'edit') return openForm(row);
    const ok = await App.confirm({
      title: `Delete ${cfg.label.toLowerCase()}?`,
      message: row.laptop_count ? `“${row.name}” is used by ${row.laptop_count} laptop${row.laptop_count === 1 ? '' : 's'}, so it can’t be deleted until they’re reassigned.` : `“${row.name}” will be permanently removed.`,
      confirmText: `Delete ${cfg.label.toLowerCase()}`
    });
    if (!ok) return;
    try { const res = await App.api(`${cfg.endpoint}/${row.id}`, { method: 'DELETE' }); App.toast(res.message); await load(); }
    catch (err) { App.toast(err.message, 'error'); }
  });

  $('#btn-add').addEventListener('click', () => openForm(null));
  $('#filter').addEventListener('input', render);
  App.ready.then(load);
})();
