import { useEffect, useRef, useState } from 'react';

// Subscribes to a league's websocket room and invokes `onMessage` for each
// pushed update ({ type: 'lobby'|'draft'|'leaderboard', payload }). Reconnects
// automatically. Returns the live connection status for a UI indicator.
export function useLeagueSocket(leagueId, onMessage) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!leagueId) return;
    let ws;
    let closed = false;
    let retry;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?leagueId=${leagueId}`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type && handlerRef.current) handlerRef.current(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws && ws.close();
    };
  }, [leagueId]);

  return connected;
}
