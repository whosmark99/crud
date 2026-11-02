/* Laptop inventory: list, search, filter, sort, paginate + reusable Add/Edit modal. */
(function () {
  const App = window.App;
  const { $, $$, esc } = App;

  const state = {
    page: 1, limit: Number(localStorage.getItem('rows')) || 10,
    q: '', brand: '', category: '', status: '', sort: 'date', order: 'desc'
  };
  let items = [];
  const selected = new Set();
  let editingId = null;
  let removeImage = false;
  let reqToken = 0;

  const form = $('#laptop-form');

  /* ---------- Lookups ---------- */
  async function loadLookups() {
    const [b, c] = await Promise.all([App.api('/api/brands'), App.api('/api/categories')]);
    const opts = (rows, ph) => `<option value="">${ph}</option>` + rows.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    const keepFilter = (sel, html) => { const v = sel.value; sel.innerHTML = html; sel.value = v; };
    keepFilter($('#f-brand'), opts(b.items, 'All brands'));
    keepFilter($('#f-category'), opts(c.items, 'All categories'));
    form.elements.brand_id.innerHTML = opts(b.items, 'Select brand');
    state.brand = $('#f-brand').value; state.category = $('#f-category').value;
    return { brands: b.items, categories: c.items };
  }

  /* ---------- Table ---------- */
  function skeleton() {
    $('#tbody').innerHTML = Array.from({ length: 8 }).map(() =>
      `<tr>${Array.from({ length: 8 }).map((_, i) => `<td><span class="skeleton" style="width:${50 + (i * 9) % 45}%"></span></td>`).join('')}</tr>`).join('');
  }

  function thumb(r) {
    return r.image
      ? `<img class="thumb" src="/uploads/${encodeURIComponent(r.image)}" alt="" loading="lazy">`
      : `<span class="thumb">${App.icon('laptop')}</span>`;
  }

  function renderRows() {
    const tbody = $('#tbody');
    if (!items.length) {
      const filtered = state.q || state.brand || state.category || state.status;
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty">${App.icon(filtered ? 'search-x' : 'laptop')}
        <strong>${filtered ? 'No laptops match your filters' : 'No laptops yet'}</strong>
        ${filtered ? 'Try a different search or clear the filters.' : 'Add your first laptop to start tracking inventory.'}
        <div style="margin-top:14px">${filtered ? '<button class="btn btn-sm" id="clear-filters">Clear filters</button>' : '<button class="btn btn-primary btn-sm" data-add>Add laptop</button>'}</div></div></td></tr>`;
      App.icons(); return;
    }
    tbody.innerHTML = items.map((r) => `
      <tr data-id="${r.id}">
        <td><div style="display:flex;align-items:center;gap:12px">${thumb(r)}
          <div><div class="cell-strong">${esc(r.laptop_name)}</div>${r.model && r.model !== r.laptop_name ? `<div class="cell-sub">${esc(r.model)}</div>` : ''}</div></div></td>
        <td>${esc(r.brand_name)}</td>
        <td>${esc(r.processor || '—')}</td>
        <td>${esc(r.ram || '—')}</td>
        <td>${esc(r.storage || '—')}</td>
        <td class="num">${App.money(r.price)}</td>
        <td>${App.statusBadge(r.status)}</td>
        <td class="actions">
          <button class="row-btn" data-act="view" title="View details" aria-label="View ${esc(r.laptop_name)}">${App.icon('eye')}</button>
          <button class="row-btn" data-act="edit" title="Edit" aria-label="Edit ${esc(r.laptop_name)}">${App.icon('pencil')}</button>
          <button class="row-btn danger" data-act="delete" title="Delete" aria-label="Delete ${esc(r.laptop_name)}">${App.icon('trash-2')}</button>
        </td>
      </tr>`).join('');
    App.icons(); syncSelectAll();
  }

  function pageList(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, total, cur, cur - 1, cur + 1]);
    if (cur <= 3) { set.add(2); set.add(3); set.add(4); }
    if (cur >= total - 2) { set.add(total - 1); set.add(total - 2); set.add(total - 3); }
    const arr = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    arr.forEach((n, i) => { if (i && n - arr[i - 1] > 1) out.push('…'); out.push(n); });
    return out;
  }

  function renderPager(meta) {
    const from = meta.total ? (meta.page - 1) * meta.limit + 1 : 0;
    const to = Math.min(meta.total, meta.page * meta.limit);
    $('#page-info').textContent = meta.total ? `Showing ${from}–${to} of ${meta.total} laptop${meta.total === 1 ? '' : 's'}` : 'No results';
    $('#pager').innerHTML =
      `<button data-p="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${App.icon('chevron-left')}</button>` +
      pageList(meta.page, meta.pages).map((p) => p === '…' ? '<span class="gap">…</span>' : `<button data-p="${p}" class="${p === meta.page ? 'active' : ''}" ${p === meta.page ? 'aria-current="page"' : ''}>${p}</button>`).join('') +
      `<button data-p="${meta.page + 1}" ${meta.page >= meta.pages ? 'disabled' : ''} aria-label="Next page">${App.icon('chevron-right')}</button>`;
    App.icons();
  }

  function updateSortUI() {
    $$('th[data-sort]').forEach((th) => {
      const on = th.dataset.sort === state.sort;
      th.setAttribute('aria-sort', on ? (state.order === 'asc' ? 'ascending' : 'descending') : 'none');
      th.querySelector('.sort-ind').textContent = on ? (state.order === 'asc' ? '↑' : '↓') : '';
    });
    App.icons();
  }

  async function load({ showSkeleton = true } = {}) {
    const token = ++reqToken;
    if (showSkeleton) skeleton();
    const params = new URLSearchParams({ page: state.page, limit: state.limit, sort: state.sort, order: state.order });
    ['q', 'brand', 'category', 'status'].forEach((k) => state[k] && params.set(k, state[k]));
    try {
      const data = await App.api('/api/laptops?' + params);
      if (token !== reqToken) return; // stale response
      items = data.items; state.page = data.page;
      renderRows(); renderPager(data); updateBulk();
    } catch (e) {
      if (token !== reqToken) return;
      $('#tbody').innerHTML = `<tr><td colspan="8"><div class="empty"><strong>Couldn’t load laptops</strong>${esc(e.message)}<div style="margin-top:14px"><button class="btn btn-sm" id="retry">Try again</button></div></div></td></tr>`;
    }
  }

  /* ---------- Selection ---------- */
  function syncSelectAll() {
    const boxes = $$('.row-check');
    const all = $('#select-all');
    if (!all) return;
    all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
    all.indeterminate = !all.checked && boxes.some((b) => b.checked);
  }
  function updateBulk() {
    const bar = $('#bulk-bar');
    if (!bar) return;
    bar.hidden = selected.size === 0;
    $('#bulk-count').textContent = `${selected.size} selected`;
  }

  /* ---------- Modal: add / edit (single reusable component) ---------- */
  const RAM_OPTIONS = ['4GB', '8GB', '12GB', '16GB', '24GB', '32GB', '64GB'];

  function fillRam(current) {
    const sel = form.elements.ram;
    const list = current && !RAM_OPTIONS.includes(current) ? [...RAM_OPTIONS, current] : RAM_OPTIONS;
    sel.innerHTML = '<option value="">Select RAM</option>' + list.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    sel.value = current || '';
  }

  function resetPreview(src) {
    $('#img-preview').innerHTML = src ? `<img src="${src}" alt="Laptop preview">` : App.icon('image-plus');
    $('#remove-img').hidden = !src;
    App.icons();
  }

  function pickImage(file) {
    if (!file) return;
    const input = $('#image-input');
    const field = input.closest('.field');
    const err = field.querySelector('.field-error');
    field.classList.remove('invalid'); err.textContent = '';
    const fail = (msg) => { field.classList.add('invalid'); err.textContent = msg; input.value = ''; };
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return fail('Use a JPG, PNG, WEBP or GIF image.');
    if (file.size > 3 * 1024 * 1024) return fail('Image must be 3 MB or smaller.');
    removeImage = false;
    const reader = new FileReader();
    reader.onload = () => resetPreview(reader.result);
    reader.readAsDataURL(file);
  }

  function openForm(laptop) {
    editingId = laptop ? laptop.id : null; removeImage = false;
    form.reset(); App.clearErrors(form);
    $('#modal-title').textContent = laptop ? 'Edit Laptop' : 'Add New Laptop';
    $('#modal-sub').textContent = laptop ? 'Update the selected laptop information.' : 'Enter the laptop information below.';
    $('#modal-icon').innerHTML = App.icon(laptop ? 'pencil' : 'laptop');
    $('#save-icon').innerHTML = App.icon(laptop ? 'save' : 'plus');
    $('#save-label').textContent = laptop ? 'Update Laptop' : 'Save Laptop';
    App.icons();
    fillRam(laptop ? laptop.ram : '');
    $('#image-input').value = '';
    resetPreview(laptop && laptop.image ? `/uploads/${encodeURIComponent(laptop.image)}` : '');
    if (laptop) {
      ['laptop_name', 'brand_id', 'processor', 'storage', 'status'].forEach((k) => { form.elements[k].value = laptop[k] ?? ''; });
      form.elements.price.value = laptop.price ? laptop.price : '';
    }
    App.openModal('laptop-modal');
    $('.modal-body', $('#laptop-modal')).scrollTop = 0;
  }
  App.onAddLaptop = () => openForm(null);
  App.onSearch = (q) => { $('#search').value = q; state.q = q; state.page = 1; load(); };

  function validateClient() {
    const errors = {};
    if (!form.elements.laptop_name.value.trim()) errors.laptop_name = 'Enter the laptop name.';
    if (!form.elements.brand_id.value) errors.brand_id = 'Choose a brand.';
    const price = form.elements.price.value.trim();
    if (price !== '' && (Number.isNaN(Number(price)) || Number(price) < 0)) errors.price = 'Enter a valid price (0 or more).';
    return errors;
  }

  async function submitForm(e) {
    e.preventDefault();
    App.clearErrors(form);
    const errors = validateClient();
    if (Object.keys(errors).length) { App.showErrors(form, errors); return; }
    const fd = new FormData(form);
    if (!$('#image-input').files.length) fd.delete('image');
    if (editingId && removeImage) fd.set('remove_image', '1');
    const btn = $('#save-btn'); App.setLoading(btn, true);
    try {
      await App.api(editingId ? `/api/laptops/${editingId}` : '/api/laptops', { method: editingId ? 'PUT' : 'POST', body: fd });
      App.closeModal('laptop-modal');
      App.toast(editingId ? 'Changes saved.' : 'Laptop added.');
      if (!editingId) { state.page = 1; state.sort = 'date'; state.order = 'desc'; updateSortUI(); }
      await load({ showSkeleton: false });
    } catch (err) {
      if (err.errors && Object.keys(err.errors).length) App.showErrors(form, err.errors);
      App.toast(err.message, 'error');
    } finally { App.setLoading(btn, false); }
  }

  /* ---------- View details ---------- */
  function openView(r) {
    // Show only the details this laptop actually has.
    const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
    const autoSerial = /^LAP-[0-9A-F]+$/i.test(r.serial_number || '');
    const fields = [
      ['Brand', r.brand_name],
      ['Processor', r.processor],
      ['RAM', r.ram],
      ['Storage', r.storage],
      ['Price', App.money(r.price)],
      ['Model', has(r.model) && r.model !== r.laptop_name ? r.model : ''],
      ['Serial number', autoSerial ? '' : r.serial_number],
      ['Graphics card', r.graphics_card],
      ['Operating system', r.operating_system],
      ['Screen size', r.screen_size],
      ['Quantity', Number(r.quantity) > 1 ? r.quantity : ''],
      ['Purchase date', r.purchase_date ? App.fmtDate(r.purchase_date) : ''],
      ['Date added', App.fmtDate(r.created_at)]
    ].filter(([, v]) => has(v));

    $('#view-body').innerHTML = `
      <div class="detail-hero">
        <div class="pic">${r.image ? `<img src="/uploads/${encodeURIComponent(r.image)}" alt="${esc(r.laptop_name)}">` : App.icon('laptop')}</div>
        <div><h3 style="font-size:20px;margin-bottom:8px">${esc(r.laptop_name)}</h3>
          <div>${App.statusBadge(r.status)}</div></div>
      </div>
      <dl class="detail-grid">
        ${fields.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
        ${has(r.description) ? `<div style="grid-column:1/-1"><dt>Description</dt><dd style="font-weight:500;white-space:pre-wrap">${esc(r.description)}</dd></div>` : ''}
      </dl>`;
    $('#view-edit').onclick = () => { App.closeModal('view-modal'); openForm(r); };
    App.icons(); App.openModal('view-modal');
  }

  async function fetchOne(id) {
    try { return (await App.api(`/api/laptops/${id}`)).item; }
    catch (e) { App.toast(e.message, 'error'); return null; }
  }

  /* ---------- Delete ---------- */
  async function deleteOne(r) {
    const ok = await App.confirm({ title: 'Delete this laptop?', message: `“${r.laptop_name}” (${r.serial_number}) will be permanently removed.`, confirmText: 'Delete laptop' });
    if (!ok) return;
    try {
      await App.api(`/api/laptops/${r.id}`, { method: 'DELETE' });
      selected.delete(r.id); App.toast('Laptop deleted.');
      if (items.length === 1 && state.page > 1) state.page -= 1;
      await load({ showSkeleton: false });
    } catch (e) { App.toast(e.message, 'error'); }
  }
  async function deleteSelected() {
    const ids = [...selected];
    const ok = await App.confirm({ title: `Delete ${ids.length} laptop${ids.length === 1 ? '' : 's'}?`, message: 'The selected laptops will be permanently removed.', confirmText: 'Delete selected' });
    if (!ok) return;
    try {
      const res = await App.api('/api/laptops/bulk-delete', { method: 'POST', body: { ids } });
      selected.clear(); App.toast(res.message); await load({ showSkeleton: false });
    } catch (e) { App.toast(e.message, 'error'); }
  }

  /* ---------- Events ---------- */
  function resetFilters() {
    Object.assign(state, { q: '', brand: '', category: '', status: '', page: 1 });
    $('#search').value = ''; $('#f-brand').value = ''; $('#f-category').value = ''; $('#f-status').value = '';
    load();
  }

  function bind() {
    $('#btn-add').addEventListener('click', () => openForm(null));
    form.addEventListener('submit', submitForm);

    $('#search').addEventListener('input', App.debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300));
    $('#f-brand').addEventListener('change', (e) => { state.brand = e.target.value; state.page = 1; load(); });
    $('#f-category').addEventListener('change', (e) => { state.category = e.target.value; state.page = 1; load(); });
    $('#f-status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
    $('#page-size').addEventListener('change', (e) => { state.limit = Number(e.target.value); localStorage.setItem('rows', state.limit); state.page = 1; load(); });
    $$('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      if (state.sort === th.dataset.sort) state.order = state.order === 'asc' ? 'desc' : 'asc';
      else { state.sort = th.dataset.sort; state.order = th.dataset.sort === 'price' || th.dataset.sort === 'date' ? 'desc' : 'asc'; }
      state.page = 1; updateSortUI(); load();
    }));

    $('#pager').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]'); if (!b || b.disabled) return;
      state.page = Number(b.dataset.p); load(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#tbody').addEventListener('click', async (e) => {
      if (e.target.closest('#clear-filters')) return resetFilters();
      if (e.target.closest('#retry')) return load();
      if (e.target.closest('[data-add]')) return openForm(null);
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const tr = btn.closest('tr'); const r = items.find((x) => x.id === Number(tr.dataset.id)); if (!r) return;
      if (btn.dataset.act === 'view') openView(r);
      else if (btn.dataset.act === 'edit') openForm(r);
      else deleteOne(r);
    });
    $('#tbody').addEventListener('change', (e) => {
      const box = e.target.closest('.row-check'); if (!box) return;
      const id = Number(box.dataset.id);
      box.checked ? selected.add(id) : selected.delete(id);
      syncSelectAll(); updateBulk();
    });
    $('#select-all')?.addEventListener('change', (e) => {
      $$('.row-check').forEach((b) => { b.checked = e.target.checked; const id = Number(b.dataset.id); e.target.checked ? selected.add(id) : selected.delete(id); });
      updateBulk();
    });
    $('#bulk-clear')?.addEventListener('click', () => { selected.clear(); $$('.row-check').forEach((b) => (b.checked = false)); syncSelectAll(); updateBulk(); });
    $('#bulk-delete')?.addEventListener('click', deleteSelected);

    /* image upload: click, choose, drag & drop */
    const drop = $('#upload-drop');
    $('#image-input').addEventListener('change', (e) => pickImage(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0]; if (!file) return;
      const dt = new DataTransfer(); dt.items.add(file); $('#image-input').files = dt.files; pickImage(file);
    });
    $('#remove-img').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      $('#image-input').value = ''; removeImage = true; resetPreview('');
    });


  }

  App.ready.then(async () => {
    $('#page-size').value = String(state.limit);
    // Initial state from URL (?q=, ?add=1, ?view=ID)
    const url = new URL(location.href);
    if (url.searchParams.get('q')) { state.q = url.searchParams.get('q'); $('#search').value = state.q; }
    bind(); updateSortUI();
    try { await loadLookups(); } catch (e) { App.toast(e.message, 'error'); }
    await load();
    if (url.searchParams.get('add') === '1') openForm(null);
    const viewId = Number(url.searchParams.get('view'));
    if (viewId) { const r = await fetchOne(viewId); if (r) openView(r); }
    if (url.search) history.replaceState(null, '', '/inventory');
  });
})();