// League lifecycle: create, join, configure, and read pool/leaderboard.
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import {
  makeInviteCode,
  getLeagueState,
  getLeagueByCode,
  setLeagueTournament,
  getGolferPool,
} from '../services/leagues.js';
import { buildLeaderboard } from '../services/leaderboard.js';
import { broadcast } from '../ws.js';

export const leaguesRouter = Router();

const qLeague = db.prepare('SELECT * FROM leagues WHERE id = ?');
const qTeamByPlayer = db.prepare('SELECT * FROM teams WHERE league_id = ? AND player_id = ?');
const qTeamCount = db.prepare('SELECT COUNT(*) AS n FROM teams WHERE league_id = ?');

const MAX_TEAMS = 12;

function broadcastLobby(leagueId) {
  broadcast(leagueId, 'lobby', getLeagueState(leagueId));
}

function requireCreator(league, playerId) {
  if (!playerId || league.creator_player_id !== playerId) {
    throw Object.assign(new Error('Only the league creator can do that'), { status: 403 });
  }
}

// POST /api/leagues — create a league and the creator's team.
leaguesRouter.post('/', (req, res, next) => {
  try {
    const { name, playerId, teamName } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'League name is required' });
    if (!playerId) return res.status(400).json({ error: 'playerId is required' });
    if (!teamName?.trim()) return res.status(400).json({ error: 'Team name is required' });

    const id = nanoid(12);
    let code = makeInviteCode();
    while (getLeagueByCode(code)) code = makeInviteCode();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO leagues (id, name, invite_code, creator_player_id, status, created_at)
         VALUES (?, ?, ?, ?, 'lobby', ?)`
      ).run(id, name.trim(), code, playerId, Date.now());
      db.prepare(
        `INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)`
      ).run(nanoid(12), id, playerId, teamName.trim(), Date.now());
    })();

    res.status(201).json({ league: getLeagueState(id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/resolve/:code — invite code -> league id.
leaguesRouter.get('/resolve/:code', (req, res) => {
  const league = getLeagueByCode(req.params.code);
  if (!league) return res.status(404).json({ error: 'No league found for that code' });
  res.json({ leagueId: league.id });
});

// GET /api/leagues/:id — lobby/meta state.
leaguesRouter.get('/:id', (req, res) => {
  const state = getLeagueState(req.params.id);
  if (!state) return res.status(404).json({ error: 'League not found' });
  res.json(state);
});

// POST /api/leagues/:id/join — join with a team name (idempotent per player).
leaguesRouter.post('/:id/join', (req, res, next) => {
  try {
    const league = qLeague.get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const { playerId, teamName } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId is required' });

    const existing = qTeamByPlayer.get(league.id, playerId);
    if (existing) {
      // Allow renaming while still in the lobby.
      if (teamName?.trim() && league.status === 'lobby') {
        db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(teamName.trim(), existing.id);
      }
      broadcastLobby(league.id);
      return res.json({ league: getLeagueState(league.id), teamId: existing.id });
    }

    if (league.status !== 'lobby') {
      return res.status(409).json({ error: 'This league has already started its draft' });
    }
    if (!teamName?.trim()) return res.status(400).json({ error: 'Team name is required' });
    if (qTeamCount.get(league.id).n >= MAX_TEAMS) {
      return res.status(409).json({ error: `League is full (max ${MAX_TEAMS} teams)` });
    }

    const teamId = nanoid(12);
    db.prepare(
      `INSERT INTO teams (id, league_id, player_id, name, joined_at) VALUES (?, ?, ?, ?, ?)`
    ).run(teamId, league.id, playerId, teamName.trim(), Date.now());

    broadcastLobby(league.id);
    res.status(201).json({ league: getLeagueState(league.id), teamId });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/tournament — creator selects the event + loads the pool.
leaguesRouter.post('/:id/tournament', async (req, res, next) => {
  try {
    const league = qLeague.get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    requireCreator(league, req.body?.playerId);
    const { tournamentId } = req.body || {};
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId is required' });

    const state = await setLeagueTournament(league.id, tournamentId);
    broadcastLobby(league.id);
    res.json(state);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leagues/:id/settings — creator configures draft/scoring rules.
leaguesRouter.patch('/:id/settings', (req, res, next) => {
  try {
    const league = qLeague.get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    requireCreator(league, req.body?.playerId);
    if (league.status !== 'lobby') {
      return res.status(409).json({ error: 'Settings are locked once the draft starts' });
    }

    const rosterSize = clampInt(req.body?.rosterSize, league.roster_size, 1, 10);
    const scoresCounted = clampInt(req.body?.scoresCounted, league.scores_counted, 1, rosterSize);
    let pickTimer = league.pick_timer_seconds;
    if ('pickTimerSeconds' in (req.body || {})) {
      const v = req.body.pickTimerSeconds;
      pickTimer = v == null || v === '' ? null : clampInt(v, 60, 10, 600);
    }

    db.prepare(
      'UPDATE leagues SET roster_size = ?, scores_counted = ?, pick_timer_seconds = ? WHERE id = ?'
    ).run(rosterSize, scoresCounted, pickTimer, league.id);

    broadcastLobby(league.id);
    res.json(getLeagueState(league.id));
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/pool — the draftable golfer pool with availability.
leaguesRouter.get('/:id/pool', (req, res) => {
  const league = qLeague.get(req.params.id);
  if (!league) return res.status(404).json({ error: 'League not found' });
  res.json({ pool: getGolferPool(league.id) });
});

// GET /api/leagues/:id/leaderboard — live best-N-of-M standings.
leaguesRouter.get('/:id/leaderboard', (req, res) => {
  const lb = buildLeaderboard(req.params.id);
  if (!lb) return res.status(404).json({ error: 'League not found' });
  res.json(lb);
});

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
