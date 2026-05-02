require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const SqliteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'flux.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Créer les tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    downloadUrl TEXT,
    price REAL DEFAULT 0,
    category TEXT DEFAULT '',
    image TEXT DEFAULT '',
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    lastIp TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    userId TEXT,
    productId TEXT,
    productName TEXT,
    productImage TEXT,
    downloadUrl TEXT,
    email TEXT,
    purchasedAt TEXT,
    seen INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    productId TEXT,
    userId TEXT,
    username TEXT,
    avatar TEXT,
    rating INTEGER,
    comment TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS owners (
    userId TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS bans (
    ip TEXT PRIMARY KEY,
    username TEXT,
    raison TEXT,
    bannedAt TEXT,
    bannedBy TEXT
  );
`);

// ── MULTER ──
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../public/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── SESSIONS ──
const SESSION_DB = path.join(DB_DIR, 'sessions.db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(session({
  store: new SqliteStore({ db: 'sessions.db', dir: DB_DIR }),
  secret: process.env.SESSION_SECRET || 'flux_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
}));

// ── MIGRATE JSON → SQLite (première fois) ──
function migrateFromJSON() {
  const dataDir = path.join(__dirname, 'data');

  // Products
  const pFile = path.join(dataDir, 'products.json');
  if (fs.existsSync(pFile)) {
    try {
      const products = JSON.parse(fs.readFileSync(pFile, 'utf8'));
      const insert = db.prepare(`INSERT OR IGNORE INTO products (id,name,description,downloadUrl,price,category,image,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`);
      products.forEach(p => insert.run(p.id, p.name, p.description, p.downloadUrl, p.price||0, p.category||'', p.image||'', p.createdAt, p.updatedAt||null));
      console.log(`✅ Migré ${products.length} produits`);
    } catch(e) { console.error('Migration products:', e.message); }
  }

  // Owners
  const oFile = path.join(dataDir, 'owners.json');
  if (fs.existsSync(oFile)) {
    try {
      const owners = JSON.parse(fs.readFileSync(oFile, 'utf8'));
      const insert = db.prepare(`INSERT OR IGNORE INTO owners (userId) VALUES (?)`);
      owners.forEach(id => insert.run(id));
      console.log(`✅ Migré ${owners.length} owners`);
    } catch(e) { console.error('Migration owners:', e.message); }
  }

  // Bans
  const bFile = path.join(dataDir, 'bans.json');
  if (fs.existsSync(bFile)) {
    try {
      const bans = JSON.parse(fs.readFileSync(bFile, 'utf8'));
      const insert = db.prepare(`INSERT OR IGNORE INTO bans (ip,username,raison,bannedAt,bannedBy) VALUES (?,?,?,?,?)`);
      bans.forEach(b => insert.run(b.ip, b.username||'', b.raison||'', b.bannedAt, b.bannedBy||''));
      console.log(`✅ Migré ${bans.length} bans`);
    } catch(e) { console.error('Migration bans:', e.message); }
  }

  // Users + purchases
  const uFile = path.join(dataDir, 'users.json');
  if (fs.existsSync(uFile)) {
    try {
      const users = JSON.parse(fs.readFileSync(uFile, 'utf8'));
      const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id,username,avatar,lastIp,createdAt) VALUES (?,?,?,?,?)`);
      const insertPurchase = db.prepare(`INSERT OR IGNORE INTO purchases (id,userId,productId,productName,productImage,downloadUrl,email,purchasedAt,seen) VALUES (?,?,?,?,?,?,?,?,?)`);
      Object.values(users).forEach(u => {
        insertUser.run(u.id, u.username, u.avatar||null, u.lastIp||null, new Date().toISOString());
        (u.purchases||[]).forEach(p => insertPurchase.run(uuidv4(), u.id, p.productId, p.productName, p.productImage||'', p.downloadUrl, p.email||'', p.purchasedAt, p.seen?1:0));
      });
      console.log(`✅ Migré ${Object.keys(users).length} users`);
    } catch(e) { console.error('Migration users:', e.message); }
  }

  // Reviews
  const rFile = path.join(dataDir, 'reviews.json');
  if (fs.existsSync(rFile)) {
    try {
      const reviews = JSON.parse(fs.readFileSync(rFile, 'utf8'));
      const insert = db.prepare(`INSERT OR IGNORE INTO reviews (id,productId,userId,username,avatar,rating,comment,createdAt) VALUES (?,?,?,?,?,?,?,?)`);
      Object.entries(reviews).forEach(([productId, list]) => {
        list.forEach(r => insert.run(r.id||uuidv4(), productId, r.userId, r.username, r.avatar||null, r.rating, r.comment, r.createdAt));
      });
    } catch(e) { console.error('Migration reviews:', e.message); }
  }
}

