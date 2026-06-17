// Tests for resetting a draft back to the lobby.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `ff-reset-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;
process.env.ODDS_PROVIDER = 'mock';
process.env.SCORE_PROVIDER = 'mock';

const { db } = await import('../src/db.js');
const { setLeagueTournament } = await import('../src/services/leagues.js');
const { startDraft, makePick, resetDraft, getDraftView } = await import('../src/services/draftEngine.js');

const L = 'lg-reset';
const T1 = 'r-t1';
const T2 = 'r-t2';

db.prepare(
  "INSERT INTO leagues (id, name, invite_code, creator_player_id, status, created_at) VALUES (?, 'Reset', 'RST01', 'p1', 'lobby', 1)"
).run(L);
db.prepare('INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)').run(T1, L, 'p1', 'A', 1);
db.prepare('INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)').run(T2, L, 'p2', 'B', 2);

await setLeagueTournament(L, 'mock-us-open-2026');
startDraft(L, [T1, T2]);

// Make a couple of picks.
const nextGolfer = () =>
  db
    .prepare(
      `SELECT gp.golfer_id FROM golfer_pool gp
       WHERE gp.league_id = ? AND NOT EXISTS (SELECT 1 FROM picks p WHERE p.league_id = gp.league_id AND p.golfer_id = gp.golfer_id)
       ORDER BY gp.odds_rank ASC LIMIT 1`
    )
    .get(L).golfer_id;
let v = getDraftView(L);
v = makePick(L, v.onClockTeamId, nextGolfer());
v = makePick(L, v.onClockTeamId, nextGolfer());

const afterPicks = getDraftView(L);
const reset = resetDraft(L);
// Snapshot the DB right after reset, BEFORE re-starting (which repopulates it).
const postReset = {
  picks: db.prepare('SELECT COUNT(*) AS n FROM picks WHERE league_id = ?').get(L).n,
  draftState: db.prepare('SELECT COUNT(*) AS n FROM draft_state WHERE league_id = ?').get(L).n,
  orderJson: db.prepare('SELECT draft_order_json FROM leagues WHERE id = ?').get(L).draft_order_json,
  slots: db.prepare('SELECT draft_position FROM teams WHERE league_id = ?').all(L),
};
startDraft(L, [T2, T1]); // re-start with a new order
const reStart = getDraftView(L);

after(() => {
  try {
    db.close();
    for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
  } catch {
    /* best effort */
  }
});

test('draft has picks before reset', () => {
  assert.equal(afterPicks.status, 'drafting');
  assert.equal(afterPicks.picks.length, 2);
});

test('reset clears picks, order, slots and returns to the lobby', () => {
  assert.equal(reset.status, 'lobby');
  assert.equal(postReset.picks, 0);
  assert.equal(postReset.draftState, 0);
  assert.equal(postReset.orderJson, null);
  assert.ok(postReset.slots.every((s) => s.draft_position === null));
});

test('league can be drafted again after a reset', () => {
  assert.equal(reStart.status, 'drafting');
  assert.deepEqual(reStart.draftOrder, [T2, T1]);
  assert.equal(reStart.onClockTeamId, T2);
});
