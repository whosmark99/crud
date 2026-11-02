(function () {
  const App = window.App;
  const { $, $$, esc } = App;
  let type = 'inventory';
  let loadedTitle = '';

  const today = () => new Date().toISOString().slice(0, 10);

  function query() {
    const p = new URLSearchParams();
    if ($('#from').value) p.set('from', $('#from').value);
    if ($('#to').value) p.set('to', $('#to').value);
    return p.toString();
  }

  async function run() {
    const from = $('#from').value, to = $('#to').value;
    if (from && to && from > to) { App.toast('“From” date must be on or before “To” date.', 'warning'); return; }
    $('#report-body').innerHTML = Array.from({ length: 5 }).map(() => `<tr>${Array.from({ length: 7 }).map(() => '<td><span class="skeleton"></span></td>').join('')}</tr>`).join('');
    try {
      const q = query();
      const data = await App.api(`/api/reports/${type}${q ? '?' + q : ''}`);
      loadedTitle = data.title;
      $('#report-title').textContent = data.title;
      $('#sum-records').textContent = data.summary.records.toLocaleString();
      $('#sum-units').textContent = data.summary.units.toLocaleString();
      $('#sum-value').textContent = App.money(data.summary.total_value);
      $('#export-btn').disabled = !data.rows.length;
      if (!data.rows.length) {
        $('#report-body').innerHTML = `<tr><td colspan="7"><div class="empty">${App.icon('file-search')}<strong>No records for this report</strong>Try a different date range.</div></td></tr>`;
      } else {
        $('#report-body').innerHTML = data.rows.map((r) => `
          <tr>
            <td><div class="cell-strong">${esc(r.laptop_name)}</div><div class="cell-sub">${esc(r.model)}</div></td>
            <td>${esc(r.brand_name)}</td>
            <td>${App.statusBadge(r.status)}</td>
            <td class="num">${r.quantity}</td><td class="num">${App.money(r.price)}</td><td class="num">${App.money(r.total_value)}</td>
            <td>${App.fmtDate(r.created_at)}</td>
          </tr>`).join('');
      }
      App.icons();
    } catch (e) {
      App.toast(e.message, 'error');
      $('#report-body').innerHTML = '<tr><td colspan="7"><div class="empty"><strong>Couldn’t build the report</strong>Try again in a moment.</div></td></tr>';
    }
  }

  function bind() {
    $$('#report-tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('#report-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      type = b.dataset.type; run();
    }));
    $('#run-btn').addEventListener('click', run);
    $('#clear-btn').addEventListener('click', () => { $('#from').value = ''; $('#to').value = ''; run(); });
    $('#export-btn').addEventListener('click', () => {
      const q = query();
      window.location.href = `/api/reports/${type}/export${q ? '?' + q : ''}`;
      App.toast(`Exporting “${loadedTitle}” as CSV…`, 'info');
    });
    $('#to').max = today();
  }

  App.ready.then(() => { bind(); run(); });
})();