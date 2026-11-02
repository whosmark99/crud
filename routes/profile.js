const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

router.get('/profile', (req, res) => res.json({ user: req.user }));

router.put('/profile', (req, res) => {
  const full_name = clean(req.body.full_name);
  const username = clean(req.body.username);
  const email = clean(req.body.email).toLowerCase();
  const errors = {};
  if (full_name.length < 2 || full_name.length > 80) errors.full_name = 'Enter your full name (2–80 characters).';
  if (!USERNAME_RE.test(username)) errors.username = 'Use 3–30 letters, numbers, dots, dashes or underscores.';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address.';
  if (!errors.username && db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, req.user.id)) {
    errors.username = 'That username is already taken.';
  }
  if (!errors.email && db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, req.user.id)) {
    errors.email = 'Another account already uses this email.';
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });

  db.prepare('UPDATE users SET full_name = ?, username = ?, email = ? WHERE id = ?')
    .run(full_name, username, email, req.user.id);
  db.logActivity(req.user.id, 'user.update', `${full_name} updated their profile`);
  const user = db.prepare('SELECT id, full_name, username, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ message: 'Profile updated.', user });
});

router.post('/profile/password', (req, res) => {
  const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
  const next = typeof req.body.new_password === 'string' ? req.body.new_password : '';
  const confirm = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';
  const errors = {};

  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!current || !bcrypt.compareSync(current, row.password)) errors.current_password = 'Current password is incorrect.';
  if (next.length < 8 || next.length > 72 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
    errors.new_password = 'Use 8–72 characters with at least one letter and one number.';
  } else if (next === current) {
    errors.new_password = 'Choose a password different from the current one.';
  }
  if (next !== confirm) errors.confirm_password = 'Passwords do not match.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(next, 12), req.user.id);
  db.logActivity(req.user.id, 'user.password', `${req.user.full_name} changed their password`);
  res.json({ message: 'Password changed.' });
});

function readSettings() {
  const out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach((r) => { out[r.key] = r.value; });
  return out;
}

router.get('/settings', (req, res) => res.json({ settings: readSettings() }));

router.put('/settings', requireAdmin, (req, res) => {
  const company_name = clean(req.body.company_name).slice(0, 80);
  const currency = clean(req.body.currency).slice(0, 4);
  const errors = {};
  if (!company_name) errors.company_name = 'Enter an organization name.';
  if (!currency) errors.currency = 'Enter a currency symbol.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });

  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => { up.run('company_name', company_name); up.run('currency', currency); })();
  db.logActivity(req.user.id, 'settings.update', 'Updated application settings');
  res.json({ message: 'Settings saved.', settings: readSettings() });
});

module.exports = router;
