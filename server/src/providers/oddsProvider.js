// Odds provider: supplies the list of selectable tournaments and each
// tournament's golfer field WITH win odds. Odds drive draft ordering and the
// auto-pick fallback only — they never affect scoring.
//
// Swap providers with ODDS_PROVIDER=mock|theoddsapi.
import { config } from '../config.js';
import {
  getMockTournaments,
  getMockTournament,
  slugify,
} from '../fixtures/golfers.js';

// --- Mock implementation ----------------------------------------------------
const mockOdds = {
  async getTournaments() {
    return getMockTournaments();
  },
  async getTournament(id) {
    const t = getMockTournament(id);
    if (!t) return null;
    const { field, ...rest } = t;
    return { ...rest, fieldSize: field.length };
  },
  async getField(id) {
    const t = getMockTournament(id);
    return t ? t.field : [];
  },
};

// --- The Odds API implementation -------------------------------------------
// https://the-odds-api.com — golf "outrights" markets give the field + win odds.
const ODDS_BASE = 'https://api.the-odds-api.com/v4';

function requireKey() {
  if (!config.oddsApiKey) {
    throw new Error(
      'ODDS_PROVIDER=theoddsapi but ODDS_API_KEY is not set. Get a key at https://the-odds-api.com'
    );
  }
}

// The Odds API labels golf outright markets like title="US Open Winner",
// description="2026 Winner". Turn that into a clean tournament name ("US Open
// 2026") and drop the bogus "course" (the API has no course data).
function prettyGolfEvent(s) {
  let name = (s.title || s.key).replace(/\s*winner\s*$/i, '').trim();
  const year = (s.description || '').match(/\b(20\d{2})\b/)?.[1];
  if (year && !name.includes(year)) name = `${name} ${year}`;
  return {
    id: s.key,
    name,
    course: '', // The Odds API exposes no course
    location: '',
    startDate: null,
    endDate: null,
    par: 72, // not exposed by the API; default and let scoring relativize
  };
}

const theOddsApi = {
  async getTournaments() {
    requireKey();
    const res = await fetch(`${ODDS_BASE}/sports/?apiKey=${config.oddsApiKey}`);
    if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
    const sports = await res.json();
    // Each active golf sport is a selectable "tournament".
    return sports.filter((s) => s.group === 'Golf' && s.active).map(prettyGolfEvent);
  },

  async getTournament(id) {
    const all = await this.getTournaments();
    return all.find((t) => t.id === id) || null;
  },

  async getField(id) {
    requireKey();
    const url =
      `${ODDS_BASE}/sports/${id}/odds/?apiKey=${config.oddsApiKey}` +
      `&regions=us&markets=outrights&oddsFormat=decimal`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
    const events = await res.json();

    // Aggregate outright outcomes across events/bookmakers. Use the median
    // price per golfer for stability, since books disagree.
    const byName = new Map();
    for (const ev of events) {
      for (const bk of ev.bookmakers || []) {
        for (const mk of bk.markets || []) {
          if (mk.key !== 'outrights') continue;
          for (const oc of mk.outcomes || []) {
            const arr = byName.get(oc.name) || [];
            arr.push(oc.price);
            byName.set(oc.name, arr);
          }
        }
      }
    }

    const field = [...byName.entries()].map(([name, prices]) => {
      prices.sort((a, b) => a - b);
      const median = prices[Math.floor(prices.length / 2)];
      return {
        golferId: slugify(name),
        name,
        oddsDecimal: median,
        impliedProb: +(1 / median).toFixed(4),
      };
    });
    field.sort((a, b) => a.oddsDecimal - b.oddsDecimal);
    field.forEach((g, i) => (g.oddsRank = i + 1));
    return field;
  },
};

export const oddsProvider = config.oddsProvider === 'theoddsapi' ? theOddsApi : mockOdds;
export const oddsProviderName = config.oddsProvider === 'theoddsapi' ? 'theoddsapi' : 'mock';
