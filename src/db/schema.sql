-- Applied idempotently on every boot. Only ever ADD things here; the crawl
-- database is disposable, but not mid-event.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at      INTEGER NOT NULL,
  finished_at     INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_team ON sessions(team_id);

-- One row per (team, stop) the team has reached. Absence of a row means the
-- team has not got there yet.
CREATE TABLE IF NOT EXISTS team_stops (
  team_id             INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stop_id             TEXT NOT NULL,
  stop_index          INTEGER NOT NULL,
  phase               TEXT NOT NULL CHECK (phase IN ('CHALLENGE', 'QUIZ', 'DONE')),
  hints_unlocked      INTEGER NOT NULL DEFAULT 0,
  entered_at          INTEGER NOT NULL,
  challenge_passed_at INTEGER,
  quiz_solved_at      INTEGER,
  PRIMARY KEY (team_id, stop_id)
);

CREATE TABLE IF NOT EXISTS uploads (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id              INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stop_id              TEXT NOT NULL,
  -- CHALLENGE unlocks the quiz; HINT buys one extra hint.
  kind                 TEXT NOT NULL CHECK (kind IN ('CHALLENGE', 'HINT')),
  -- For HINT uploads: which side-challenge was demanded (shot/beer/selfie).
  side_challenge_type  TEXT,
  stored_key           TEXT,
  original_name        TEXT,
  mime                 TEXT,
  size                 INTEGER,
  sha256               TEXT,
  client_last_modified INTEGER,
  extracted_created_at INTEGER,
  metadata_json        TEXT,
  accepted             INTEGER NOT NULL DEFAULT 0,
  -- Accepted, but we could not prove freshness. Shows up in /admin for a look.
  flagged              INTEGER NOT NULL DEFAULT 0,
  flag_reason          TEXT,
  reject_reason        TEXT,
  created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploads_team ON uploads(team_id, created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_sha ON uploads(sha256);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stop_id    TEXT NOT NULL,
  submitted  TEXT NOT NULL,
  correct    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_team ON quiz_attempts(team_id, created_at);

-- Append-only log. Powers the admin timeline and keeps a record of the night.
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id      INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  payload_json TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
