// Sportradar Golf v3 ScoreProvider — the recommended *sanctioned* live-scoring
// source for production (licensed, documented, ToS-friendly — unlike scraping
// PGATour.com). Enable with SCORE_PROVIDER=sportradar and SPORTRADAR_API_KEY.
//
// Docs: https://developer.sportradar.com/golf/reference  (Golf v3)
//
// Cross-provider id matching: odds (The Odds API) and scores (Sportradar) use
// different golfer ids, so this provider emits golferId = slug(name) and the
// scoring layer matches pool golfers to scores by id and then by normalized
// name. See server/src/services/nameMatch.js.
import { config } from '../../config.js';
import { slugify } from '../../fixtures/golfers.js';

const BASE = `https://api.sportradar.com/golf/${config.sportradarAccessLevel}/v3/en`;

function requireKey() {
  if (!config.sportradarApiKey) {
    throw new Error(
      'SCORE_PROVIDER=sportradar but SPORTRADAR_API_KEY is not set. Get one at https://developer.sportradar.com'
    );
  }
}

// Map Sportradar status strings to our enum.
function mapStatus(srStatus) {
  const s = (srStatus || '').toLowerCase();
  if (s.includes('cut') || s === 'mc') return 'cut';
  if (s.includes('withdraw') || s === 'wd') return 'wd';
  if (s.includes('disqual') || s === 'dq') return 'dq';
  if (s.includes('not') || s === '') return 'not_started';
  return 'active';
}

export const sportradarScoreProvider = {
  name: 'sportradar',

  // `tournamentId` must be a Sportradar tournament id (e.g. "sr:tournament:...").
  // When the league's selected tournament came from the odds provider, pin the
  // matching Sportradar id via SPORTRADAR_TOURNAMENT_ID, or resolve it once from
  // the schedule endpoint (/tournaments/schedule.json) and store it.
  async getScores(tournamentId) {
    requireKey();
    const id = process.env.SPORTRADAR_TOURNAMENT_ID || tournamentId;
    if (!id || !String(id).startsWith('sr:')) {
      console.warn(
        '[sportradar] No Sportradar tournament id resolved for',
        tournamentId,
        '— set SPORTRADAR_TOURNAMENT_ID. Returning no scores.'
      );
      return [];
    }

    const url = `${BASE}/tournaments/${id}/leaderboard.json?api_key=${config.sportradarApiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Sportradar ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const players = data.leaderboard || [];

    return players.map((p) => {
      const name = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const status = mapStatus(p.status);
      // Sportradar `score` is already to-par as an integer (e.g. -5, +3).
      const toPar = typeof p.score === 'number' ? p.score : null;
      // "thru" comes from the latest round entry.
      const rounds = p.rounds || [];
      const current = rounds[rounds.length - 1] || {};
      let thru = null;
      if (status === 'cut') thru = 'CUT';
      else if (typeof current.thru === 'number') thru = current.thru >= 18 ? 'F' : String(current.thru);

      return {
        golferId: slugify(name),
        name,
        toPar,
        status,
        thru,
        round: current.number || data.round || null,
        position: p.position != null ? `${p.tied ? 'T' : ''}${p.position}` : null,
      };
    });
  },
};
