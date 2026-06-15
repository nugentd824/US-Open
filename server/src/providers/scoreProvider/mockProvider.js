// Mock ScoreProvider — simulates a live PGA tournament so you can build and
// demo without a real event running. It is deterministic (seeded) yet evolves
// with real time, so every connected client sees the same leaderboard and it
// moves on its own. It exercises every scoring edge case: in-progress "thru X",
// a mid-event cut, a withdrawal (WD) and a disqualification (DQ).
//
// Field source: for the built-in demo tournaments the field comes from the
// fixtures; for ANY other tournament (e.g. a real event pulled from the odds
// provider) it reads the drafted field from the database, so a "real odds +
// mock scores" hybrid still produces a moving leaderboard for your real golfers.
import { config } from '../../config.js';
import { getMockTournament } from '../../fixtures/golfers.js';
import { db } from '../../db.js';

// Anchor the simulation to server start. The "tournament" begins now and plays
// out over 4 rounds at MOCK_ROUND_SECONDS each.
const T0 = Date.now();
const HOLES_PER_ROUND = 18;
const TOTAL_HOLES = HOLES_PER_ROUND * 4;

// Golfers (by odds rank) that don't finish, to demo WD/DQ handling.
const WD_RANK = 9; // withdraws partway through round 2
const WD_HOLE = 23;
const DQ_RANK = 18; // disqualified during round 3
const DQ_HOLE = 41;
const CUT_HOLE = HOLES_PER_ROUND * 2; // cut applied after 36 holes

// Field for any tournament not in the fixtures: the union of every league's
// drafted pool for that tournament (real odds-provider fields land here).
const qFieldForTournament = db.prepare(`
  SELECT gp.golfer_id AS golferId, gp.name AS name, MIN(gp.odds_rank) AS oddsRank
  FROM golfer_pool gp
  JOIN leagues l ON l.id = gp.league_id
  WHERE l.tournament_id = ?
  GROUP BY gp.golfer_id, gp.name
  ORDER BY oddsRank ASC
`);

