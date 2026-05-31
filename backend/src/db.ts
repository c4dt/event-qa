import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  alias         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  name          TEXT,
  affiliation   TEXT,
  bio           TEXT,
  created_at    INTEGER NOT NULL,
  banned        INTEGER NOT NULL DEFAULT 0,
  is_admin      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY,
  talk_id     TEXT NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  answered    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS questions_talk ON questions(talk_id);

CREATE TABLE IF NOT EXISTS question_messages (
  id           INTEGER PRIMARY KEY,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  hidden       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS qm_question ON question_messages(question_id);

CREATE TABLE IF NOT EXISTS upvotes (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id          INTEGER PRIMARY KEY,
  user_a      INTEGER NOT NULL REFERENCES users(id),
  user_b      INTEGER NOT NULL REFERENCES users(id),
  sender_id   INTEGER NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dm_pair ON dm_messages(user_a, user_b, created_at);

CREATE TABLE IF NOT EXISTS read_markers (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  ref         TEXT NOT NULL,
  last_read   INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);

CREATE TABLE IF NOT EXISTS watches (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, question_id)
);
`;

export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
