const express = require('express');
const db = require('../database/database');

// Builds CRUD routes for a simple "name" lookup table (brands / categories).
module.exports = function lookupRouter({ table, nameCol, fk, label, plural }) {
  const router = express.Router();
  const validName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

  router.get('/', (req, res) => {
    const items = db.prepare(`
      SELECT t.id, t.${nameCol} AS name, t.created_at, COUNT(l.id) AS laptop_count
      FROM ${table} t LEFT JOIN laptops l ON l.${fk} = t.id
      GROUP BY t.id ORDER BY t.${nameCol} COLLATE NOCASE
    `).all();
    res.json({ items });
  });

  function save(req, res, id) {
    const name = validName(req.body.name);
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ error: `${label} name must be 2–60 characters.`, errors: { name: `Enter a ${label.toLowerCase()} name (2–60 characters).` } });
    }
    const dup = db.prepare(`SELECT 1 FROM ${table} WHERE ${nameCol} = ? AND id != ?`).get(name, id || 0);
    if (dup) return res.status(409).json({ error: `That ${label.toLowerCase()} already exists.`, errors: { name: `That ${label.toLowerCase()} already exists.` } });
    return name;
  }

  router.post('/', (req, res) => {
    const name = save(req, res, 0);
    if (typeof name !== 'string') return;
    db.prepare(`INSERT INTO ${table} (${nameCol}) VALUES (?)`).run(name);
    db.logActivity(req.user.id, `${table}.create`, `Added ${label.toLowerCase()} "${name}"`);
    res.status(201).json({ message: `${label} added.` });
  });

  router.put('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: `${label} not found.` });
    const name = save(req, res, row.id);
    if (typeof name !== 'string') return;
    db.prepare(`UPDATE ${table} SET ${nameCol} = ? WHERE id = ?`).run(name, row.id);
    db.logActivity(req.user.id, `${table}.update`, `Renamed ${label.toLowerCase()} "${row[nameCol]}" to "${name}"`);
    res.json({ message: `${label} updated.` });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: `${label} not found.` });
    const used = db.prepare(`SELECT COUNT(*) AS n FROM laptops WHERE ${fk} = ?`).get(row.id).n;
    if (used > 0) {
      return res.status(409).json({
        error: `Can't delete "${row[nameCol]}" because ${used} laptop${used === 1 ? ' uses' : 's use'} it. Reassign or delete those laptops first.`
      });
    }
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    db.logActivity(req.user.id, `${table}.delete`, `Deleted ${label.toLowerCase()} "${row[nameCol]}"`);
    res.json({ message: `${label} deleted.` });
  });

  return router;
};
