import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';
import { Button, Card, Input, Label, ErrorBanner, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { getPlayerId, getPlayerName, setPlayerName } from '../lib/player.js';

export default function JoinPage() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [leagueId, setLeagueId] = useState(params.get('to') || null);
  const [league, setLeague] = useState(null);
  const [name, setName] = useState(getPlayerName());
  const [teamName, setTeamName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let id = leagueId;
        if (!id) {
          const r = await api.resolveCode(code);
          id = r.leagueId;
          setLeagueId(id);
        }
        const lg = await api.league(id);
        setLeague(lg);
        // Already a member on this device? Go straight in.
        if (lg.teams.some((t) => t.playerId === getPlayerId())) nav(`/league/${id}`);
      } catch (e) {
        setErr(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    setErr('');
    setBusy(true);
    try {
      setPlayerName(name);
      await api.join(leagueId, { playerId: getPlayerId(), teamName });
      nav(`/league/${leagueId}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {!league && !err && <Spinner />}
        {err && (
          <Card className="p-5 space-y-3">
            <ErrorBanner>{err}</ErrorBanner>
            <Button variant="secondary" onClick={() => nav('/')}>
              Back home
            </Button>
          </Card>
        )}
        {league && (
          <Card className="p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Joining</p>
              <h1 className="text-xl font-bold">{league.name}</h1>
              {league.tournament && (
                <p className="text-sm text-slate-500">{league.tournament.name}</p>
              )}
              <p className="mt-1 text-sm text-slate-500">
                {league.teams.length} team{league.teams.length === 1 ? '' : 's'} so far
              </p>
            </div>
            {league.status !== 'lobby' ? (
              <ErrorBanner>This league has already started its draft — you can’t join now.</ErrorBanner>
            ) : (
              <>
                <div>
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
                </div>
                <div>
                  <Label>Your team name</Label>
                  <Input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Birdie Bandits"
                  />
                </div>
                <ErrorBanner>{err}</ErrorBanner>
                <Button className="w-full" disabled={busy || !name.trim() || !teamName.trim()} onClick={join}>
                  {busy ? 'Joining…' : 'Join league'}
                </Button>
              </>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
