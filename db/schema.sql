-- SiteLog · daily site reporting for contractors
-- Single schema used by the Node server (sql.js on disk) and the browser demo (sql.js in IndexedDB).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS company (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  cr_no         TEXT,
  vat_no        TEXT,
  city          TEXT,
  phone         TEXT,
  email         TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin','pm','engineer','foreman','viewer')),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  name_ar        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  client         TEXT,
  consultant     TEXT,
  city           TEXT,
  start_date     TEXT,
  end_date       TEXT,
  contract_value REAL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','closed')),
  pm_id          INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS boq_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  desc_ar     TEXT NOT NULL,
  desc_en     TEXT NOT NULL,
  unit        TEXT NOT NULL,
  qty         REAL NOT NULL,
  rate        REAL NOT NULL DEFAULT 0,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_no    TEXT NOT NULL UNIQUE,
  report_date  TEXT NOT NULL,
  shift        TEXT NOT NULL DEFAULT 'day' CHECK (shift IN ('day','night')),
  weather      TEXT DEFAULT 'sunny',
  temp_c       REAL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','returned')),
  notes        TEXT,
  safety_notes TEXT,
  pm_comment   TEXT,
  created_by   INTEGER REFERENCES users(id),
  submitted_at TEXT,
  approved_by  INTEGER REFERENCES users(id),
  approved_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, report_date, shift)
);

CREATE TABLE IF NOT EXISTS report_manpower (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  trade     TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  hours     REAL NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS report_equipment (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 1,
  hours     REAL NOT NULL DEFAULT 8,
  status    TEXT NOT NULL DEFAULT 'working' CHECK (status IN ('working','idle','breakdown'))
);

CREATE TABLE IF NOT EXISTS report_activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  location    TEXT,
  qty         REAL NOT NULL DEFAULT 0,
  unit        TEXT
);

CREATE TABLE IF NOT EXISTS report_materials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id     INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  material      TEXT NOT NULL,
  qty           REAL NOT NULL DEFAULT 0,
  unit          TEXT,
  supplier      TEXT,
  delivery_note TEXT
);

CREATE TABLE IF NOT EXISTS report_issues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('delay','safety','quality','client','material','other')),
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);

CREATE TABLE IF NOT EXISTS report_photos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  caption   TEXT,
  url       TEXT NOT NULL
);

-- Field messages (WhatsApp / SMS / app) that get parsed into report lines
CREATE TABLE IF NOT EXISTS inbox_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  sender      TEXT NOT NULL,
  body        TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','parsed','applied','ignored')),
  parsed_json TEXT,
  report_id   INTEGER REFERENCES daily_reports(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  user_id   INTEGER,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id INTEGER,
  detail    TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_project_date ON daily_reports(project_id, report_date);
CREATE INDEX IF NOT EXISTS idx_activities_boq ON report_activities(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_messages(status);
