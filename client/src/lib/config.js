// Where the client finds the backend.
//
// Local dev / single-server prod: leave these unset and the client talks to the
// same origin (/api and /ws), proxied by Vite in dev.
//
// Split deploy (static client on Vercel, Node backend on Render/Fly): set
// VITE_API_BASE to the backend URL at build time, e.g.
//   VITE_API_BASE=https://fairway-fantasy.onrender.com
// The WebSocket base is derived from it (http->ws) unless VITE_WS_BASE is set.
export const API_BASE = import.meta.env.VITE_API_BASE || '';

export const WS_BASE =
  import.meta.env.VITE_WS_BASE ||
  (API_BASE
    ? API_BASE.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
