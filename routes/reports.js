const express = require('express');
const db = require('../database/database');

const router = express.Router();

const REPORTS = {
  inventory:   { title: 'Total inventory report',    where: '1=1',                      order: 'l.created_at DESC' },
  available:   { title: 'Available laptops report',  where: "l.status = 'Available'",   order: 'l.laptop_name COLLATE NOCASE' },
  borrowed:    { title: 'Borrowed laptops report',   where: "l.status = 'Borrowed'",    order: 'l.laptop_name COLLATE NOCASE' },
  maintenance: { title: 'Maintenance report',        where: "l.status = 'Maintenance'", order: 'l.laptop_name COLLATE NOCASE' },
  value:       { title: 'Inventory value report',    where: '1=1',                      order: '(l.price * l.quantity) DESC' }
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function runReport(type, from, to) {
  const def = REPORTS[type];
  if (!def) return null;
  const where = [def.where];
  const params = [];
  if (DATE_RE.test(from || '')) { where.push('date(l.created_at) >= ?'); params.push(from); }
  if (DATE_RE.test(to || ''))   { where.push('date(l.created_at) <= ?'); params.push(to); }

  const rows = db.prepare(`
    SELECT l.id, l.laptop_name, b.brand_name, c.category_name, l.model, l.serial_number, l.status,
           l.quantity, l.price, (l.price * l.quantity) AS total_value, l.purchase_date, l.created_at
    FROM laptops l
    JOIN brands b ON b.id = l.brand_id
    JOIN categories c ON c.id = l.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${def.order}, l.id DESC
  `).all(...params);

  const summary = {
    records: rows.length,
    units: rows.reduce((s, r) => s + r.quantity, 0),
    total_value: rows.reduce((s, r) => s + r.total_value, 0)
  };
  return { title: def.title, rows, summary };
}

router.get('/:type', (req, res) => {
  const result = runReport(req.params.type, req.query.from, req.query.to);
  if (!result) return res.status(404).json({ error: 'Unknown report.' });
  res.json(result);
});

// Guard against spreadsheet formula injection when opening the CSV in Excel.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/:type/export', (req, res) => {
  const result = runReport(req.params.type, req.query.from, req.query.to);
  if (!result) return res.status(404).json({ error: 'Unknown report.' });

  const header = ['Laptop', 'Brand', 'Category', 'Model', 'Serial number', 'Status', 'Quantity', 'Unit price', 'Total value', 'Purchase date', 'Date added'];
  const lines = [header.map(csvCell).join(',')];
  result.rows.forEach((r) => {
    lines.push([r.laptop_name, r.brand_name, r.category_name, r.model, r.serial_number, r.status,
      r.quantity, r.price.toFixed(2), r.total_value.toFixed(2), r.purchase_date || '', r.created_at].map(csvCell).join(','));
  });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-report-${stamp}.csv"`);
  res.send('\uFEFF' + lines.join('\r\n'));
});

module.exports = router;
