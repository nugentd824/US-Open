import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';
import { Button, Card, Input, Label, ErrorBanner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { getPlayerId, getPlayerName, setPlayerName } from '../lib/player.js';

export default function Home() {
  const nav = useNavigate();
  const [mode, setMode] = useState('create'); // create | join
  const [name, setName] = useState(getPlayerName());
  const [leagueName, setLeagueName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function createLeague() {
    setErr('');
    setBusy(true);
    try {
      setPlayerName(name);
      const { league } = await api.createLeague({
        name: leagueName,
        teamName,
        playerId: getPlayerId(),
      });
      nav(`/league/${league.id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinLeague() {
    setErr('');
    setBusy(true);
    try {
      const { leagueId } = await api.resolveCode(code.trim().toUpperCase());
      nav(`/join/${code.trim().toUpperCase()}?to=${leagueId}`);
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
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Draft. Watch. Win.</h1>
          <p className="mt-1 text-sm text-slate-500">
            Snake-draft real PGA golfers, then ride your best 3 of 6 up the live leaderboard.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button variant={mode === 'create' ? 'primary' : 'secondary'} onClick={() => setMode('create')}>
            Create a league
          </Button>
          <Button variant={mode === 'join' ? 'primary' : 'secondary'} onClick={() => setMode('join')}>
            Join with a code
          </Button>
        </div>

        <Card className="p-5 space-y-4">
          <div>
            <Label>Your name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dana" />
          </div>

          {mode === 'create' ? (
            <>
              <div>
                <Label>League name</Label>
                <Input
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="Friday Foursome"
                />
              </div>
              <div>
                <Label>Your team name</Label>
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Eagle Eyes"
                />
              </div>
              <ErrorBanner>{err}</ErrorBanner>
              <Button
                className="w-full"
                disabled={busy || !name.trim() || !leagueName.trim() || !teamName.trim()}
                onClick={createLeague}
              >
                {busy ? 'Creating…' : 'Create league'}
              </Button>
            </>
          ) : (
            <>
              <div>
                <Label>Invite code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="font-mono tracking-widest uppercase"
                  maxLength={6}
                />
              </div>
              <ErrorBanner>{err}</ErrorBanner>
              <Button className="w-full" disabled={busy || code.trim().length < 4} onClick={joinLeague}>
                {busy ? 'Finding…' : 'Find league'}
              </Button>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          No account needed — your team is remembered on this device.
        </p>
      </main>
    </div>
  );
}
