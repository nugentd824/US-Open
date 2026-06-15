// Builds the live league leaderboard from the cached scores + rosters.
// Reads scores_cache (written by the poller), matches each rostered golfer to a
// score, runs the best-N-of-M engine, and ranks teams.
import { db } from '../db.js';
import { computeTeamScore, rankTeams } from './scoringEngine.js';
import { indexScoresByName, matchScore } from './nameMatch.js';
import { scoreProviderName } from '../providers/scoreProvider/index.js';

const qLeague = db.prepare('SELECT * FROM leagues WHERE id = ?');
const qTeams = db.prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY joined_at ASC');
const qPicks = db.prepare('SELECT * FROM picks WHERE league_id = ? ORDER BY overall_pick ASC');
const qPool = db.prepare('SELECT * FROM golfer_pool WHERE league_id = ?');
const qScores = db.prepare('SELECT * FROM scores_cache WHERE tournament_id = ?');

// Human-readable rule labels for the UI so players understand the scoring.
export function scoringRules(league) {
  return {
    counts: `Best ${league.scores_counted} of ${league.roster_size}`,
    missedCut: 'Missed cut (MC): score frozen at the cut line.',
    wdDq: 'Withdrawal / Disqualification (WD/DQ): treated like a missed cut — score frozen.',
    tieBreak: 'Ties: teams share the same rank (no tiebreaker).',
    provider: scoreProviderName,
  };
}

export function buildLeaderboard(leagueId) {
  const league = qLeague.get(leagueId);
  if (!league) return null;

  const teams = qTeams.all(leagueId);
  const picks = qPicks.all(leagueId);
  const pool = qPool.all(leagueId);
  const oddsRankById = new Map(pool.map((g) => [g.golfer_id, g.odds_rank]));

  const scoreRows = league.tournament_id ? qScores.all(league.tournament_id) : [];
  const index = indexScoresByName(
    scoreRows.map((r) => ({
      golferId: r.golfer_id,
      name: r.name,
      toPar: r.to_par,
      status: r.status,
      thru: r.thru,
      round: r.round,
      position: r.position,
    }))
  );

  const picksByTeam = {};
  for (const p of picks) (picksByTeam[p.team_id] ||= []).push(p);

  let lastUpdated = 0;
  for (const r of scoreRows) lastUpdated = Math.max(lastUpdated, r.updated_at || 0);

  const teamResults = teams.map((team) => {
    const golfers = (picksByTeam[team.id] || []).map((p) => {
      const score = matchScore({ golfer_id: p.golfer_id, name: p.golfer_name }, index);
      return {
        golferId: p.golfer_id,
        name: p.golfer_name,
        oddsRank: oddsRankById.get(p.golfer_id) ?? null,
        draftOverallPick: p.overall_pick,
        score: score
          ? {
              toPar: typeof score.toPar === 'number' ? score.toPar : null,
              status: score.status,
              thru: score.thru,
              round: score.round,
              position: score.position,
            }
          : null,
      };
    });

    const computed = computeTeamScore(golfers, league.scores_counted);
    return {
      teamId: team.id,
      teamName: team.name,
      playerId: team.player_id,
      draftPosition: team.draft_position,
      teamScore: computed.teamScore,
      totalAll: computed.totalAll,
      eligibleCount: computed.eligibleCount,
      flags: computed.flags,
      counting: computed.counting,
      dropped: computed.dropped,
    };
  });

  const ranked = rankTeams(teamResults);

  return {
    leagueId,
    leagueName: league.name,
    status: league.status,
    tournament: league.tournament_json ? JSON.parse(league.tournament_json) : null,
    rules: scoringRules(league),
    lastUpdated: lastUpdated || null,
    teams: ranked,
  };
}
