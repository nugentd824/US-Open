// ESPN ScoreProvider — free, no-key live PGA leaderboard via ESPN's public
// golf JSON endpoint. Not an officially documented/licensed API (use at your
// own discretion), but stable JSON and it auto-returns the current PGA event,
// so there's no tournament-id to resolve. Enable with SCORE_PROVIDER=espn.
//
// ESPN's competitor shape varies: live events tend to include a per-player
// `status` (position/thru/period); completed events omit it and the data is in
// `linescores`. parseCompetitor handles both, and positions are computed from
// to-par when ESPN doesn't supply them.
import { slugify } from '../../fixtures/golfers.js';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// Parse a to-par string ("-5", "E", "+3", "-", "") to an integer or null.
function parseToPar(v) {
  if (v == null) return null;
  if (typeof v === 'object') v = v.displayValue ?? v.value;
  const s = String(v).trim().toUpperCase();
  if (s === '' || s === '-' || s === '--') return null;
  if (s === 'E') return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function mapStatus(st) {
  const blob = [st?.position?.displayName, st?.position?.id, st?.type?.name, st?.type?.state, st?.displayValue]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  if (/\bCUT\b|\bMC\b/.test(blob)) return 'cut';
  if (/\bWD\b|WITHDRAW/.test(blob)) return 'wd';
  if (/\bDQ\b|\bDSQ\b|DISQUAL/.test(blob)) return 'dq';
  return 'active';
}

function parseCompetitor(c, eventState) {
  const name = c.athlete?.displayName || c.athlete?.fullName || c.athlete?.shortName || c.name || '';
  if (!name) return null;
  const st = c.status || {};

  // to-par: prefer top-level score, fall back to a scoreToPar statistic.
  let toPar = parseToPar(c.score);
  if (toPar == null && Array.isArray(c.statistics)) {
    const stat = c.statistics.find((s) => /scoretopar|topar|^score$/i.test(s.name || ''));
    if (stat) toPar = parseToPar(stat.displayValue ?? stat.value);
  }

  // Holes played: on a LIVE event ESPN puts per-hole detail in `linescores` (an
  // array of rounds whose nested `linescores` are the holes played). The current
  // round is the last one with detail; no detail anywhere = hasn't teed off.
  const rounds = Array.isArray(c.linescores) ? c.linescores : [];
  let current = null;
  for (const r of rounds) {
    if (Array.isArray(r.linescores) && r.linescores.length > 0) current = r;
  }
  const started = !!current;

  let status = mapStatus(st);
  // No holes played and not cut/wd/dq -> not yet teed off.
  if (status === 'active' && !started && typeof st.thru !== 'number') status = 'not_started';
  // Pre/just-started golfers are even par (so they show E and count as 0).
  if (toPar == null && (status === 'active' || status === 'not_started')) toPar = 0;

  // round
  let round = typeof st.period === 'number' ? st.period : null;
  if (round == null) round = current?.period ?? rounds[0]?.period ?? null;

  // thru: tee time (tournament-local label) for not-started; holes for active;
  // status display when present; "F" for a finished round.
  let thru = null;
  if (status === 'not_started') {
    thru = teeTimeLabel(rounds);
  } else if (typeof st.thru === 'number') {
    thru = st.thru >= 18 ? 'F' : String(st.thru);
  } else if (st.displayValue) {
    thru = String(st.displayValue);
  } else if (started) {
    thru = current.linescores.length >= 18 ? 'F' : String(current.linescores.length);
  } else if (eventState === 'post' && status === 'active') {
    thru = 'F';
  }
  if (status === 'cut') thru = 'CUT';

  const position = st.position?.displayName ? String(st.position.displayName) : null;

  return { golferId: slugify(name), name, toPar, status, thru, round, position };
}

// Pull a tee time out of a golfer's round statistics, e.g.
// "Thu Jun 18 09:19:00 PDT 2026" -> "9:19 AM". ESPN's timezone tag is unreliable
// (it labels event-local times as PDT), so we take the wall-clock numbers as-is
// — that's the official tee-sheet time and is correct for every viewer.
function teeTimeLabel(rounds) {
  for (const r of rounds) {
    const stats = r?.statistics?.categories?.[0]?.stats;
    if (!Array.isArray(stats)) continue;
    for (const s of stats) {
      const dv = s?.displayValue;
      if (typeof dv === 'string' && /\b20\d{2}\b/.test(dv)) {
        const m = dv.match(/\b(\d{1,2}):(\d{2})/);
        if (m) {
          const h = parseInt(m[1], 10);
          const ampm = h < 12 ? 'AM' : 'PM';
          const h12 = h % 12 === 0 ? 12 : h % 12;
          return `${h12}:${m[2]} ${ampm}`;
        }
      }
    }
  }
  return null;
}


// When ESPN doesn't provide positions, compute them from to-par with ties ("T4").
function assignPositions(rows) {
  if (rows.some((r) => r.position)) return rows; // ESPN already supplied them
  const ranked = rows
    .filter((r) => (r.status === 'active' || r.status === 'not_started') && typeof r.toPar === 'number')
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

function pickEvent(events, pinnedId) {
  if (pinnedId) {
    const e = events.find((ev) => String(ev.id) === String(pinnedId));
    if (e) return e;
  }
  return (
    events.find((ev) => ev.status?.type?.state === 'in') ||
    events.find((ev) => ev.status?.type?.state === 'pre') ||
    events[0] ||
    null
  );
}

async function fetchScoreboard() {
  const res = await fetch(SCOREBOARD, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${await res.text()}`);
  return res.json();
}

function scoresFrom(data) {
  const events = data.events || [];
  const event = pickEvent(events, process.env.ESPN_EVENT_ID);
  if (!event) return { event: null, rows: [] };
  const state = event.status?.type?.state;
  const comp = (event.competitions && event.competitions[0]) || event;
  const competitors = comp.competitors || [];
  const rows = assignPositions(competitors.map((c) => parseCompetitor(c, state)).filter(Boolean));
  return { event, rows };
}

// Debug helper: selected event + raw and parsed competitor samples.
export async function espnDebug() {
  const data = await fetchScoreboard();
  const { event, rows } = scoresFrom(data);
  const comp = event && ((event.competitions && event.competitions[0]) || event);
  const competitors = (comp && comp.competitors) || [];
  return {
    ok: true,
    eventCount: (data.events || []).length,
    event: event ? { id: event.id, name: event.name, state: event.status?.type?.state } : null,
    sampleRaw: competitors.slice(0, 2),
    parsed: rows.slice(0, 8),
  };
}

export const espnScoreProvider = {
  name: 'espn',

  async getScores(_tournamentId) {
    const { event, rows } = scoresFrom(await fetchScoreboard());
    if (!event) {
      console.warn('[espn] no PGA event found in scoreboard');
      return [];
    }
    console.log(`[espn] event="${event.name}" state=${event.status?.type?.state} golfers=${rows.length}`);
    return rows;
  },
};