migrateFromJSON();

// ── BAN IP MIDDLEWARE ──
app.use((req, res, next) => {
  if (req.path.startsWith('/internal/')) return next();
  const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '').replace('::ffff:', '');
  if (ip === '::1' || ip === '127.0.0.1') return next();

  const banned = db.prepare('SELECT * FROM bans WHERE ip = ?').get(ip);
  if (banned) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Accès refusé' });
    return res.status(403).send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Accès refusé — Flux</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#fff;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.box{max-width:420px;padding:40px 32px}h1{font-size:3rem;margin-bottom:8px}.code{font-size:1rem;color:rgba(255,255,255,0.3);margin-bottom:24px;letter-spacing:.1em}p{color:rgba(255,255,255,0.5);font-size:.9rem;line-height:1.7}.reason{margin-top:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:12px 16px;font-size:.82rem;color:rgba(255,255,255,.4)}</style>
</head><body><div class="box"><h1>🚫</h1><div class="code">ACCÈS REFUSÉ</div><p>Ton accès au site <strong>Flux</strong> a été révoqué.</p>${banned.raison ? `<div class="reason">Raison : ${banned.raison}</div>` : ''}</div></body></html>`);
  }
  next();
});

// ── VERIFY CODES ──
const verifyCodes = {};
setInterval(() => { const now = Date.now(); for (const c in verifyCodes) if (verifyCodes[c].expiresAt < now) delete verifyCodes[c]; }, 5 * 60 * 1000);

app.post('/internal/create-verify-code', (req, res) => {
  const { secret, userId, username, avatar } = req.body;
  if (secret !== (process.env.INTERNAL_SECRET || 'flux_internal_secret')) return res.status(403).json({ error: 'Forbidden' });
  let code;
  do { code = Math.floor(100000 + Math.random() * 900000).toString(); } while (verifyCodes[code]);
  verifyCodes[code] = { userId, username, avatar: avatar || null, expiresAt: Date.now() + 10 * 60 * 1000 };
  res.json({ success: true, code });
});

app.post('/api/verify', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code manquant' });
  const entry = verifyCodes[code.trim()];
  if (!entry || entry.expiresAt < Date.now()) { delete verifyCodes[code]; return res.status(400).json({ error: 'Code invalide ou expiré' }); }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(entry.userId);
  if (!existing) {
    db.prepare('INSERT INTO users (id,username,avatar,createdAt) VALUES (?,?,?,?)').run(entry.userId, entry.username, entry.avatar, new Date().toISOString());
  } else {
    db.prepare('UPDATE users SET username=?, avatar=? WHERE id=?').run(entry.username, entry.avatar, entry.userId);
  }

  req.session.user = { id: entry.userId, username: entry.username, avatar: entry.avatar };
  delete verifyCodes[code];
  res.json({ success: true });
});

app.get('/auth/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// ── AUTH MIDDLEWARE ──
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  next();
}
function requireOwner(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const owner = db.prepare('SELECT 1 FROM owners WHERE userId = ?').get(req.session.user.id);
  if (!owner) return res.status(403).json({ error: 'Accès refusé' });
  next();
}

// ── API: SESSION ──
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '').replace('::ffff:', '');
  db.prepare('UPDATE users SET lastIp=? WHERE id=?').run(ip, req.session.user.id);

  const purchases = db.prepare('SELECT * FROM purchases WHERE userId = ?').all(req.session.user.id);
  const isOwner = !!db.prepare('SELECT 1 FROM owners WHERE userId = ?').get(req.session.user.id);

  res.json({ user: { ...req.session.user, purchases: purchases.map(p => ({ ...p, seen: !!p.seen })), isOwner } });
});

// ── API: PRODUCTS ──
app.get('/api/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY createdAt DESC').all());
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

// ── API: ADMIN - ADD PRODUCT ──
app.post('/api/admin/products', requireOwner, upload.single('image'), (req, res) => {
  const { name, description, downloadUrl, price, imageUrl, category } = req.body;
  if (!name || !description || !downloadUrl) return res.status(400).json({ error: 'Champs manquants' });
  const finalImage = req.file ? `/uploads/${req.file.filename}` : (imageUrl || '');
  const id = uuidv4();
  db.prepare('INSERT INTO products (id,name,description,downloadUrl,price,category,image,createdAt) VALUES (?,?,?,?,?,?,?,?)').run(id, name, description, downloadUrl, parseFloat(price)||0, category||'', finalImage, new Date().toISOString());
  res.json({ success: true, product: db.prepare('SELECT * FROM products WHERE id=?').get(id) });
});

// ── API: ADMIN - EDIT PRODUCT ──
app.put('/api/admin/products/:id', requireOwner, upload.single('image'), (req, res) => {
  const { name, description, downloadUrl, price, imageUrl, category } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
  const finalImage = req.file ? `/uploads/${req.file.filename}` : (imageUrl !== undefined ? imageUrl : existing.image);
  db.prepare('UPDATE products SET name=?,description=?,downloadUrl=?,price=?,category=?,image=?,updatedAt=? WHERE id=?').run(
    name||existing.name, description||existing.description, downloadUrl||existing.downloadUrl,
    price!==undefined?(parseFloat(price)||0):existing.price, category!==undefined?category:existing.category,
    finalImage, new Date().toISOString(), req.params.id
  );
  res.json({ success: true, product: db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id) });
});

// ── API: ADMIN - DELETE PRODUCT ──
app.delete('/api/admin/products/:id', requireOwner, (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── API: ADMIN - IP LOGS ──
app.get('/api/admin/iplogs', requireOwner, (req, res) => {
  const users = db.prepare('SELECT * FROM users WHERE lastIp IS NOT NULL').all();
  const bans = db.prepare('SELECT ip FROM bans').all().map(b => b.ip);
  res.json(users.map(u => ({ ip: u.lastIp, username: u.username, userId: u.id, avatar: u.avatar, banned: bans.includes(u.lastIp) })));
});

// ── API: ADMIN - BAN ──
app.post('/api/admin/ban', requireOwner, (req, res) => {
  const { ip, username, raison } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP manquante' });
  db.prepare('INSERT OR IGNORE INTO bans (ip,username,raison,bannedAt) VALUES (?,?,?,?)').run(ip, username||'Inconnu', raison||'', new Date().toISOString());
  res.json({ success: true });
});

app.delete('/api/admin/ban/:ip', requireOwner, (req, res) => {
  db.prepare('DELETE FROM bans WHERE ip=?').run(decodeURIComponent(req.params.ip));
  res.json({ success: true });
});

app.get('/api/admin/bans', requireOwner, (req, res) => {
  res.json(db.prepare('SELECT * FROM bans').all());
});

// ── API: BUY ──
app.post('/api/buy/:id', requireAuth, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  const already = db.prepare('SELECT 1 FROM purchases WHERE userId=? AND productId=?').get(req.session.user.id, product.id);
  if (!already) {
    db.prepare('INSERT INTO purchases (id,userId,productId,productName,productImage,downloadUrl,email,purchasedAt,seen) VALUES (?,?,?,?,?,?,?,?,0)').run(uuidv4(), req.session.user.id, product.id, product.name, product.image, product.downloadUrl, email, new Date().toISOString());
  }
  res.json({ success: true });
});

// ── API: MARK SEEN ──
app.post('/api/purchases/seen', requireAuth, (req, res) => {
  db.prepare('UPDATE purchases SET seen=1 WHERE userId=?').run(req.session.user.id);
  res.json({ success: true });
});

// ── API: REVIEWS ──
app.get('/api/products/:id/reviews', (req, res) => {
  res.json(db.prepare('SELECT * FROM reviews WHERE productId=? ORDER BY createdAt DESC').all(req.params.id));
});

app.post('/api/products/:id/reviews', requireAuth, (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Note invalide' });
  if (!comment || comment.trim().length < 3) return res.status(400).json({ error: 'Commentaire trop court' });
  const existing = db.prepare('SELECT id FROM reviews WHERE productId=? AND userId=?').get(req.params.id, req.session.user.id);
  const review = { id: existing?.id || uuidv4(), productId: req.params.id, userId: req.session.user.id, username: req.session.user.username, avatar: req.session.user.avatar||null, rating: parseInt(rating), comment: comment.trim(), createdAt: new Date().toISOString() };
  if (existing) {
    db.prepare('UPDATE reviews SET rating=?,comment=?,createdAt=? WHERE id=?').run(review.rating, review.comment, review.createdAt, review.id);
  } else {
    db.prepare('INSERT INTO reviews (id,productId,userId,username,avatar,rating,comment,createdAt) VALUES (?,?,?,?,?,?,?,?)').run(review.id, review.productId, review.userId, review.username, review.avatar, review.rating, review.comment, review.createdAt);
  }
  res.json({ success: true, review });
});

// ── SERVE FRONTEND ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Flux Store running on http://localhost:${PORT}`);
});
