// Integration/wiring test: drives a full league through the real SQLite layer
// and services (tournament -> snake draft -> live leaderboard) against the mock
// provider. Uses a throwaway temp DB so it never touches dev data.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the DB at a temp file BEFORE importing anything that opens it.
const TMP_DB = path.join(os.tmpdir(), `ff-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;
process.env.ODDS_PROVIDER = 'mock';
process.env.SCORE_PROVIDER = 'mock';

const { db } = await import('../src/db.js');
const { setLeagueTournament } = await import('../src/services/leagues.js');
const { startDraft, makePick, getDraftView } = await import('../src/services/draftEngine.js');
const { buildLeaderboard } = await import('../src/services/leaderboard.js');
const { pollScoresOnce } = await import('../src/services/poller.js');

const LEAGUE = 'lg-test';
const TEAMS = ['team-1', 'team-2', 'team-3'];

// --- seed a lobby league with three teams ---------------------------------
db.prepare(
  `INSERT INTO leagues (id, name, invite_code, creator_player_id, status, created_at)
   VALUES (?, ?, ?, ?, 'lobby', ?)`
).run(LEAGUE, 'Test League', 'TEST01', 'p1', Date.now());
TEAMS.forEach((id, i) =>
  db
    .prepare('INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, LEAGUE, `p${i + 1}`, `Team ${i + 1}`, Date.now() + i)
);

const nextAvailableGolfer = () =>
  db
    .prepare(
      `SELECT gp.golfer_id FROM golfer_pool gp
       WHERE gp.league_id = ?
         AND NOT EXISTS (SELECT 1 FROM picks p WHERE p.league_id = gp.league_id AND p.golfer_id = gp.golfer_id)
       ORDER BY gp.odds_rank ASC LIMIT 1`
    )
    .get(LEAGUE).golfer_id;

// --- run the league --------------------------------------------------------
await setLeagueTournament(LEAGUE, 'mock-us-open-2026');
startDraft(LEAGUE, TEAMS);

let view = getDraftView(LEAGUE);
let guard = 0;
while (!view.complete && guard++ < 100) {
  view = makePick(LEAGUE, view.onClockTeamId, nextAvailableGolfer());
}
const finalView = getDraftView(LEAGUE);
await pollScoresOnce();
const lb = buildLeaderboard(LEAGUE);

after(() => {
  try {
    db.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + suffix, { force: true });
  } catch {
    /* best effort */
  }
});

// --- assertions ------------------------------------------------------------
test('tournament selection loads the golfer pool', () => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM golfer_pool WHERE league_id = ?').get(LEAGUE).n;
  assert.equal(n, 60);
});

test('snake draft completes and locks 6-golfer rosters', () => {
  assert.equal(finalView.complete, true);
  assert.equal(finalView.status, 'active');
  assert.equal(finalView.picks.length, TEAMS.length * 6);
  for (const t of finalView.teams) assert.equal(t.picks.length, 6);
  // No golfer drafted twice.
  const ids = finalView.picks.map((p) => p.golferId);
  assert.equal(new Set(ids).size, ids.length);
});

test('round 2 order is the reverse of round 1 (snake)', () => {
  const r1 = finalView.picks.filter((p) => p.round === 1).map((p) => p.teamId);
  const r2 = finalView.picks.filter((p) => p.round === 2).map((p) => p.teamId);
  assert.deepEqual(r2, [...r1].reverse());
});

test('leaderboard builds, counts best 3, and ranks lowest-first', () => {
  assert.equal(lb.teams.length, TEAMS.length);
  for (const t of lb.teams) {
    assert.equal(typeof t.teamScore, 'number'); // all golfers have a score (E pre-round)
    assert.equal(t.counting.length, 3); // best 3 of 6
    assert.equal(t.counting.length + t.dropped.length, 6);
  }
  // Ranked ascending by team score (lower is better).
  for (let i = 1; i < lb.teams.length; i++) {
    assert.ok(lb.teams[i - 1].teamScore <= lb.teams[i].teamScore);
  }
});
