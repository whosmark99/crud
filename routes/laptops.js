const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../database/database');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 3;
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const STATUSES = ['Available', 'Borrowed', 'Maintenance', 'Out of Stock'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + MIME_EXT[file.mimetype])
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (MIME_EXT[file.mimetype]) return cb(null, true);
    const err = new Error('Only JPG, PNG, WEBP or GIF images are allowed.');
    err.isUploadError = true;
    cb(err);
  }
});

const BASE_SELECT = `
  SELECT l.*, b.brand_name, c.category_name
  FROM laptops l
  JOIN brands b ON b.id = l.brand_id
  JOIN categories c ON c.id = l.category_id`;

const SORTS = {
  name: 'l.laptop_name COLLATE NOCASE',
  price: 'l.price',
  date: 'l.created_at',
  brand: 'b.brand_name COLLATE NOCASE',
  status: 'l.status'
};

function removeFile(name) {
  if (!name) return;
  const target = path.join(UPLOAD_DIR, path.basename(name));
  fs.unlink(target, () => {});
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseLaptop(body) {
  const errors = {};
  const data = {
    laptop_name: str(body.laptop_name, 120),
    brand_id: parseInt(body.brand_id, 10),
    category_id: parseInt(body.category_id, 10),
    model: str(body.model, 100),
    serial_number: str(body.serial_number, 80),
    processor: str(body.processor, 100),
    ram: str(body.ram, 40),
    storage: str(body.storage, 60),
    graphics_card: str(body.graphics_card, 100),
    operating_system: str(body.operating_system, 60),
    screen_size: str(body.screen_size, 30),
    price: body.price === '' || body.price == null ? 0 : Number(body.price),
    quantity: body.quantity === '' || body.quantity == null ? 1 : Number(body.quantity),
    status: str(body.status, 20) || 'Available',
    purchase_date: str(body.purchase_date, 10),
    description: str(body.description, 2000)
  };

  if (!data.laptop_name) errors.laptop_name = 'Enter the laptop name.';
  if (!data.model) errors.model = 'Enter the model.';
  if (!data.serial_number) errors.serial_number = 'Enter the serial number.';
  if (!Number.isInteger(data.brand_id) || !db.prepare('SELECT 1 FROM brands WHERE id = ?').get(data.brand_id)) {
    errors.brand_id = 'Choose a brand.';
  }
  if (!Number.isInteger(data.category_id) || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) {
    errors.category_id = 'Choose a category.';
  }
  if (!Number.isFinite(data.price) || data.price < 0 || data.price > 100000000) errors.price = 'Enter a valid price (0 or more).';
  if (!Number.isInteger(data.quantity) || data.quantity < 0 || data.quantity > 100000) errors.quantity = 'Enter a whole number (0 or more).';
  if (!STATUSES.includes(data.status)) errors.status = 'Choose a valid status.';
  if (data.purchase_date) {
    const d = new Date(data.purchase_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.purchase_date) || Number.isNaN(d.getTime())) {
      errors.purchase_date = 'Enter a valid date.';
    }
  }
  return { errors, data };
}

const serialTaken = (serial, exceptId = 0) =>
  !!db.prepare('SELECT 1 FROM laptops WHERE serial_number = ? AND id != ?').get(serial, exceptId);


// The Add/Edit popup only asks for name, brand, processor, RAM, storage and status.
// Fields the database still requires get sensible defaults.
function defaultCategoryId() {
  const row = db.prepare("SELECT id FROM categories WHERE category_name = 'Uncategorized'").get();
  if (row) return row.id;
  return Number(db.prepare("INSERT INTO categories (category_name) VALUES ('Uncategorized')").run().lastInsertRowid);
}
function generateSerial() {
  for (let i = 0; i < 20; i++) {
    const serial = 'LAP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!serialTaken(serial)) return serial;
  }
  return 'LAP-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}
function withCreateDefaults(body) {
  const b = { ...body };
  if (!str(b.model, 100)) b.model = str(b.laptop_name, 100);
  if (!str(b.serial_number, 80)) b.serial_number = generateSerial();
  if (!parseInt(b.category_id, 10)) b.category_id = defaultCategoryId();
  return b;
}

// ----- LIST (search, filter, sort, paginate) -----
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const where = [];
  const params = [];

  const q = str(req.query.q, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push(`(l.laptop_name LIKE ? ESCAPE '\\' OR l.model LIKE ? ESCAPE '\\' OR l.serial_number LIKE ? ESCAPE '\\'
                 OR l.processor LIKE ? ESCAPE '\\' OR b.brand_name LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like, like);
  }
  const brand = parseInt(req.query.brand, 10);
  if (brand) { where.push('l.brand_id = ?'); params.push(brand); }
  const category = parseInt(req.query.category, 10);
  if (category) { where.push('l.category_id = ?'); params.push(category); }
  if (STATUSES.includes(req.query.status)) { where.push('l.status = ?'); params.push(req.query.status); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = SORTS[req.query.sort] || SORTS.date;
  const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM laptops l
    JOIN brands b ON b.id = l.brand_id JOIN categories c ON c.id = l.category_id ${whereSql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);

  const items = db.prepare(`${BASE_SELECT} ${whereSql} ORDER BY ${sortCol} ${order}, l.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (safePage - 1) * limit);

  res.json({ items, total, page: safePage, pages, limit });
});

