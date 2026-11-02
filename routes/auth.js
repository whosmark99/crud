const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

router.post('/register', (req, res) => {
  const full_name = clean(req.body.full_name);
  const username = clean(req.body.username);
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirm = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';

  const errors = {};
  if (full_name.length < 2 || full_name.length > 80) errors.full_name = 'Enter your full name (2–80 characters).';
  if (!USERNAME_RE.test(username)) errors.username = 'Use 3–30 letters, numbers, dots, dashes or underscores.';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address.';
  if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Use 8–72 characters with at least one letter and one number.';
  }
  if (password !== confirm) errors.confirm_password = 'Passwords do not match.';

  if (!errors.username && db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    errors.username = 'That username is already taken.';
  }
  if (!errors.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    errors.email = 'An account with this email already exists.';
  }
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });
  }

  const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
  const role = isFirst ? 'Administrator' : 'Staff';
  const hash = bcrypt.hashSync(password, 12);

  try {
    const info = db.prepare(
      'INSERT INTO users (full_name, username, email, password, role) VALUES (?, ?, ?, ?, ?)'
    ).run(full_name, username, email, hash, role);
    db.logActivity(info.lastInsertRowid, 'user.register', `${full_name} created an account`);
    res.status(201).json({ message: 'Account created. You can sign in now.' });
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'Username or email is already in use.' });
    }
    throw err;
  }
});

router.post('/login', (req, res, next) => {
  const identifier = clean(req.body.identifier);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const remember = req.body.remember === true || req.body.remember === 'true';

  const errors = {};
  if (!identifier) errors.identifier = 'Enter your username or email.';
  if (!password) errors.password = 'Enter your password.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fill in both fields.', errors });

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  }

  // Regenerate the session id on login to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.cookie.maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : null;
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      db.logActivity(user.id, 'user.login', `${user.full_name} signed in`);
      res.json({ message: 'Welcome back!', redirect: '/dashboard' });
    });
  });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('lim.sid');
    res.json({ message: 'Signed out.' });
  });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;