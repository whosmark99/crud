require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./database/database');
const SqliteStore = require('./database/sessionStore')(session);
const { requireAuth, requirePage, redirectIfAuthed, loadUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  if (isProd) {
    console.error('SESSION_SECRET is required in production. Copy .env.example to .env first.');
    process.exit(1);
  }
  console.warn('[warn] SESSION_SECRET not set. Using an insecure development secret.');
}

app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use(session({
  name: 'lim.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  store: new SqliteStore(db),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true'
  }
}));

// Static assets (css, js, images, uploaded laptop photos). HTML pages are served by guarded routes below.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/laptops', requireAuth, require('./routes/laptops'));
app.use('/api/brands', requireAuth, require('./routes/brands'));
app.use('/api/categories', requireAuth, require('./routes/categories'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api', requireAuth, require('./routes/profile'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- Pages ----------
const view = (name) => (req, res) => res.sendFile(path.join(__dirname, 'views', `${name}.html`));

app.get('/', (req, res) => res.redirect(loadUser(req) ? '/dashboard' : '/login'));
app.get('/login', redirectIfAuthed, view('login'));
app.get('/register', redirectIfAuthed, view('register'));

['dashboard', 'inventory', 'profile', 'brands', 'categories', 'reports', 'settings'].forEach((p) => {
  app.get(`/${p}`, requirePage, view(p));
});
app.get('/add-laptop', requirePage, (req, res) => res.redirect('/inventory?add=1'));

app.use((req, res) => res.status(404).send('Page not found. <a href="/">Go home</a>'));

// ---------- Errors ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: `Image is too large. Maximum size is ${process.env.MAX_UPLOAD_MB || 3} MB.`, errors: { image: 'Image is too large.' } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  if (err && err.isUploadError) {
    return res.status(400).json({ error: err.message, errors: { image: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Laptop Inventory Management running at http://localhost:${PORT}`);
});
