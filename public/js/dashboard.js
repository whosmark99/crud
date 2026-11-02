(function () {
  const App = window.App;
  const { $, esc } = App;
  let data = null;

  const CARDS = [
    { key: 'total', label: 'Total laptops', icon: 'laptop', accent: 'primary' },
    { key: 'available', label: 'Available', icon: 'circle-check', accent: 'success' },
    { key: 'borrowed', label: 'Borrowed', icon: 'hand-helping', accent: 'violet' },
    { key: 'maintenance', label: 'Under maintenance', icon: 'wrench', accent: 'warning' },
    { key: 'out_of_stock', label: 'Out of stock', icon: 'package-x', accent: 'danger' }
  ];

  function countUp(el, to) {
    const dur = 700, start = performance.now();
    if (!to) { el.textContent = '0'; return; }
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderCards(totals) {
    $('#stats').innerHTML = CARDS.map((c, i) => `
      <div class="card stat-card accent-${c.accent}" style="--i:${i}">
        <div class="stat-icon">${App.icon(c.icon)}</div>
        <div><strong data-count="${totals[c.key]}">0</strong><span>${c.label}</span></div>
      </div>`).join('');
    App.icons();
    document.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
  }

  function renderRecent(rows) {
    const body = $('#recent-body');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty">${App.icon('laptop')}<strong>No laptops yet</strong>Add your first laptop to see it here.<br><a class="btn btn-primary btn-sm" style="margin-top:14px" href="/inventory?add=1">Add laptop</a></div></td></tr>`;
      App.icons(); return;
    }
    body.innerHTML = rows.map((r) => `
      <tr>
        <td><span class="cell-strong">${esc(r.laptop_name)}</span></td>
        <td>${esc(r.brand_name)}</td>
        <td>${esc(r.model)}</td>
        <td>${esc(r.serial_number)}</td>
        <td>${App.statusBadge(r.status)}</td>
        <td>${App.fmtDate(r.created_at)}</td>
        <td class="actions"><a class="row-btn" href="/inventory?view=${r.id}" title="View details" aria-label="View ${esc(r.laptop_name)}">${App.icon('eye')}</a></td>
      </tr>`).join('');
    App.icons();
  }

  function renderActivity(rows) {
    const ul = $('#activity');
    if (!rows.length) { ul.innerHTML = '<li><div class="empty" style="width:100%;padding:24px 0">No laptop activity yet.</div></li>'; return; }
    ul.innerHTML = rows.map((a) => {
      const kind = a.action.split('.')[1];
      const icon = kind === 'delete' ? 'trash-2' : kind === 'update' ? 'pencil' : 'plus';
      return `<li><div class="dot ${kind}">${App.icon(icon)}</div>
        <div><p>${esc(a.description)}</p><small>${esc(a.full_name || 'Someone')} · ${App.timeAgo(a.created_at)}</small></div></li>`;
    }).join('');
    App.icons();
  }

  function drawCharts() {
    if (!data) return;
    App.charts.brandBar('chart-brand', data.byBrand);
    App.charts.activityLine('chart-activity', data.activity);
  }

  async function load() {
    try {
      data = await App.api('/api/dashboard/stats');
      renderCards(data.totals); renderRecent(data.recentLaptops); renderActivity(data.recentActivity); drawCharts();
    } catch (e) {
      App.toast(e.message, 'error');
      $('#recent-body').innerHTML = '<tr><td colspan="7"><div class="empty"><strong>Couldn’t load the dashboard</strong>Refresh the page to try again.</div></td></tr>';
    }
  }

  window.addEventListener('themechange', drawCharts);
  App.ready.then(() => {
    const first = App.user.full_name.split(' ')[0];
    $('#greeting').textContent = `Welcome back, ${first}`;
    load();
  });
})();