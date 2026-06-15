import { Card, Pill, Spinner } from '../components/ui.jsx';
import GolferLine from '../components/GolferLine.jsx';
import { fmtToPar, parColor } from '../lib/format.js';

export default function MyTeam({ lb, myTeam, league }) {
  if (!myTeam) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        You’re watching this league but don’t have a team in it.
      </Card>
    );
  }
  if (!lb) return <Spinner />;

  const me = lb.teams.find((t) => t.teamId === myTeam.id);
  if (!me) return <Spinner />;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Your team</div>
            <h1 className="text-2xl font-bold tracking-tight">{me.teamName}</h1>
          </div>
          <div className="text-right">
            <div className={`font-mono text-3xl font-bold ${parColor(me.teamScore)}`}>
              {fmtToPar(me.teamScore)}
            </div>
            <div className="text-xs text-slate-400">Rank #{me.rank}</div>
          </div>
        </div>
        {me.flags.fewerThanCounted && (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Fewer than {league.scoresCounted} golfers have valid scores — counting what’s available.
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fairway">
          Counting now ({me.counting.length})
        </div>
        {me.counting.map((g) => (
          <GolferLine key={g.golferId} golfer={g} />
        ))}

        {me.dropped.length > 0 && (
          <>
            <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Not counting ({me.dropped.length})
            </div>
            {me.dropped.map((g) => (
              <GolferLine key={g.golferId} golfer={g} />
            ))}
          </>
        )}

        <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
          <span className="text-slate-500">All {me.counting.length + me.dropped.length} golfers total</span>
          <span className={`font-mono font-bold ${parColor(me.totalAll)}`}>{fmtToPar(me.totalAll)}</span>
        </div>
      </Card>

      <Card className="p-4 text-xs text-slate-500 space-y-1">
        <div className="font-semibold text-slate-600">Scoring</div>
        <div>{lb.rules.counts} golfers count toward your team score.</div>
        <div>{lb.rules.missedCut}</div>
        <div>{lb.rules.wdDq}</div>
      </Card>
    </div>
  );
}
