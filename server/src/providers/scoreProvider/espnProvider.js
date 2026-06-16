// ESPN ScoreProvider — free, no-key live PGA leaderboard via ESPN's public
// golf JSON endpoint. Not an officially documented/licensed API (use at your
// own discretion), but stable JSON and it auto-returns the current PGA event,
// so there's no tournament-id to resolve. Enable with SCORE_PROVIDER=espn.
//
// Field paths are extracted defensively because ESPN's shape varies a little by
// event/state. If golfers show "No data", open the SCOREBOARD url in a browser
// and check the competitor object against parseCompetitor() below.
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
  const blob = [
    st?.position?.displayName,
    st?.position?.id,
    st?.type?.name,
    st?.type?.state,
    st?.displayValue,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  if (/\bCUT\b|\bMC\b/.test(blob)) return 'cut';
  if (/\bWD\b|WITHDRAW/.test(blob)) return 'wd';
  if (/\bDQ\b|\bDSQ\b|DISQUAL/.test(blob)) return 'dq';
  return 'active';
}

function parseCompetitor(c) {
  const name =
    c.athlete?.displayName || c.athlete?.fullName || c.athlete?.shortName || c.name || '';
  if (!name) return null;
  const st = c.status || {};

  // to-par: prefer the top-level score, fall back to a scoreToPar statistic.
  let toPar = parseToPar(c.score);
  if (toPar == null && Array.isArray(c.statistics)) {
    const stat = c.statistics.find((s) => /scoretopar|topar|^score$/i.test(s.name || ''));
    if (stat) toPar = parseToPar(stat.displayValue ?? stat.value);
  }

  let status = mapStatus(st);
  // No score yet and not flagged cut/wd/dq -> hasn't started.
  if (toPar == null && status === 'active') status = 'not_started';

  // thru: numeric holes if present, else the status display ("F", "Thru 12").
  let thru = null;
  if (typeof st.thru === 'number') thru = st.thru >= 18 ? 'F' : String(st.thru);
  else if (st.displayValue) thru = String(st.displayValue);
  if (status === 'cut') thru = 'CUT';

  const position = st.position?.displayName ? String(st.position.displayName) : null;

  return {
    golferId: slugify(name),
    name,
    toPar,
    status,
    thru,
    round: typeof st.period === 'number' ? st.period : null,
    position:
      status === 'cut' ? 'CUT' : status === 'wd' ? 'WD' : status === 'dq' ? 'DQ' : position,
  };
}

// Pick the event to score: a pinned ESPN_EVENT_ID, else the in-progress one,
// else the next upcoming, else the first listed.
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

// Debug helper: returns the selected event, a couple of raw competitor objects,
// and what parseCompetitor() makes of them — so you can confirm the field paths
// against live data without shipping a new build each time.
export async function espnDebug() {
  const res = await fetch(SCOREBOARD, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const data = await res.json();
  const events = data.events || [];
  const event = pickEvent(events, process.env.ESPN_EVENT_ID);
  const comp = event && ((event.competitions && event.competitions[0]) || event);
  const competitors = (comp && comp.competitors) || [];
  return {
    ok: res.ok,
    eventCount: events.length,
    event: event
      ? { id: event.id, name: event.name, state: event.status?.type?.state }
      : null,
    sampleRaw: competitors.slice(0, 2),
    parsed: competitors.slice(0, 8).map(parseCompetitor).filter(Boolean),
  };
}

export const espnScoreProvider = {
  name: 'espn',

  async getScores(_tournamentId) {
    const res = await fetch(SCOREBOARD, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!res.ok) throw new Error(`ESPN ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const event = pickEvent(data.events || [], process.env.ESPN_EVENT_ID);
    if (!event) {
      console.warn('[espn] no PGA event found in scoreboard');
      return [];
    }

    const comp = (event.competitions && event.competitions[0]) || event;
    const competitors = comp.competitors || [];
    const rows = competitors.map(parseCompetitor).filter(Boolean);

    console.log(
      `[espn] event="${event.name}" state=${event.status?.type?.state} golfers=${rows.length}`
    );
    return rows;
  },
};
