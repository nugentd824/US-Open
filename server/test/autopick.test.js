// Tests for the auto-pick toggle + timer auto-pick, against a temp DB.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `ff-auto-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;
process.env.ODDS_PROVIDER = 'mock';
process.env.SCORE_PROVIDER = 'mock';

const { db } = await import('../src/db.js');
const { setLeagueTournament } = await import('../src/services/leagues.js');
const { startDraft, maybeAutopick, setTeamAutoPick, getDraftView } = await import(
  '../src/services/draftEngine.js'
);
const { runAutopicks } = await import('../src/services/poller.js');

const LEAGUE = 'lg-auto';
const T1 = 'auto-t1';
const T2 = 'auto-t2';

db.prepare(
  `INSERT INTO leagues (id, name, invite_code, creator_player_id, status, pick_timer_seconds, created_at)
   VALUES (?, 'Auto League', 'AUTO01', 'p1', 'lobby', 60, ?)`
).run(LEAGUE, Date.now());
db.prepare('INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)').run(
  T1, LEAGUE, 'p1', 'Team 1', 1
);
db.prepare('INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)').run(
  T2, LEAGUE, 'p2', 'Team 2', 2
);

await setLeagueTournament(LEAGUE, 'mock-us-open-2026');
startDraft(LEAGUE, [T1, T2]);

// (A) Team 1 turns auto-pick on while on the clock -> drafts the favorite now.
setTeamAutoPick(T1, true);
const vA = maybeAutopick(LEAGUE);

// (B) No auto on Team 2, but force the pick clock to expire -> auto-pick anyway.
db.prepare('UPDATE draft_state SET pick_deadline = ? WHERE league_id = ?').run(Date.now() - 1000, LEAGUE);
const vB = maybeAutopick(LEAGUE);

// (C) Both teams auto -> a single drain finishes the rest of the draft.
setTeamAutoPick(T1, true);
setTeamAutoPick(T2, true);
runAutopicks(LEAGUE, { doBroadcast: false });
const finalView = getDraftView(LEAGUE);

after(() => {
  try {
    db.close();
    for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
  } catch {
    /* best effort */
  }
});

test('toggling auto-pick on the clock drafts the top available favorite', () => {
  assert.ok(vA, 'a pick should have been made');
  const t1 = vA.teams.find((t) => t.id === T1);
  assert.equal(t1.picks.length, 1);
  assert.equal(t1.picks[0].golferId, 'scottie-scheffler'); // odds_rank 1
  assert.equal(t1.picks[0].auto, true);
  assert.equal(vA.onClockTeamId, T2); // clock advanced
});

test('an expired pick timer auto-picks even with auto-pick off', () => {
  assert.ok(vB, 'a pick should have been made on timer expiry');
  const t2 = vB.teams.find((t) => t.id === T2);
  assert.equal(t2.picks.length, 1);
  assert.equal(t2.picks[0].auto, true);
});

test('runAutopicks drains consecutive auto-pick teams to completion', () => {
  assert.equal(finalView.complete, true);
  assert.equal(finalView.status, 'active');
  assert.equal(finalView.picks.length, 12); // 2 teams x 6
  for (const t of finalView.teams) assert.equal(t.picks.length, 6);
});
