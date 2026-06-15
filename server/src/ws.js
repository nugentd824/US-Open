// WebSocket hub: pushes draft and leaderboard updates to clients so screens
// update without manual refresh. Clients join a per-league "room" by connecting
// to /ws?leagueId=<id> (and may re-subscribe via a {type:'subscribe'} message).
import { WebSocketServer } from 'ws';

let wss = null;
// leagueId -> Set<WebSocket>
const rooms = new Map();

function join(ws, leagueId) {
  if (!leagueId) return;
  ws._leagues ||= new Set();
  ws._leagues.add(leagueId);
  if (!rooms.has(leagueId)) rooms.set(leagueId, new Set());
  rooms.get(leagueId).add(ws);
}

function leaveAll(ws) {
  for (const leagueId of ws._leagues || []) {
    rooms.get(leagueId)?.delete(ws);
    if (rooms.get(leagueId)?.size === 0) rooms.delete(leagueId);
  }
}

export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    try {
      const url = new URL(req.url, 'http://localhost');
      join(ws, url.searchParams.get('leagueId'));
    } catch {
      /* ignore malformed url */
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe') join(ws, msg.leagueId);
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => leaveAll(ws));
    ws.send(JSON.stringify({ type: 'connected' }));
  });

  // Keepalive: drop dead connections every 30s.
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  wss.on('close', () => clearInterval(interval));

  return wss;
}

// Broadcast a message to everyone watching a league.
export function broadcast(leagueId, type, payload) {
  const room = rooms.get(leagueId);
  if (!room) return;
  const data = JSON.stringify({ type, payload });
  for (const ws of room) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
