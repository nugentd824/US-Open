// ===========================================================================
// SNAKE DRAFT ENGINE
// ===========================================================================
// Order is 1→N in round 1, N→1 in round 2, 1→N in round 3, and so on, for as
// many rounds as there are roster spots (default 6). Tweak the rules here.
//
// `order` is the array of team ids in seed order (slot 1 .. slot N). For a
// given 1-based overall pick we work out the round and which slot is up:
//   • round           = ceil(pick / N)
//   • index in round  = (pick - 1) % N
//   • odd rounds go forward (slot 0..N-1), even rounds go backward (N-1..0)
// ===========================================================================
import { db } from '../db.js';

export function snakeTeamForPick(order, overallPick) {
  const n = order.length;
  const round = Math.ceil(overallPick / n);
  const idxInRound = (overallPick - 1) % n;
  const idx = round % 2 === 1 ? idxInRound : n - 1 - idxInRound; // snake reversal
  return { teamId: order[idx], round };
}

export function totalPicks(order, rosterSize) {
  return order.length * rosterSize;
}

// --- prepared statements ----------------------------------------------------
const qLeague = db.prepare('SELECT * FROM leagues WHERE id = ?');
const qTeams = db.prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY joined_at ASC');
const qDraftState = db.prepare('SELECT * FROM draft_state WHERE league_id = ?');
const qPicks = db.prepare('SELECT * FROM picks WHERE league_id = ? ORDER BY overall_pick ASC');
const qPoolGolfer = db.prepare('SELECT * FROM golfer_pool WHERE league_id = ? AND golfer_id = ?');
const qNextFavorite = db.prepare(`
  SELECT gp.* FROM golfer_pool gp
  WHERE gp.league_id = ?
    AND NOT EXISTS (SELECT 1 FROM picks p WHERE p.league_id = gp.league_id AND p.golfer_id = gp.golfer_id)
  ORDER BY gp.odds_rank ASC
  LIMIT 1
`);

function deadlineFor(league) {
  return league.pick_timer_seconds ? Date.now() + league.pick_timer_seconds * 1000 : null;
}

// Start (or restart) the draft. `order` is an optional array of team ids; if
// omitted, the current teams are shuffled into a random order.
export function startDraft(leagueId, order) {
  const league = qLeague.get(leagueId);
  if (!league) throw httpError(404, 'League not found');
  if (!league.tournament_id) throw httpError(400, 'Select a tournament before drafting');

  const teams = qTeams.all(leagueId);
  if (teams.length < 2) throw httpError(400, 'Need at least 2 teams to draft');

  let finalOrder = order;
  if (!finalOrder || finalOrder.length !== teams.length) {
    finalOrder = shuffle(teams.map((t) => t.id));
  } else {
    const ids = new Set(teams.map((t) => t.id));
    if (!finalOrder.every((id) => ids.has(id))) throw httpError(400, 'Invalid draft order');
  }

  const tx = db.transaction(() => {
    finalOrder.forEach((teamId, i) => {
      db.prepare('UPDATE teams SET draft_position = ? WHERE id = ?').run(i + 1, teamId);
    });
    db.prepare("UPDATE leagues SET status = 'drafting', draft_order_json = ? WHERE id = ?").run(
      JSON.stringify(finalOrder),
      leagueId
    );
    db.prepare('DELETE FROM picks WHERE league_id = ?').run(leagueId);
    db.prepare(
      `INSERT INTO draft_state (league_id, current_pick, pick_deadline, started_at, completed_at)
       VALUES (?, 1, ?, ?, NULL)
       ON CONFLICT(league_id) DO UPDATE SET current_pick = 1, pick_deadline = excluded.pick_deadline,
         started_at = excluded.started_at, completed_at = NULL`
    ).run(leagueId, deadlineFor(league), Date.now());
  });
  tx();
  return getDraftView(leagueId);
}

