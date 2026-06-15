import { useEffect, useRef, useState } from 'react';
import { Card, Pill, Spinner } from '../components/ui.jsx';
import GolferLine from '../components/GolferLine.jsx';
import { fmtToPar, parColor } from '../lib/format.js';

export default function Leaderboard({ lb, myTeam }) {
  const [expanded, setExpanded] = useState({});
  // Track previous ranks to show movement (▲/▼) and flash rows on change.
  const prevRanks = useRef({});
  const [moves, setMoves] = useState({});

  useEffect(() => {
    if (!lb) return;
    const next = {};
    const movement = {};
    for (const t of lb.teams) {
      const before = prevRanks.current[t.teamId];
      next[t.teamId] = t.rank;
      if (before != null && before !== t.rank) movement[t.teamId] = before - t.rank; // +up / -down
    }
    setMoves(movement);
    prevRanks.current = next;
    const clear = setTimeout(() => setMoves({}), 1700);
    return () => clearTimeout(clear);
  }, [lb]);

  if (!lb) return <Spinner />;

  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <div className="space-y-4">
      {/* Tournament header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">{lb.leagueName}</h1>
        {lb.tournament && (
          <p className="text-sm text-slate-500">
            {lb.tournament.name}
            {lb.tournament.course ? ` · ${lb.tournament.course}` : ''}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <Pill className="bg-green-100 text-fairway">{lb.rules.counts}</Pill>
          <span>data: {lb.rules.provider}</span>
          {lb.lastUpdated && <span>· updated {timeAgo(lb.lastUpdated)}</span>}
        </div>
      </div>

      {/* Teams */}
      <div className="space-y-2">
        {lb.teams.map((t) => {
          const open = expanded[t.teamId];
          const mv = moves[t.teamId];
          return (
            <Card
              key={t.teamId}
              className={`overflow-hidden ${mv > 0 ? 'flash-up' : mv < 0 ? 'flash-down' : ''} ${
                t.teamId === myTeam?.id ? 'ring-1 ring-fairway' : ''
              }`}
            >
              <button onClick={() => toggle(t.teamId)} className="flex w-full items-center gap-3 p-3 text-left">
                <div className="flex w-8 flex-col items-center">
                  <span className="text-lg font-bold tabular-nums">{t.rank}</span>
                  {mv ? (
                    <span className={`text-[10px] font-bold ${mv > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {mv > 0 ? `▲${mv}` : `▼${-mv}`}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{t.teamName}</span>
                    {t.teamId === myTeam?.id && <Pill className="bg-green-100 text-fairway">You</Pill>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t.counting.length}/{t.counting.length + t.dropped.length} counting
                    {t.flags.fewerThanCounted && (
                      <span className="ml-1 text-amber-600">· fewer than target valid scores</span>
                    )}
                  </div>
                </div>
                <div className={`font-mono text-2xl font-bold ${parColor(t.teamScore)}`}>
                  {fmtToPar(t.teamScore)}
                </div>
                <span className={`ml-1 text-slate-300 transition ${open ? 'rotate-90' : ''}`}>›</span>
              </button>

              {open && (
                <div className="border-t border-slate-100 px-4 pb-3 pt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Counting ({t.counting.length})
                  </div>
                  {t.counting.map((g) => (
                    <GolferLine key={g.golferId} golfer={g} />
                  ))}
                  {t.dropped.length > 0 && (
                    <>
                      <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Dropped
                      </div>
                      {t.dropped.map((g) => (
                        <GolferLine key={g.golferId} golfer={g} />
                      ))}
                    </>
                  )}
                  <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-400">
                    <span>All 6 total</span>
                    <span className={`font-mono font-bold ${parColor(t.totalAll)}`}>{fmtToPar(t.totalAll)}</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Scoring rules — stated so players understand the edge cases */}
      <Card className="p-4 text-xs text-slate-500 space-y-1">
        <div className="font-semibold text-slate-600">How scoring works</div>
        <div>{lb.rules.counts} golfers count; lowest combined score leads.</div>
        <div>{lb.rules.missedCut}</div>
        <div>{lb.rules.wdDq}</div>
        <div>{lb.rules.tieBreak}</div>
      </Card>
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}
