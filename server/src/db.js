// SQLite persistence layer (better-sqlite3, synchronous + fast for our scale).
// The schema is created on first run; everything a league needs to survive a
// server restart lives here: leagues, teams, draft picks, draft clock state,
// the per-league golfer pool (field + odds), and the latest cached scores.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS leagues (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    invite_code        TEXT UNIQUE NOT NULL,
    creator_player_id  TEXT NOT NULL,
    tournament_id      TEXT,
    tournament_json    TEXT,                     -- cached {name,dates,course,...}
    roster_size        INTEGER NOT NULL DEFAULT 6,
    scores_counted     INTEGER NOT NULL DEFAULT 3,
    pick_timer_seconds INTEGER DEFAULT 3600,     -- per-pick clock in seconds; NULL = no timer
    draft_order_json   TEXT,                     -- JSON array of team ids, in order
    status             TEXT NOT NULL DEFAULT 'lobby', -- lobby | drafting | active
    created_at         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id              TEXT PRIMARY KEY,
    league_id       TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    player_id       TEXT NOT NULL,               -- owner (localStorage-generated id)
    name            TEXT NOT NULL,
    draft_position  INTEGER,                     -- 1-based slot, set when draft starts
    auto_pick       INTEGER NOT NULL DEFAULT 0,  -- 1 = auto-draft this team's picks
    joined_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league_id);

  CREATE TABLE IF NOT EXISTS golfer_pool (
    league_id     TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    golfer_id     TEXT NOT NULL,
    name          TEXT NOT NULL,
    odds_decimal  REAL,                          -- decimal odds to win
    implied_prob  REAL,                          -- 1 / odds_decimal
    odds_rank     INTEGER,                       -- 1 = biggest favorite
    PRIMARY KEY (league_id, golfer_id)
  );

  CREATE TABLE IF NOT EXISTS picks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id     TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    golfer_id     TEXT NOT NULL,
    golfer_name   TEXT NOT NULL,
    overall_pick  INTEGER NOT NULL,              -- 1-based draft order
    round         INTEGER NOT NULL,
    auto          INTEGER NOT NULL DEFAULT 0,     -- 1 if timer auto-pick
    created_at    INTEGER NOT NULL,
    UNIQUE (league_id, golfer_id)                -- a golfer can't be drafted twice
  );
  CREATE INDEX IF NOT EXISTS idx_picks_league ON picks(league_id);

  CREATE TABLE IF NOT EXISTS draft_state (
    league_id     TEXT PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
    current_pick  INTEGER NOT NULL DEFAULT 1,    -- overall pick on the clock
    pick_deadline INTEGER,                       -- epoch ms, nullable
    started_at    INTEGER,
    completed_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS scores_cache (
    tournament_id TEXT NOT NULL,
    golfer_id     TEXT NOT NULL,
    name          TEXT,
    to_par        INTEGER,                       -- relative to par; null if unknown
    status        TEXT,                          -- active | cut | wd | dq | not_started
    thru          TEXT,                          -- "12", "F", or null
    round         INTEGER,
    position      TEXT,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (tournament_id, golfer_id)
  );
`);

// --- lightweight migrations -------------------------------------------------
// CREATE TABLE IF NOT EXISTS won't add columns to a pre-existing table, so add
// new columns idempotently here.
function ensureColumn(table, column, ddl) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('teams', 'auto_pick', 'auto_pick INTEGER NOT NULL DEFAULT 0');

export default db;