// ----- READ ONE -----
router.get('/:id', (req, res) => {
  const row = db.prepare(`${BASE_SELECT} WHERE l.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Laptop not found.' });
  res.json({ item: row });
});

// ----- CREATE -----
router.post('/', upload.single('image'), (req, res) => {
  const { errors, data } = parseLaptop(withCreateDefaults(req.body));
  if (!errors.serial_number && serialTaken(data.serial_number)) {
    errors.serial_number = 'This serial number already exists.';
  }
  if (Object.keys(errors).length) {
    if (req.file) removeFile(req.file.filename);
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });
  }
  try {
    const info = db.prepare(`
      INSERT INTO laptops (laptop_name, brand_id, category_id, model, serial_number, processor, ram, storage,
        graphics_card, operating_system, screen_size, price, quantity, status, image, purchase_date, description)
      VALUES (@laptop_name, @brand_id, @category_id, @model, @serial_number, @processor, @ram, @storage,
        @graphics_card, @operating_system, @screen_size, @price, @quantity, @status, @image, @purchase_date, @description)
    `).run({ ...data, image: req.file ? req.file.filename : null, purchase_date: data.purchase_date || null });
    db.logActivity(req.user.id, 'laptop.create', `Added laptop "${data.laptop_name}" (${data.serial_number})`);
    res.status(201).json({ message: 'Laptop added.', id: info.lastInsertRowid });
  } catch (err) {
    if (req.file) removeFile(req.file.filename);
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'This serial number already exists.', errors: { serial_number: 'This serial number already exists.' } });
    }
    throw err;
  }
});

// ----- UPDATE -----
router.put('/:id', upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM laptops WHERE id = ?').get(req.params.id);
  if (!existing) {
    if (req.file) removeFile(req.file.filename);
    return res.status(404).json({ error: 'Laptop not found.' });
  }
  // Fields not sent by the form keep their current values.
  const { errors, data } = parseLaptop({ ...existing, ...req.body });
  if (!errors.serial_number && serialTaken(data.serial_number, existing.id)) {
    errors.serial_number = 'This serial number already exists.';
  }
  if (Object.keys(errors).length) {
    if (req.file) removeFile(req.file.filename);
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });
  }

  let image = existing.image;
  if (req.file) image = req.file.filename;
  else if (req.body.remove_image === '1') image = null;

  try {
    db.prepare(`
      UPDATE laptops SET laptop_name=@laptop_name, brand_id=@brand_id, category_id=@category_id, model=@model,
        serial_number=@serial_number, processor=@processor, ram=@ram, storage=@storage, graphics_card=@graphics_card,
        operating_system=@operating_system, screen_size=@screen_size, price=@price, quantity=@quantity,
        status=@status, image=@image, purchase_date=@purchase_date, description=@description,
        updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...data, image, purchase_date: data.purchase_date || null, id: existing.id });
  } catch (err) {
    if (req.file) removeFile(req.file.filename);
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'This serial number already exists.', errors: { serial_number: 'This serial number already exists.' } });
    }
    throw err;
  }
  if (image !== existing.image) removeFile(existing.image);
  db.logActivity(req.user.id, 'laptop.update', `Updated laptop "${data.laptop_name}" (${data.serial_number})`);
  res.json({ message: 'Changes saved.' });
});

// ----- BULK DELETE -----
router.post('/bulk-delete', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length || ids.length > 500) return res.status(400).json({ error: 'Select at least one laptop.' });
  const select = db.prepare('SELECT id, image FROM laptops WHERE id = ?');
  const del = db.prepare('DELETE FROM laptops WHERE id = ?');
  const files = [];
  let count = 0;
  db.transaction(() => {
    ids.forEach((id) => {
      const row = select.get(id);
      if (row && del.run(id).changes) { count += 1; files.push(row.image); }
    });
  })();
  files.forEach(removeFile);
  if (count) db.logActivity(req.user.id, 'laptop.delete', `Deleted ${count} laptop${count === 1 ? '' : 's'}`);
  res.json({ message: `${count} laptop${count === 1 ? '' : 's'} deleted.`, deleted: count });
});

// ----- DELETE -----
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM laptops WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Laptop not found.' });
  db.prepare('DELETE FROM laptops WHERE id = ?').run(row.id);
  removeFile(row.image);
  db.logActivity(req.user.id, 'laptop.delete', `Deleted laptop "${row.laptop_name}" (${row.serial_number})`);
  res.json({ message: 'Laptop deleted.' });
});

module.exports = router;