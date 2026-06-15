// Draft endpoints: view the board, start the draft, and make picks.
import { Router } from 'express';
import { db } from '../db.js';
import { startDraft, makePick, getDraftView } from '../services/draftEngine.js';
import { getLeagueState } from '../services/leagues.js';
import { buildLeaderboard } from '../services/leaderboard.js';
import { pollScoresOnce } from '../services/poller.js';
import { broadcast } from '../ws.js';

export const draftRouter = Router();

const qLeague = db.prepare('SELECT * FROM leagues WHERE id = ?');
const qTeamByPlayer = db.prepare('SELECT * FROM teams WHERE league_id = ? AND player_id = ?');

// GET /api/leagues/:id/draft — the live draft board.
draftRouter.get('/:id/draft', (req, res) => {
  const view = getDraftView(req.params.id);
  if (!view) return res.status(404).json({ error: 'League not found' });
  res.json(view);
});

// POST /api/leagues/:id/draft/start — creator starts (optionally sets order).
draftRouter.post('/:id/draft/start', (req, res, next) => {
  try {
    const league = qLeague.get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.creator_player_id !== req.body?.playerId) {
      return res.status(403).json({ error: 'Only the league creator can start the draft' });
    }
    const view = startDraft(league.id, req.body?.order);
    broadcast(league.id, 'draft', view);
    broadcast(league.id, 'lobby', getLeagueState(league.id));
    res.json(view);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/draft/pick — the player's team drafts a golfer.
draftRouter.post('/:id/draft/pick', (req, res, next) => {
  try {
    const league = qLeague.get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const { playerId, golferId } = req.body || {};
    const team = qTeamByPlayer.get(league.id, playerId);
    if (!team) return res.status(403).json({ error: 'You do not have a team in this league' });
    if (!golferId) return res.status(400).json({ error: 'golferId is required' });

    const view = makePick(league.id, team.id, golferId);
    broadcast(league.id, 'draft', view);

    // If that pick completed the draft, the league is now live — push the
    // first leaderboard right away instead of waiting for the next poll.
    if (view.complete) {
      broadcast(league.id, 'lobby', getLeagueState(league.id));
      pollScoresOnce()
        .then(() => broadcast(league.id, 'leaderboard', buildLeaderboard(league.id)))
        .catch(() => {});
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});
