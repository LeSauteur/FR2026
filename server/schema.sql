-- Домиан Hub — схема v1.
-- Главный принцип: сервис строится вокруг сущностей (пользователь, офис, статья,
-- задача, расчёт, объявление, заявка), а не вокруг HTML-страниц.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Роли уровня системы: superadmin | franchise | editor | owner | manager | readonly
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('superadmin','franchise','editor','owner','manager','readonly')),
  editor_scope  TEXT,                       -- для editor: раздел, который он ведёт (hr, it, pr…)
  password_hash TEXT NOT NULL,              -- scrypt$N$r$p$salt$hash
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Храним только SHA-256 от токена: утечка базы не даёт готовых сессий.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offices (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  city         TEXT NOT NULL,
  address      TEXT NOT NULL,
  office_group TEXT NOT NULL DEFAULT 'main',   -- main | orel | …
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  opened_on    TEXT,
  royalty_rate REAL,                           -- доля, 0.04 = 4 %
  phone        TEXT,
  email        TEXT
);

-- Реквизиты отделены от карточки: у них отдельный, более строгий доступ.
CREATE TABLE IF NOT EXISTS office_requisites (
  office_id      INTEGER PRIMARY KEY REFERENCES offices(id) ON DELETE CASCADE,
  legal_name     TEXT NOT NULL,
  inn            TEXT,
  ogrn           TEXT,
  bank_name      TEXT,
  bik            TEXT,
  account        TEXT,
  corr_account   TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Пользователь ≠ офис. Один собственник — несколько офисов, у офиса — несколько людей.
CREATE TABLE IF NOT EXISTS office_memberships (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  office_id INTEGER NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner','manager','viewer')),
  PRIMARY KEY (user_id, office_id)
);

-- База знаний. audience: all — всем, staff — только франшизному отделу и редакторам.
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  section      TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  audience     TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','staff')),
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  version      INTEGER NOT NULL DEFAULT 1,
  author_id    INTEGER REFERENCES users(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  source       TEXT                          -- откуда перенесено: Instrukciya, FrDomian…
);

CREATE TABLE IF NOT EXISTS article_views (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  viewed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  requires_ack INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  author_id    INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS announcement_acks (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acked_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'meeting',   -- meeting | training | deadline | corporate
  place     TEXT
);

-- «7 дней»: шаблоны задач недели и отметки конкретного пользователя по датам.
CREATE TABLE IF NOT EXISTS task_templates (
  id         TEXT PRIMARY KEY,                  -- monday:choose-buyer
  weekday    TEXT NOT NULL,                     -- monday…sunday
  position   INTEGER NOT NULL,
  label      TEXT NOT NULL,
  helper     TEXT,
  done_when  TEXT
);

CREATE TABLE IF NOT EXISTS task_completions (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  work_date   TEXT NOT NULL,                    -- YYYY-MM-DD по Москве
  done_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, template_id, work_date)
);

CREATE TABLE IF NOT EXISTS week_days (
  id       TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  short    TEXT NOT NULL,
  name     TEXT NOT NULL,
  title    TEXT NOT NULL,
  subtitle TEXT,
  result   TEXT,
  message  TEXT
);

CREATE TABLE IF NOT EXISTS saved_calculations (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  office_id   INTEGER REFERENCES offices(id) ON DELETE SET NULL,
  calculator  TEXT NOT NULL,
  policy_id   TEXT NOT NULL,                    -- motivation-2026.1 — старые расчёты не ломаются
  title       TEXT NOT NULL,
  input_json  TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_requests (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  office_id   INTEGER REFERENCES offices(id),
  category    TEXT NOT NULL CHECK (category IN ('it','hr','pr','newbuild','franchise','finance')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','rejected')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL,
  lessons_done INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, course_id)
);

-- Кто, что, когда, старое и новое значение.
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  old_value  TEXT,
  new_value  TEXT,
  ip         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_office ON office_memberships(office_id);
CREATE INDEX IF NOT EXISTS idx_completions_date ON task_completions(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
