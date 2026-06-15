// Background schedulers:
//  1) Score poller — every SCORE_POLL_SECONDS, fetch live scores for each active
//     league's tournament, cache them, rebuild leaderboards, and push to clients.
//  2) Draft timer — every second, auto-pick for any league whose pick clock has
//     expired, and push the updated draft board.
import { db } from '../db.js';
import { config } from '../config.js';
import { scoreProvider } from '../providers/scoreProvider/index.js';
import { buildLeaderboard } from './leaderboard.js';
import { autopickIfExpired, getDraftView } from './draftEngine.js';
import { broadcast } from '../ws.js';

const qActiveTournaments = db.prepare(
  "SELECT DISTINCT tournament_id FROM leagues WHERE status = 'active' AND tournament_id IS NOT NULL"
);
const qActiveLeagues = db.prepare("SELECT id FROM leagues WHERE status = 'active'");
const qDraftingLeagues = db.prepare(
  "SELECT id FROM leagues WHERE status = 'drafting' AND pick_timer_seconds IS NOT NULL"
);

const upsertScore = db.prepare(`
  INSERT INTO scores_cache (tournament_id, golfer_id, name, to_par, status, thru, round, position, updated_at)
  VALUES (@tournament_id, @golfer_id, @name, @to_par, @status, @thru, @round, @position, @updated_at)
  ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
    name = excluded.name, to_par = excluded.to_par, status = excluded.status,
    thru = excluded.thru, round = excluded.round, position = excluded.position,
    updated_at = excluded.updated_at
`);

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

function tickDraftTimers() {
  for (const { id } of qDraftingLeagues.all()) {
    try {
      const view = autopickIfExpired(id);
      if (view) broadcast(id, 'draft', view);
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
