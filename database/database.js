const path = require('path');
const fs = require('fs');
// Built into Node.js 22.13+ (including 24). No native compilation or Visual Studio needed.
const { DatabaseSync } = require('node:sqlite');

const file = path.resolve(process.env.DATABASE_FILE || path.join(__dirname, 'inventory.db'));
fs.mkdirSync(path.dirname(file), { recursive: true });

// node:sqlite reports every failure as ERR_SQLITE_ERROR; map constraint failures
// to the SQLITE_CONSTRAINT code the routes check for.
function normalize(err) {
  if (err && /constraint failed/i.test(String(err.message))) err.code = 'SQLITE_CONSTRAINT';
  return err;
}

// Thin wrapper exposing the small API the app uses: prepare().get/all/run, exec, pragma, transaction.
class Database {
  constructor(f) { this.raw = new DatabaseSync(f); }
  exec(sql) { return this.raw.exec(sql); }
  pragma(text) { this.raw.exec(`PRAGMA ${text}`); }
  prepare(sql) {
    const st = this.raw.prepare(sql);
    if (typeof st.setAllowUnknownNamedParameters === 'function') st.setAllowUnknownNamedParameters(true);
    const wrap = (name) => (...args) => {
      try { return st[name](...args); } catch (err) { throw normalize(err); }
    };
    return { get: wrap('get'), all: wrap('all'), run: wrap('run') };
  }
  transaction(fn) {
    return (...args) => {
      this.raw.exec('BEGIN');
      try {
        const result = fn(...args);
        this.raw.exec('COMMIT');
        return result;
      } catch (err) {
        try { this.raw.exec('ROLLBACK'); } catch (e) { /* already rolled back */ }
        throw err;
      }
    };
  }
}

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name  TEXT NOT NULL,
  username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Administrator','Staff')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS laptops (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  laptop_name      TEXT NOT NULL,
  brand_id         INTEGER NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  model            TEXT NOT NULL,
  serial_number    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  processor        TEXT,
  ram              TEXT,
  storage          TEXT,
  graphics_card    TEXT,
  operating_system TEXT,
  screen_size      TEXT,
  price            REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  status           TEXT NOT NULL DEFAULT 'Available'
                   CHECK (status IN ('Available','Borrowed','Maintenance','Out of Stock')),
  image            TEXT,
  purchase_date    TEXT,
  description      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_laptops_brand    ON laptops(brand_id);
CREATE INDEX IF NOT EXISTS idx_laptops_category ON laptops(category_id);
CREATE INDEX IF NOT EXISTS idx_laptops_status   ON laptops(status);
CREATE INDEX IF NOT EXISTS idx_laptops_created  ON laptops(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
`);

// Seed starter data on first run only (empty tables).
const seedBrands = ['Dell', 'HP', 'Lenovo', 'Apple', 'ASUS', 'Acer', 'MSI', 'Microsoft'];
const seedCategories = ['Business', 'Gaming', 'Ultrabook', 'Student', 'Workstation', '2-in-1'];

const seed = db.transaction(() => {
  if (db.prepare('SELECT COUNT(*) AS n FROM brands').get().n === 0) {
    const ins = db.prepare('INSERT INTO brands (brand_name) VALUES (?)');
    seedBrands.forEach((b) => ins.run(b));
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
    const ins = db.prepare('INSERT INTO categories (category_name) VALUES (?)');
    seedCategories.forEach((c) => ins.run(c));
  }
  const defaults = { company_name: 'My Organization', currency: '₱' };
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(defaults).forEach(([k, v]) => insSetting.run(k, v));
});
seed();

db.logActivity = (userId, action, description) => {
  db.prepare('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)')
    .run(userId || null, action, description);
};

module.exports = db;
