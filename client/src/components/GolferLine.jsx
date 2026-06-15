import { fmtToPar, parColor, statusLabel, statusBadgeClass } from '../lib/format.js';

// One golfer row inside a team's expanded roster. Non-counting golfers are
// dimmed so it's obvious which scores are being dropped.
export default function GolferLine({ golfer }) {
  const score = golfer.score;
  const counting = golfer.counting;
  return (
    <div
      className={`flex items-center gap-2 py-1.5 ${counting ? '' : 'opacity-45'}`}
      title={counting ? 'Counting toward team score' : 'Not counting'}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${counting ? 'bg-fairway' : 'bg-slate-300'}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{golfer.name}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClass(score)}`}>
        {statusLabel(score)}
      </span>
      <span className={`w-10 text-right font-mono text-sm font-bold ${parColor(score?.toPar)}`}>
        {fmtToPar(score?.toPar)}
      </span>
    </div>
  );
}
