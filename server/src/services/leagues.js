// League state helpers shared by routes and websocket broadcasts.
import { customAlphabet } from 'nanoid';
import { db } from '../db.js';
import { oddsProvider } from '../providers/oddsProvider.js';
import { scoringRules } from './leaderboard.js';

// Friendly, unambiguous invite codes (no 0/O/1/I).
export const makeInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const qLeague = db.prepare('SELECT * FROM leagues WHERE id = ?');
const qLeagueByCode = db.prepare('SELECT * FROM leagues WHERE invite_code = ?');
const qTeams = db.prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY joined_at ASC');
const qDraftState = db.prepare('SELECT * FROM draft_state WHERE league_id = ?');
const qPoolCount = db.prepare('SELECT COUNT(*) AS n FROM golfer_pool WHERE league_id = ?');

export function getLeagueByCode(code) {
  return qLeagueByCode.get(String(code || '').toUpperCase());
}

// Lobby/meta view of a league (no heavy pool/score data).
export function getLeagueState(leagueId) {
  const league = qLeague.get(leagueId);
  if (!league) return null;
  const teams = qTeams.all(leagueId);
  const ds = qDraftState.get(leagueId);
  const poolN = qPoolCount.get(leagueId).n;

  return {
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    creatorPlayerId: league.creator_player_id,
    status: league.status,
    rosterSize: league.roster_size,
    scoresCounted: league.scores_counted,
    pickTimerSeconds: league.pick_timer_seconds,
    tournament: league.tournament_json ? JSON.parse(league.tournament_json) : null,
    hasPool: poolN > 0,
    fieldSize: poolN,
    rules: scoringRules(league),
    draftStarted: !!(ds && ds.started_at),
    draftComplete: !!(ds && ds.completed_at) || league.status === 'active',
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      playerId: t.player_id,
      draftPosition: t.draft_position,
    })),
  };
}

// Select the tournament for a league and load its field+odds into the pool.
export async function setLeagueTournament(leagueId, tournamentId) {
  const league = qLeague.get(leagueId);
  if (!league) throw Object.assign(new Error('League not found'), { status: 404 });
  if (league.status !== 'lobby') {
    throw Object.assign(new Error('Cannot change tournament after the draft has started'), {
      status: 409,
    });
  }

  const meta = await oddsProvider.getTournament(tournamentId);
  if (!meta) throw Object.assign(new Error('Unknown tournament'), { status: 400 });
  const field = await oddsProvider.getField(tournamentId);
  if (!field.length) {
    throw Object.assign(new Error('No golfer field/odds available for that tournament yet'), {
      status: 400,
    });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE leagues SET tournament_id = ?, tournament_json = ? WHERE id = ?').run(
      tournamentId,
      JSON.stringify(meta),
      leagueId
    );
    db.prepare('DELETE FROM golfer_pool WHERE league_id = ?').run(leagueId);
    const ins = db.prepare(
      `INSERT INTO golfer_pool (league_id, golfer_id, name, odds_decimal, implied_prob, odds_rank)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const g of field) {
      ins.run(leagueId, g.golferId, g.name, g.oddsDecimal ?? null, g.impliedProb ?? null, g.oddsRank ?? null);
    }
  });
  tx();
  return getLeagueState(leagueId);
}

// The draftable golfer pool with live availability (and current scores if any).
const qPool = db.prepare('SELECT * FROM golfer_pool WHERE league_id = ? ORDER BY odds_rank ASC');
const qPickedIds = db.prepare('SELECT golfer_id, team_id FROM picks WHERE league_id = ?');
const qTeamName = db.prepare('SELECT name FROM teams WHERE id = ?');

export function getGolferPool(leagueId) {
  const pool = qPool.all(leagueId);
  const picked = new Map(qPickedIds.all(leagueId).map((p) => [p.golfer_id, p.team_id]));
  return pool.map((g) => {
    const teamId = picked.get(g.golfer_id) || null;
    return {
      golferId: g.golfer_id,
      name: g.name,
      oddsDecimal: g.odds_decimal,
      impliedProb: g.implied_prob,
      oddsRank: g.odds_rank,
      drafted: !!teamId,
      draftedByTeamId: teamId,
      draftedByTeamName: teamId ? qTeamName.get(teamId)?.name ?? null : null,
    };
  });
}