// --- tiny deterministic RNG (mulberry32) -----------------------------------
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand01(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Per-hole score relative to par, biased by talent (favorites score better).
function holeDelta(golferSeed, hole, talent) {
  const u = rand01(golferSeed + hole * 0x9e3779b1);
  const pBirdie = Math.min(0.4, Math.max(0.05, 0.16 - talent * 0.6));
  const pBogey = Math.min(0.4, Math.max(0.05, 0.16 + talent * 0.6));
  const pEagle = 0.015;
  const pDouble = 0.02;
  // cumulative: eagle(-2), birdie(-1), par(0), bogey(+1), double(+2)
  if (u < pEagle) return -2;
  if (u < pEagle + pBirdie) return -1;
  if (u < pEagle + pBirdie + (1 - pEagle - pBirdie - pBogey - pDouble)) return 0;
  if (u < 1 - pDouble) return 1;
  return 2;
}

// Accumulated to-par after `holes` holes for a golfer.
function toParAtHole(golferId, talent, holes) {
  const seed = hashString(golferId);
  let total = 0;
  for (let h = 1; h <= holes; h++) total += holeDelta(seed, h, talent);
  return total;
}

// Map odds rank -> talent in roughly [-0.18 (best) .. +0.10 (worst)].
function talentForRank(rank, fieldSize) {
  if (fieldSize <= 1) return 0;
  return -0.18 + ((rank - 1) / (fieldSize - 1)) * 0.28;
}

function simClock() {
  const secondsPerHole = config.mockRoundSeconds / HOLES_PER_ROUND;
  const elapsed = Math.max(0, (Date.now() - T0) / 1000);
  const totalHoles = Math.min(TOTAL_HOLES, Math.floor(elapsed / secondsPerHole));
  const round = Math.min(4, Math.floor(totalHoles / HOLES_PER_ROUND) + 1);
  return { totalHoles, round };
}

// Simulate live scores for an arbitrary field: [{ golferId, name, oddsRank }].
function simulateField(field) {
  const fieldSize = field.length;
  const { totalHoles } = simClock();

  const rows = field.map((g, i) => {
    // Real fields may not carry odds_rank; fall back to list order.
    const rank = g.oddsRank || i + 1;
    const talent = talentForRank(rank, fieldSize);
    const jitter = hashString(g.golferId) % 3; // per-golfer tee-time jitter for "thru" variety
    let holes = Math.max(0, Math.min(TOTAL_HOLES, totalHoles - jitter));
    let status = 'active';

    // --- Withdrawal / Disqualification (freeze at the hole they stopped) ---
    if (rank === WD_RANK && holes >= WD_HOLE) {
      holes = WD_HOLE;
      status = 'wd';
    } else if (rank === DQ_RANK && holes >= DQ_HOLE) {
      holes = DQ_HOLE;
      status = 'dq';
    }

    if (holes === 0) return mkRow(g, 0, 'not_started', 1, null);

    const round = Math.min(4, Math.floor((holes - 1) / HOLES_PER_ROUND) + 1);
    const holesThisRound = ((holes - 1) % HOLES_PER_ROUND) + 1;
    const thru = holesThisRound === 18 ? 'F' : String(holesThisRound);

    if (status === 'wd') return mkRow(g, toParAtHole(g.golferId, talent, holes), 'wd', round, null);
    if (status === 'dq') return mkRow(g, toParAtHole(g.golferId, talent, holes), 'dq', round, null);
    return mkRow(g, toParAtHole(g.golferId, talent, holes), 'active', round, thru);
  });

  // --- Cut: after 36 holes, bottom ~half (by 36-hole score) miss the cut. --
  // Per the league rule, a missed cut FREEZES the golfer's score at the cut
  // line (their 36-hole to-par); they simply stop accumulating.
  if (totalHoles >= CUT_HOLE) {
    const cutEligible = rows.filter((r) => r.status === 'active');
    const scoredAt36 = cutEligible.map((r) => {
      const idx = field.findIndex((f) => f.golferId === r.golferId);
      const rank = field[idx].oddsRank || idx + 1;
      const talent = talentForRank(rank, fieldSize);
      return { id: r.golferId, par36: toParAtHole(r.golferId, talent, CUT_HOLE) };
    });
    scoredAt36.sort((a, b) => a.par36 - b.par36);
    const keep = Math.ceil(scoredAt36.length / 2); // top half + ties survive
    const cutValue = scoredAt36[keep - 1]?.par36 ?? 0;
    const survivors = new Set(scoredAt36.filter((s) => s.par36 <= cutValue).map((s) => s.id));

    for (const r of rows) {
      if (r.status !== 'active') continue;
      if (!survivors.has(r.golferId)) {
        const s36 = scoredAt36.find((s) => s.id === r.golferId);
        r.toPar = s36.par36; // freeze at the cut line
        r.status = 'cut';
        r.thru = 'CUT';
        r.round = 2;
      }
    }
  }

  return assignPositions(rows);
}

export const mockScoreProvider = {
  name: 'mock',

  async getScores(tournamentId) {
    // Built-in demo tournament -> fixtures field; otherwise the drafted field
    // for this tournament from the DB (so real odds-provider fields work too).
    const t = getMockTournament(tournamentId);
    const field = t ? t.field : qFieldForTournament.all(tournamentId);
    if (!field || !field.length) return [];
    return simulateField(field);
  },
};

function mkRow(g, toPar, status, round, thru) {
  return { golferId: g.golferId, name: g.name, toPar, status, thru, round, position: null };
}

// Leaderboard position labels with ties ("T4"). WD/DQ/CUT get a status label.
function assignPositions(rows) {
  const ranked = rows
    .filter((r) => r.status === 'active' || r.status === 'not_started')
    .sort((a, b) => a.toPar - b.toPar);
  let lastScore = null;
  let lastPos = 0;
  ranked.forEach((r, i) => {
    if (r.toPar !== lastScore) {
      lastPos = i + 1;
      lastScore = r.toPar;
    }
    const tie = ranked.filter((x) => x.toPar === r.toPar).length > 1;
    r.position = `${tie ? 'T' : ''}${lastPos}`;
  });
  for (const r of rows) {
    if (r.status === 'cut') r.position = 'CUT';
    else if (r.status === 'wd') r.position = 'WD';
    else if (r.status === 'dq') r.position = 'DQ';
  }
  return rows;
}
