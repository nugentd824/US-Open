import { useEffect, useState } from 'react';
import { Button, Card, Label, ErrorBanner, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { getPlayerId } from '../lib/player.js';

export default function Lobby({ league, isCreator, myTeam, onChange, reload }) {
  const [tournaments, setTournaments] = useState([]);
  const [order, setOrder] = useState(league.teams.map((t) => t.id));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isCreator && !league.tournament) api.tournaments().then((r) => setTournaments(r.tournaments)).catch(() => {});
  }, [isCreator, league.tournament]);

  // Keep the order preview in sync as teams join.
  useEffect(() => {
    setOrder((prev) => {
      const ids = league.teams.map((t) => t.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [league.teams]);

  const shareUrl = `${location.origin}/join/${league.inviteCode}`;
  const teamById = Object.fromEntries(league.teams.map((t) => [t.id, t]));

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  }

  async function pickTournament(id) {
    setErr('');
    setBusy(true);
    try {
      const st = await api.setTournament(league.id, { playerId: getPlayerId(), tournamentId: id });
      onChange(st);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(patch) {
    setErr('');
    try {
      const st = await api.setSettings(league.id, { playerId: getPlayerId(), ...patch });
      onChange(st);
    } catch (e) {
      setErr(e.message);
    }
  }

  function shuffle() {
    const a = [...order];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    setOrder(a);
  }

  async function start() {
    setErr('');
    setBusy(true);
    try {
      await api.startDraft(league.id, { playerId: getPlayerId(), order });
      // LeaguePage's socket handler will switch to the Draft tab.
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const canStart =
    isCreator && league.tournament && league.teams.length >= 2 && league.fieldSize >= league.teams.length * league.rosterSize;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{league.name}</h1>
        <p className="text-sm text-slate-500">Lobby · waiting to draft</p>
      </div>

      {/* Invite */}
      <Card className="p-4">
        <Label>Invite friends</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
            <div className="font-mono text-lg font-bold tracking-[0.3em] text-slate-800">
              {league.inviteCode}
            </div>
          </div>
          <Button variant="secondary" onClick={copy}>
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
        </div>
        <p className="mt-2 break-all text-xs text-slate-400">{shareUrl}</p>
      </Card>

      {/* Members */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <Label>Teams ({league.teams.length})</Label>
          <span className="text-xs text-slate-400">2–12 players</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {league.teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span className="font-medium">{t.name}</span>
              <div className="flex gap-1.5">
                {t.playerId === league.creatorPlayerId && <Pill className="bg-amber-100 text-amber-700">Host</Pill>}
                {t.id === myTeam?.id && <Pill className="bg-green-100 text-fairway">You</Pill>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Tournament */}
      <Card className="p-4">
        <Label>Tournament</Label>
        {league.tournament ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="font-semibold">{league.tournament.name}</div>
            <div className="text-sm text-slate-500">
              {league.tournament.course}
              {league.tournament.location ? ` · ${league.tournament.location}` : ''}
            </div>
            {league.tournament.startDate && (
              <div className="text-sm text-slate-500">
                {league.tournament.startDate} – {league.tournament.endDate}
              </div>
            )}
            <div className="mt-1 text-xs text-slate-400">{league.fieldSize} golfers in the field</div>
          </div>
        ) : isCreator ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Pick the event your league will draft.</p>
            {tournaments.map((t) => (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => pickTournament(t.id)}
                className="block w-full rounded-xl border border-slate-200 p-3 text-left hover:border-fairway hover:bg-green-50/40"
              >
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-slate-500">
                  {t.course}
                  {t.startDate ? ` · ${t.startDate}` : ''}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Waiting for the host to choose a tournament…</p>
        )}
      </Card>

      {/* Settings */}
      {isCreator && (
        <Card className="p-4 space-y-3">
          <Label>Draft settings</Label>
          <SettingRow
            label="Golfers per team"
            value={league.rosterSize}
            options={[4, 5, 6, 7, 8]}
            onPick={(v) => saveSettings({ rosterSize: v })}
          />
          <SettingRow
            label="Scores that count"
            value={league.scoresCounted}
            options={Array.from({ length: league.rosterSize }, (_, i) => i + 1)}
            onPick={(v) => saveSettings({ scoresCounted: v })}
          />
          <SettingRow
            label="Pick timer"
            value={league.pickTimerSeconds ?? 0}
            options={[0, 60, 300, 900, 1800, 3600]}
            fmt={(v) => (v === 0 ? 'Off' : `${v / 60}m`)}
            onPick={(v) => saveSettings({ pickTimerSeconds: v === 0 ? null : v })}
          />
          <p className="text-xs text-slate-400">
            Best {league.scoresCounted} of {league.rosterSize} golfers count each update. When the
            pick timer runs out — or a player turns on auto-pick — the top available golfer is drafted
            automatically.
          </p>
        </Card>
      )}

      {/* Draft order + start */}
      {isCreator && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Draft order</Label>
            <Button variant="ghost" onClick={shuffle} className="text-xs px-2 py-1">
              🎲 Shuffle
            </Button>
          </div>
          <ol className="space-y-1">
            {order.map((tid, i) => (
              <li key={tid} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="w-5 text-sm font-bold text-slate-400">{i + 1}</span>
                <span className="text-sm font-medium">{teamById[tid]?.name}</span>
              </li>
            ))}
          </ol>
          <ErrorBanner>{err}</ErrorBanner>
          <Button className="w-full" disabled={!canStart || busy} onClick={start}>
            {busy ? 'Starting…' : 'Start snake draft'}
          </Button>
          {!canStart && (
            <p className="text-xs text-slate-400">
              {!league.tournament
                ? 'Select a tournament first.'
                : league.teams.length < 2
                ? 'Need at least 2 teams.'
                : `Field too small for ${league.teams.length} teams × ${league.rosterSize} picks.`}
            </p>
          )}
        </Card>
      )}

      {!isCreator && (
        <ErrorBanner>{err}</ErrorBanner>
      )}
      {!isCreator && (
        <p className="text-center text-sm text-slate-500">Waiting for the host to start the draft…</p>
      )}
    </div>
  );
}

function SettingRow({ label, value, options, onPick, fmt = (v) => v }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onPick(o)}
            className={`rounded-lg px-2.5 py-1 text-sm font-semibold ${
              value === o ? 'bg-fairway text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {fmt(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
