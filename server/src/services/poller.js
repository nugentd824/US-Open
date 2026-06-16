// Background schedulers:
//  1) Score poller — every SCORE_POLL_SECONDS, fetch live scores for each active
//     league's tournament, cache them, rebuild leaderboards, and push to clients.
//  2) Draft timer — every second, auto-pick for any league whose pick clock has
//     expired OR whose on-clock team has its auto-pick toggle on; push the board.
import { db } from '../db.js';
import { config } from '../config.js';
import { scoreProvider } from '../providers/scoreProvider/index.js';
import { buildLeaderboard } from './leaderboard.js';
import { maybeAutopick } from './draftEngine.js';
import { getLeagueState } from './leagues.js';
import { broadcast } from '../ws.js';

const qActiveTournaments = db.prepare(
  "SELECT DISTINCT tournament_id FROM leagues WHERE status = 'active' AND tournament_id IS NOT NULL"
);
const qActiveLeagues = db.prepare("SELECT id FROM leagues WHERE status = 'active'");
const qDraftingLeagues = db.prepare("SELECT id FROM leagues WHERE status = 'drafting'");

const upsertScore = db.prepare(`
  INSERT INTO scores_cache (tournament_id, golfer_id, name, to_par, status, thru, round, position, updated_at)
  VALUES (@tournament_id, @golfer_id, @name, @to_par, @status, @thru, @round, @position, @updated_at)
  ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
    name = excluded.name, to_par = excluded.to_par, status = excluded.status,
    thru = excluded.thru, round = excluded.round, position = excluded.position,
    updated_at = excluded.updated_at
`);

// Remove cache rows not refreshed by the latest poll (e.g. a golfer whose id
// changed because the provider's name form shifted), so a score can't freeze.
const deleteStaleScores = db.prepare(
  'DELETE FROM scores_cache WHERE tournament_id = ? AND updated_at < ?'
);

async function pollScoresOnce() {
  const tournamentIds = qActiveTournaments.all().map((r) => r.tournament_id);
  const now = Date.now();

  for (const tid of tournamentIds) {
    try {
      const scores = await scoreProvider.getScores(tid);
      const writeAll = db.transaction((rows) => {
        for (const s of rows) {
          upsertScore.run({
            tournament_id: tid,
            golfer_id: s.golferId,
            name: s.name,
            to_par: typeof s.toPar === 'number' ? s.toPar : null,
            status: s.status || null,
            thru: s.thru ?? null,
            round: s.round ?? null,
            position: s.position ?? null,
            updated_at: now,
          });
        }
      });
      writeAll(scores);
      // Only prune when we actually got data, so a transient empty/error
      // response doesn't wipe the cached leaderboard.
      if (scores.length > 0) deleteStaleScores.run(tid, now);
    } catch (err) {
      console.warn(`[poller] score fetch failed for ${tid}:`, err.message);
    }
  }

  // Rebuild + push each active league's leaderboard.
  for (const { id } of qActiveLeagues.all()) {
    try {
      const lb = buildLeaderboard(id);
      if (lb) broadcast(id, 'leaderboard', lb);
    } catch (err) {
      console.warn(`[poller] leaderboard build failed for ${id}:`, err.message);
    }
  }
}

// Drain all due auto-picks for a league (consecutive auto-pick teams resolve in
// one pass), then broadcast the result. If the draft completes, also flip the
// lobby live and push the first leaderboard. Returns the last view, or null.
export function runAutopicks(leagueId, { doBroadcast = true } = {}) {
  let last = null;
  for (let guard = 0; guard < 1000; guard++) {
    const view = maybeAutopick(leagueId);
    if (!view) break;
    last = view;
    if (view.complete) break;
  }
  if (last && doBroadcast) {
    broadcast(leagueId, 'draft', last);
    if (last.complete) {
      broadcast(leagueId, 'lobby', getLeagueState(leagueId));
      pollScoresOnce()
        .then(() => broadcast(leagueId, 'leaderboard', buildLeaderboard(leagueId)))
        .catch(() => {});
    }
  }
  return last;
}

function tickDraftTimers() {
  for (const { id } of qDraftingLeagues.all()) {
    try {
      runAutopicks(id);
    } catch (err) {
      console.warn(`[poller] draft autopick failed for ${id}:`, err.message);
    }
  }
}

export function startSchedulers() {
  // Run an immediate score poll so freshly-active leagues populate quickly.
  pollScoresOnce().catch(() => {});
  const scoreTimer = setInterval(() => {
    pollScoresOnce().catch((e) => console.warn('[poller]', e.message));
  }, Math.max(5, config.scorePollSeconds) * 1000);

  const draftTimer = setInterval(tickDraftTimers, 1000);

  console.log(
    `[poller] scores every ${config.scorePollSeconds}s; draft timer 1s; ` +
      `score provider = ${scoreProvider.name || config.scoreProvider}`
  );
  return () => {
    clearInterval(scoreTimer);
    clearInterval(draftTimer);
  };
}

// Exposed so routes can force an immediate refresh (e.g. right after a draft
// completes) without waiting for the next interval.
export { pollScoresOnce };
