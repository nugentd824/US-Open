import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppHeader, { LiveDot } from '../components/AppHeader.jsx';
import { Spinner, ErrorBanner } from '../components/ui.jsx';
import { useLeagueSocket } from '../hooks/useLeagueSocket.js';
import { api } from '../lib/api.js';
import { getPlayerId } from '../lib/player.js';
import Lobby from './Lobby.jsx';
import DraftRoom from './DraftRoom.jsx';
import Leaderboard from './Leaderboard.jsx';
import MyTeam from './MyTeam.jsx';

export default function LeaguePage() {
  const { id } = useParams();
  const playerId = getPlayerId();
  const [lg, setLg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [lb, setLb] = useState(null);
  const [tab, setTab] = useState(null);
  const [err, setErr] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const league = await api.league(id);
      setLg(league);
      if (league.status === 'drafting' || league.status === 'active') {
        api.draft(id).then(setDraft).catch(() => {});
      }
      if (league.status === 'active') {
        api.leaderboard(id).then(setLb).catch(() => {});
      }
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Default tab follows the league phase. Also auto-leaves the Lobby tab once
  // the draft starts, so every member moves into the draft room together.
  useEffect(() => {
    if (!lg) return;
    if (!tab) {
      setTab(lg.status === 'active' ? 'leaderboard' : lg.status === 'drafting' ? 'draft' : 'lobby');
    } else if (tab === 'lobby' && lg.status !== 'lobby') {
      setTab(lg.status === 'active' ? 'leaderboard' : 'draft');
    }
  }, [lg, tab]);

  // Live push updates.
  const connected = useLeagueSocket(id, (msg) => {
    if (msg.type === 'lobby') {
      setLg((prev) => {
        const next = msg.payload;
        // Phase transition -> pull the data the new phase needs.
        if (prev && prev.status !== next.status) {
          if (next.status === 'drafting') api.draft(id).then(setDraft).catch(() => {});
          if (next.status === 'active') {
            api.draft(id).then(setDraft).catch(() => {});
            api.leaderboard(id).then(setLb).catch(() => {});
            setTab('leaderboard');
          }
        }
        return next;
      });
    } else if (msg.type === 'draft') {
      setDraft(msg.payload);
      setLg((prev) => (prev && prev.status !== msg.payload.status ? { ...prev, status: msg.payload.status } : prev));
      if (msg.payload.complete) setTab((t) => (t === 'draft' ? 'leaderboard' : t || 'leaderboard'));
    } else if (msg.type === 'leaderboard') {
      setLb(msg.payload);
    }
  });

  const myTeam = useMemo(
    () => lg?.teams.find((t) => t.playerId === playerId) || null,
    [lg, playerId]
  );
  const isCreator = lg?.creatorPlayerId === playerId;

  if (err) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <ErrorBanner>{err}</ErrorBanner>
        </main>
      </div>
    );
  }
  if (!lg || !tab) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <Spinner />
      </div>
    );
  }

  const tabs =
    lg.status === 'active'
      ? [
          ['leaderboard', 'Leaderboard', '🏆'],
          ['myteam', 'My Team', '⛳'],
          ['draft', 'Draft', '📋'],
        ]
      : [];

  return (
    <div className="min-h-screen pb-24">
      <AppHeader right={<LiveDot connected={connected} />} />
      <main className="mx-auto max-w-2xl px-4 py-5">
        {tab === 'lobby' && (
          <Lobby league={lg} isCreator={isCreator} myTeam={myTeam} onChange={setLg} reload={loadAll} />
        )}
        {tab === 'draft' && (
          <DraftRoom
            leagueId={id}
            league={lg}
            draft={draft}
            myTeam={myTeam}
            isCreator={isCreator}
            playerId={playerId}
          />
        )}
        {tab === 'leaderboard' && <Leaderboard lb={lb} myTeam={myTeam} />}
        {tab === 'myteam' && <MyTeam lb={lb} myTeam={myTeam} league={lg} />}
      </main>

      {tabs.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white safe-bottom">
          <div className="mx-auto flex max-w-2xl">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  tab === key ? 'text-fairway' : 'text-slate-400'
                }`}
              >
                <span className="text-lg">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
