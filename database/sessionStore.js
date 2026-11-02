// Minimal SQLite-backed session store so logins survive server restarts.
module.exports = function createStore(session) {
  const DAY = 24 * 60 * 60 * 1000;

  class SqliteStore extends session.Store {
    constructor(db) {
      super();
      this.db = db;
      db.exec(`CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL)`);
      this.timer = setInterval(() => {
        this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      }, 15 * 60 * 1000);
      this.timer.unref();
    }
    _expiry(sess) {
      const e = sess && sess.cookie && sess.cookie.expires;
      return e ? new Date(e).getTime() : Date.now() + DAY;
    }
    get(sid, cb) {
      try {
        const row = this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
        if (!row || row.expires <= Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.data));
      } catch (err) { cb(err); }
    }
    set(sid, sess, cb) {
      try {
        this.db.prepare('INSERT OR REPLACE INTO sessions (sid, expires, data) VALUES (?, ?, ?)')
          .run(sid, this._expiry(sess), JSON.stringify(sess));
        cb && cb(null);
      } catch (err) { cb && cb(err); }
    }
    touch(sid, sess, cb) {
      try {
        this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(this._expiry(sess), sid);
        cb && cb(null);
      } catch (err) { cb && cb(err); }
    }
    destroy(sid, cb) {
      try {
        this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        cb && cb(null);
      } catch (err) { cb && cb(err); }
    }
  }
  return SqliteStore;
};
