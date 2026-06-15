import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Pill, Spinner, ErrorBanner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { impliedPct, americanFromDecimal } from '../lib/format.js';

export default function DraftRoom({ leagueId, league, draft, myTeam, playerId }) {
  const [pool, setPool] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('odds'); // odds | name
  const [hideDrafted, setHideDrafted] = useState(true);
  const [err, setErr] = useState('');
  const [picking, setPicking] = useState(null);
  const [savingAuto, setSavingAuto] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Refresh the pool whenever a pick is made (availability changes).
  const pickCount = draft?.picks?.length ?? 0;
  useEffect(() => {
    api.pool(leagueId).then((r) => setPool(r.pool)).catch((e) => setErr(e.message));
  }, [leagueId, pickCount]);

  // 1s tick for the pick timer.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const teamById = useMemo(
    () => Object.fromEntries((draft?.teams || []).map((t) => [t.id, t])),
    [draft]
  );

  const filtered = useMemo(() => {
    if (!pool) return [];
    let list = pool;
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(s));
    }
    if (hideDrafted) list = list.filter((g) => !g.drafted);
    list = [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : (a.oddsRank ?? 1e9) - (b.oddsRank ?? 1e9)
    );
    return list;
  }, [pool, q, sort, hideDrafted]);

  if (!draft) return <Spinner />;

  const onClockTeam = draft.onClockTeamId ? teamById[draft.onClockTeamId] : null;
  const myTurn = !draft.complete && draft.onClockTeamId === myTeam?.id;
  const myTeamView = myTeam ? teamById[myTeam.id] : null;
  const myAuto = !!myTeamView?.autoPick;
  const remaining =
    draft.pickDeadline && !draft.complete ? Math.max(0, Math.round((draft.pickDeadline - now) / 1000)) : null;

  async function pick(golferId) {
    setErr('');
    setPicking(golferId);
    try {
      await api.pick(leagueId, { playerId, golferId });
    } catch (e) {
      setErr(e.message);
    } finally {
      setPicking(null);
    }
  }

  async function toggleAuto() {
    setErr('');
    setSavingAuto(true);
    try {
      await api.setAutoPick(leagueId, { playerId, enabled: !myAuto });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingAuto(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* On the clock banner */}
      {!draft.complete ? (
        <Card className={`p-4 ${myTurn ? 'ring-2 ring-fairway' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Round {draft.round} · Pick {draft.currentPick} of {draft.totalPicks}
              </div>
              <div className="text-lg font-bold">
                {myTurn ? "You're on the clock!" : `${onClockTeam?.name || '—'} is picking`}
              </div>
            </div>
            {remaining != null && (
              <div className={`text-right ${remaining <= 10 ? 'text-rose-600' : 'text-slate-700'}`}>
                <div className="font-mono text-2xl font-bold tabular-nums">
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">on the clock</div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="text-lg font-bold">Draft complete ✓</div>
          <div className="text-sm text-slate-500">Rosters are locked. Head to the leaderboard.</div>
        </Card>
      )}

      <ErrorBanner>{err}</ErrorBanner>

      {/* Auto-pick toggle (your team) */}
      {myTeam && !draft.complete && (
        <Card className={`flex items-center justify-between p-3 ${myAuto ? 'ring-1 ring-amber-300' : ''}`}>
          <div className="min-w-0 pr-3">
            <div className="text-sm font-semibold">Auto-pick</div>
            <div className="text-xs text-slate-400">
              {myAuto
                ? "On — we'll draft the top available golfer for you on every turn."
                : 'Off — you make your own picks. Turn on if you need to step away.'}
            </div>
          </div>
          <Switch on={myAuto} disabled={savingAuto} onClick={toggleAuto} />
        </Card>
      )}

      {/* Draft board */}
      <Card className="p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Draft board</div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {draft.teams
            .slice()
            .sort((a, b) => (a.draftPosition ?? 0) - (b.draftPosition ?? 0))
            .map((t) => (
              <div
                key={t.id}
                className={`min-w-[140px] flex-shrink-0 rounded-xl border p-2.5 ${
                  draft.onClockTeamId === t.id ? 'border-fairway bg-green-50/50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-semibold">{t.name}</span>
                  <div className="flex flex-shrink-0 gap-1">
                    {t.autoPick && <Pill className="bg-amber-100 text-amber-700">AUTO</Pill>}
                    {t.id === myTeam?.id && <Pill className="bg-green-100 text-fairway">You</Pill>}
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {Array.from({ length: league.rosterSize }).map((_, i) => {
                    const p = t.picks[i];
                    return (
                      <div key={i} className="truncate text-xs text-slate-600">
                        <span className="text-slate-300">{i + 1}.</span>{' '}
                        {p ? (
                          <>
                            {p.name}
                            {p.auto && <span className="ml-1 text-[9px] text-amber-500">auto</span>}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* Golfer pool */}
      {!draft.complete && (
        <Card className="p-4">
          <div className="mb-3 space-y-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search golfers…" />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Sort</span>
              <SortBtn active={sort === 'odds'} onClick={() => setSort('odds')}>
                Odds
              </SortBtn>
              <SortBtn active={sort === 'name'} onClick={() => setSort('name')}>
                Name
              </SortBtn>
              <label className="ml-auto flex items-center gap-1.5 text-slate-500">
                <input type="checkbox" checked={hideDrafted} onChange={(e) => setHideDrafted(e.target.checked)} />
                Hide drafted
              </label>
            </div>
          </div>

          {!pool ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((g) => (
                <li key={g.golferId} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-center text-xs font-bold text-slate-300">{g.oddsRank}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-medium ${g.drafted ? 'text-slate-400 line-through' : ''}`}>
                      {g.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {americanFromDecimal(g.oddsDecimal)} · {impliedPct(g.impliedProb)} to win
                      {g.drafted && g.draftedByTeamName ? ` · ${g.draftedByTeamName}` : ''}
                    </div>
                  </div>
                  {g.drafted ? (
                    <Pill className="bg-slate-100 text-slate-400">Taken</Pill>
                  ) : myTurn ? (
                    <Button
                      className="px-3 py-1.5 text-xs"
                      disabled={picking === g.golferId}
                      onClick={() => pick(g.golferId)}
                    >
                      {picking === g.golferId ? '…' : 'Draft'}
                    </Button>
                  ) : (
                    <span className="w-12" />
                  )}
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-6 text-center text-sm text-slate-400">No golfers match.</li>
              )}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function Switch({ on, disabled, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${
        on ? 'bg-fairway' : 'bg-slate-300'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function SortBtn({ active, children, ...props }) {
  return (
    <button
      className={`rounded-lg px-2 py-1 font-semibold ${active ? 'bg-fairway text-white' : 'bg-slate-100 text-slate-600'}`}
      {...props}
    >
      {children}
    </button>
  );
}
