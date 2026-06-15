// Thin fetch wrapper. All endpoints are same-origin under /api.
async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),

  health: () => request('GET', '/health'),
  tournaments: () => request('GET', '/tournaments'),
  createLeague: (b) => request('POST', '/leagues', b),
  resolveCode: (code) => request('GET', `/leagues/resolve/${encodeURIComponent(code)}`),
  league: (id) => request('GET', `/leagues/${id}`),
  join: (id, b) => request('POST', `/leagues/${id}/join`, b),
  setTournament: (id, b) => request('POST', `/leagues/${id}/tournament`, b),
  setSettings: (id, b) => request('PATCH', `/leagues/${id}/settings`, b),
  pool: (id) => request('GET', `/leagues/${id}/pool`),
  leaderboard: (id) => request('GET', `/leagues/${id}/leaderboard`),
  draft: (id) => request('GET', `/leagues/${id}/draft`),
  startDraft: (id, b) => request('POST', `/leagues/${id}/draft/start`, b),
  pick: (id, b) => request('POST', `/leagues/${id}/draft/pick`, b),
  setAutoPick: (id, b) => request('POST', `/leagues/${id}/draft/autopick`, b),
};
