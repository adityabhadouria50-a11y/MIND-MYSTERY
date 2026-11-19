import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'mindmystery.db');

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  dbInstance = db;
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_token TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      successful_guesses INTEGER NOT NULL DEFAULT 0,
      riddles_solved INTEGER NOT NULL DEFAULT 0,
      riddle_streak INTEGER NOT NULL DEFAULT 0,
      best_riddle_streak INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      last_played_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      industry TEXT,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      end_year INTEGER,
      decade TEXT,
      era TEXT,
      popularity_prior REAL NOT NULL DEFAULT 1.0,
      verified INTEGER NOT NULL DEFAULT 1,
      attributes_json TEXT NOT NULL,
      poster_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_candidates_cat_ind ON candidates(category, industry);
    CREATE INDEX IF NOT EXISTS idx_candidates_verified ON candidates(verified);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      mode TEXT NOT NULL,
      category TEXT NOT NULL,
      industry TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      question_count INTEGER NOT NULL DEFAULT 0,
      bonus_used INTEGER NOT NULL DEFAULT 0,
      max_questions INTEGER NOT NULL DEFAULT 10,
      scores_json TEXT NOT NULL,
      asked_attributes_json TEXT NOT NULL DEFAULT '[]',
      history_json TEXT NOT NULL DEFAULT '[]',
      current_question_json TEXT,
      clue_asked INTEGER NOT NULL DEFAULT 0,
      range_min INTEGER,
      range_max INTEGER,
      top_candidate_id TEXT,
      confidence REAL,
      predicted_correct INTEGER,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      question_index INTEGER NOT NULL,
      attribute_key TEXT NOT NULL,
      question_text TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      candidates_remaining INTEGER NOT NULL,
      top_score REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      industry TEXT,
      predicted_candidate_id TEXT,
      was_correct INTEGER NOT NULL,
      correct_answer_name TEXT,
      selected_runner_up_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS riddles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      question TEXT NOT NULL UNIQUE,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      hint TEXT NOT NULL,
      explanation TEXT NOT NULL,
      as_of_date TEXT,
      sources_json TEXT NOT NULL DEFAULT '[]',
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_riddles_cat_diff ON riddles(category, difficulty);

    CREATE TABLE IF NOT EXISTS riddle_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      riddle_id INTEGER NOT NULL REFERENCES riddles(id),
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      time_limit_sec INTEGER NOT NULL,
      started_at_ms INTEGER NOT NULL,
      submitted_at_ms INTEGER,
      selected_index INTEGER,
      used_hint INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_riddle_attempts_user ON riddle_attempts(user_id);

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      source TEXT NOT NULL,
      points INTEGER NOT NULL,
      is_correct_prediction INTEGER NOT NULL DEFAULT 0,
      is_riddle_correct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scores_created ON scores(created_at);
    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);

    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      badge_key TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_key)
    );
  `);
}
