// Tournament selection endpoints (backed by the odds provider).
import { Router } from 'express';
import { oddsProvider } from '../providers/oddsProvider.js';

export const tournamentsRouter = Router();

// GET /api/tournaments — list of selectable scheduled events.
tournamentsRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ tournaments: await oddsProvider.getTournaments() });
  } catch (err) {
    next(err);
  }
});

// GET /api/tournaments/:id — details (name, dates, course, field size).
tournamentsRouter.get('/:id', async (req, res, next) => {
  try {
    const t = await oddsProvider.getTournament(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    res.json(t);
  } catch (err) {
    next(err);
  }
});
