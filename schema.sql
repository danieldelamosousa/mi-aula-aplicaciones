-- Esquema SQL para Cloudflare D1 (binding: DB)
-- Nota: la aplicación también crea e inicializa estas tablas automáticamente
-- en la primera visita si la base de datos está vacía.

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  course TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  cycle TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_type TEXT NOT NULL DEFAULT 'custom',
  external_url TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  built_in INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  app_id TEXT NOT NULL,
  app_title TEXT NOT NULL,
  students_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  ended_at TEXT,
  active_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  kind TEXT NOT NULL,
  task_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  correct INTEGER,
  assisted INTEGER NOT NULL DEFAULT 0,
  task_ms INTEGER NOT NULL DEFAULT 0,
  active_ms INTEGER NOT NULL DEFAULT 0,
  client_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (session_token) REFERENCES sessions(token) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teacher_tokens (
  sid TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_tokens (
  sid TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_token);
CREATE INDEX IF NOT EXISTS idx_events_session_kind ON events(session_token, kind);
