// Golf score formatting + color helpers. Lower is better; under par shows red
// (PGA convention), over par dark, even par gray.

export function fmtToPar(n) {
  if (n == null) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

// Tailwind text color class for a to-par value.
export function parColor(n) {
  if (n == null) return 'text-slate-400';
  if (n < 0) return 'text-under';
  if (n > 0) return 'text-over';
  return 'text-slate-500';
}

// Short, human label for a golfer's live status.
export function statusLabel(score) {
  if (!score) return 'No data';
  switch (score.status) {
    case 'cut':
      return 'MC'; // missed cut — score frozen at the cut line
    case 'wd':
      return 'WD';
    case 'dq':
      return 'DQ';
    case 'not_started':
      // `thru` carries an ISO tee time for not-yet-started golfers (if known).
      return formatTeeTime(score.thru) || 'Pre';
    default:
      return score.thru ? (score.thru === 'F' ? 'F' : `thru ${score.thru}`) : 'Live';
  }
}

// Format an ISO timestamp to the viewer's local time, e.g. "12:19 PM". Returns
// null if the value isn't a parseable timestamp.
export function formatTeeTime(v) {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Badge styling per status.
export function statusBadgeClass(score) {
  if (!score) return 'bg-slate-100 text-slate-400';
  switch (score.status) {
    case 'cut':
    case 'wd':
    case 'dq':
      return 'bg-rose-100 text-rose-700';
    case 'not_started':
      return 'bg-slate-100 text-slate-500';
    default:
      return score.thru === 'F' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700';
  }
}

export function impliedPct(prob) {
  if (prob == null) return '';
  return `${(prob * 100).toFixed(1)}%`;
}

export function americanFromDecimal(dec) {
  if (!dec) return '';
  return dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : `${Math.round(-100 / (dec - 1))}`;
}
