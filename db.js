const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'dashboard.db');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
    }
  } catch(e) {
    console.error('DB load failed, using in-memory:', e.message);
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      owner_name TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      city TEXT,
      state TEXT,
      niche TEXT,
      rating REAL,
      reviews INTEGER,
      status TEXT DEFAULT 'new',
      outcome TEXT,
      pain TEXT,
      business_detail TEXT,
      contact_method TEXT,
      assigned_to INTEGER,
      demo_sent INTEGER DEFAULT 0,
      demo_sent_at TEXT,
      meeting_date TEXT,
      meeting_time TEXT,
      meeting_link TEXT,
      meeting_status TEXT,
      followup_date TEXT,
      followup_time TEXT,
      followup_note TEXT,
      deal_value REAL DEFAULT 0,
      deal_closed INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual',
      tags TEXT,
      notes TEXT,
      google_maps TEXT,
      has_website INTEGER DEFAULT 0,
      website_score INTEGER DEFAULT 0,
      website_grade TEXT,
      score INTEGER DEFAULT 0,
      lead_category TEXT DEFAULT 'cold',
      latitude REAL,
      longitude REAL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      avatar_color TEXT DEFAULT '#6366f1',
      role TEXT DEFAULT 'closer',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      rep_id INTEGER,
      call_sid TEXT,
      duration INTEGER,
      outcome TEXT,
      transcript TEXT,
      recording_url TEXT,
      called_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (rep_id) REFERENCES sales_reps(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      rep_id INTEGER,
      type TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'caller',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // Add missing columns if they don't exist
  try { run('ALTER TABLE leads ADD COLUMN latitude REAL'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN longitude REAL'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN has_website INTEGER DEFAULT 0'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN website_score INTEGER DEFAULT 0'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN website_grade TEXT'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN lead_category TEXT DEFAULT "cold"'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN address TEXT'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN maps_url TEXT'); } catch(e) {}
  try { run('ALTER TABLE leads ADD COLUMN google_maps TEXT'); } catch(e) {}

  // Create default admin user
  const existingAdmin = queryOne('SELECT id FROM users WHERE username=?', ['admin']);
  if (!existingAdmin) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update('admin123').digest('hex');
    run('INSERT INTO users (username,password,name,role) VALUES (?,?,?,?)', ['admin', hash, 'Admin', 'admin']);
    console.log('Default admin user created: admin / admin123');
  }

  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch(e) {
    console.error('saveDB failed:', e.message);
  }
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
  const lastId = queryOne('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: lastId ? lastId.id : 0, changes: db.getRowsModified() };
}

module.exports = { initDB, queryAll, queryOne, run, saveDB };
