const db = require('../database/database');

function loadUser(req) {
  if (!req.session || !req.session.userId) return null;
  return db.prepare(
    'SELECT id, full_name, username, email, role, created_at FROM users WHERE id = ?'
  ).get(req.session.userId) || null;
}

// For API routes: respond 401 JSON.
function requireAuth(req, res, next) {
  const user = loadUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = user;
  next();
}

// For HTML pages: redirect to login.
function requirePage(req, res, next) {
  const user = loadUser(req);
  if (!user) return res.redirect('/login');
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Administrator') {
    return res.status(403).json({ error: 'Only administrators can do this.' });
  }
  next();
}

function redirectIfAuthed(req, res, next) {
  if (loadUser(req)) return res.redirect('/dashboard');
  next();
}

module.exports = { requireAuth, requirePage, requireAdmin, redirectIfAuthed, loadUser };
