const express = require('express');
const db = require('../database/database');

const router = express.Router();

router.get('/stats', (req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*)                                                     AS total,
      COALESCE(SUM(CASE WHEN status = 'Available'    THEN 1 END), 0) AS available,
      COALESCE(SUM(CASE WHEN status = 'Borrowed'     THEN 1 END), 0) AS borrowed,
      COALESCE(SUM(CASE WHEN status = 'Maintenance'  THEN 1 END), 0) AS maintenance,
      COALESCE(SUM(CASE WHEN status = 'Out of Stock' THEN 1 END), 0) AS out_of_stock
    FROM laptops
  `).get();

  const byBrand = db.prepare(`
    SELECT b.brand_name AS label, COUNT(l.id) AS value
    FROM laptops l JOIN brands b ON b.id = l.brand_id
    GROUP BY b.id ORDER BY value DESC, label LIMIT 8
  `).all();

  const byCategory = db.prepare(`
    SELECT c.category_name AS label, COUNT(l.id) AS value
    FROM laptops l JOIN categories c ON c.id = l.category_id
    GROUP BY c.id ORDER BY value DESC, label
  `).all();

  // Last 6 calendar months (including the current one) of laptop activity.
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month, action, COUNT(*) AS n
    FROM activity_logs
    WHERE action LIKE 'laptop.%' AND created_at >= date('now', 'start of month', '-5 months')
    GROUP BY month, action
  `).all();

  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const series = { added: [], updated: [], removed: [] };
  months.forEach((m) => {
    const get = (a) => (rows.find((r) => r.month === m && r.action === a) || { n: 0 }).n;
    series.added.push(get('laptop.create'));
    series.updated.push(get('laptop.update'));
    series.removed.push(get('laptop.delete'));
  });

  const recentLaptops = db.prepare(`
    SELECT l.id, l.laptop_name, l.model, l.serial_number, l.status, l.created_at, l.image,
           b.brand_name
    FROM laptops l JOIN brands b ON b.id = l.brand_id
    ORDER BY l.created_at DESC, l.id DESC LIMIT 6
  `).all();

  const recentActivity = db.prepare(`
    SELECT a.id, a.action, a.description, a.created_at, u.full_name
    FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.action LIKE 'laptop.%'
    ORDER BY a.id DESC LIMIT 8
  `).all();

  res.json({ totals, byBrand, byCategory, activity: { months, ...series }, recentLaptops, recentActivity });
});

router.get('/notifications', (req, res) => {
  const items = db.prepare(`
    SELECT a.id, a.action, a.description, a.created_at, u.full_name
    FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.action NOT IN ('user.login')
    ORDER BY a.id DESC LIMIT 10
  `).all();
  res.json({ items });
});

module.exports = router;