// Make a pick. `teamId` is the drafting team; pass { auto: true } to bypass the
// turn check (used by the timer's auto-pick). Throws on invalid picks.
export function makePick(leagueId, teamId, golferId, { auto = false } = {}) {
  const league = qLeague.get(leagueId);
  if (!league) throw httpError(404, 'League not found');
  if (league.status !== 'drafting') throw httpError(409, 'Draft is not in progress');

  const ds = qDraftState.get(leagueId);
  const order = JSON.parse(league.draft_order_json);
  const total = totalPicks(order, league.roster_size);
  if (ds.current_pick > total) throw httpError(409, 'Draft is already complete');

  const { teamId: onClock, round } = snakeTeamForPick(order, ds.current_pick);
  if (!auto && teamId !== onClock) throw httpError(403, "It is not your team's turn");

  const golfer = qPoolGolfer.get(leagueId, golferId);
  if (!golfer) throw httpError(400, 'Golfer is not in this tournament field');

  const result = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO picks (league_id, team_id, golfer_id, golfer_name, overall_pick, round, auto, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(leagueId, onClock, golferId, golfer.name, ds.current_pick, round, auto ? 1 : 0, Date.now());
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw httpError(409, 'Golfer already drafted');
      throw e;
    }

    const nextPick = ds.current_pick + 1;
    if (nextPick > total) {
      // Draft complete — lock rosters and flip the league to live scoring.
      db.prepare('UPDATE draft_state SET current_pick = ?, pick_deadline = NULL, completed_at = ? WHERE league_id = ?')
        .run(nextPick, Date.now(), leagueId);
      db.prepare("UPDATE leagues SET status = 'active' WHERE id = ?").run(leagueId);
    } else {
      db.prepare('UPDATE draft_state SET current_pick = ?, pick_deadline = ? WHERE league_id = ?')
        .run(nextPick, deadlineFor(league), leagueId);
    }
  });
  result();
  return getDraftView(leagueId);
}

// Timer enforcement: if the team on the clock has run out of time, auto-draft
// the highest-odds (favorite) golfer still available. Returns the new view if a
// pick was made, otherwise null. Called by the draft timer loop.
export function autopickIfExpired(leagueId) {
  const league = qLeague.get(leagueId);
  if (!league || league.status !== 'drafting' || !league.pick_timer_seconds) return null;
  const ds = qDraftState.get(leagueId);
  if (!ds || !ds.pick_deadline || Date.now() < ds.pick_deadline) return null;

  const favorite = qNextFavorite.get(leagueId);
  if (!favorite) return null;
  const order = JSON.parse(league.draft_order_json);
  const { teamId } = snakeTeamForPick(order, ds.current_pick);
  return makePick(leagueId, teamId, favorite.golfer_id, { auto: true });
}

// Build the full draft view used by the API and websocket broadcasts.
export function getDraftView(leagueId) {
  const league = qLeague.get(leagueId);
  if (!league) return null;
  const teams = qTeams.all(leagueId);
  const picks = qPicks.all(leagueId);
  const ds = qDraftState.get(leagueId);
  const order = league.draft_order_json ? JSON.parse(league.draft_order_json) : [];
  const total = order.length ? totalPicks(order, league.roster_size) : 0;

  let onClock = null;
  let round = null;
  let complete = false;
  if (league.status === 'drafting' && ds) {
    if (ds.current_pick > total) {
      complete = true;
    } else {
      const s = snakeTeamForPick(order, ds.current_pick);
      onClock = s.teamId;
      round = s.round;
    }
  } else if (league.status === 'active') {
    complete = true;
  }

  const picksByTeam = {};
  for (const t of teams) picksByTeam[t.id] = [];
  for (const p of picks) (picksByTeam[p.team_id] ||= []).push(p);

  return {
    leagueId,
    status: league.status,
    rosterSize: league.roster_size,
    scoresCounted: league.scores_counted,
    pickTimerSeconds: league.pick_timer_seconds,
    draftOrder: order,
    currentPick: ds ? ds.current_pick : null,
    totalPicks: total,
    onClockTeamId: onClock,
    round,
    complete,
    pickDeadline: ds ? ds.pick_deadline : null,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      playerId: t.player_id,
      draftPosition: t.draft_position,
      picks: (picksByTeam[t.id] || []).map((p) => ({
        golferId: p.golfer_id,
        name: p.golfer_name,
        overallPick: p.overall_pick,
        round: p.round,
        auto: !!p.auto,
      })),
    })),
    picks: picks.map((p) => ({
      teamId: p.team_id,
      golferId: p.golfer_id,
      name: p.golfer_name,
      overallPick: p.overall_pick,
      round: p.round,
      auto: !!p.auto,
    })),
  };
}

// --- helpers ----------------------------------------------------------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
