/* Chart.js helpers — theme-aware and animated. */
(function () {
  const App = window.App;
  const registry = {};

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const palette = () => [css('--primary'), css('--violet'), css('--success'), css('--warning'), css('--info'), css('--danger'), '#EC4899', css('--secondary')];

  function base() {
    const text = css('--muted');
    return { text, grid: css('--border'), surface: css('--surface') };
  }

  function make(id, build) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    if (registry[id]) registry[id].destroy();
    registry[id] = new window.Chart(canvas, build(base()));
  }

  const emptyPlugin = {
    id: 'emptyState',
    afterDraw(chart) {
      const hasData = chart.data.datasets.some((d) => d.data.some((v) => v > 0));
      if (hasData) return;
      const { ctx, chartArea: a } = chart;
      ctx.save(); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.font = '600 13px sans-serif';
      ctx.fillText('No data yet', (a.left + a.right) / 2, (a.top + a.bottom) / 2); ctx.restore();
    }
  };

  const charts = {
    brandBar(id, rows) {
      make(id, (b) => ({
        type: 'bar',
        data: { labels: rows.map((r) => r.label), datasets: [{ label: 'Laptops', data: rows.map((r) => r.value), backgroundColor: css('--primary'), borderRadius: 8, maxBarThickness: 44 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: b.text } },
            y: { beginAtZero: true, grid: { color: b.grid }, ticks: { color: b.text, precision: 0 } }
          }
        },
        plugins: [emptyPlugin]
      }));
    },
    categoryDoughnut(id, rows) {
      make(id, (b) => ({
        type: 'doughnut',
        data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.value), backgroundColor: palette(), borderColor: b.surface, borderWidth: 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '64%', animation: { animateRotate: true, duration: 1000 },
          plugins: { legend: { position: 'bottom', labels: { color: b.text, usePointStyle: true, boxWidth: 8, padding: 14 } } }
        },
        plugins: [emptyPlugin]
      }));
    },
    activityLine(id, act) {
      const months = act.months.map((m) => {
        const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short' });
      });
      const line = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color + '22', tension: 0.35, fill: label === 'Added', pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5 });
      make(id, (b) => ({
        type: 'line',
        data: { labels: months, datasets: [line('Added', act.added, css('--primary')), line('Updated', act.updated, css('--warning')), line('Removed', act.removed, css('--danger'))] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 1000, easing: 'easeOutCubic' },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom', labels: { color: b.text, usePointStyle: true, boxWidth: 8, padding: 14 } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: b.text } },
            y: { beginAtZero: true, grid: { color: b.grid }, ticks: { color: b.text, precision: 0 } }
          }
        },
        plugins: [emptyPlugin]
      }));
    }
  };

  App.charts = charts;
})();
