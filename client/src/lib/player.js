// Lightweight per-device identity. A friends game doesn't need passwords: each
// browser gets a stable random playerId in localStorage, plus a display name.
const ID_KEY = 'ff_player_id';
const NAME_KEY = 'ff_player_name';

export function getPlayerId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `p_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getPlayerName() {
  return localStorage.getItem(NAME_KEY) || '';
}

export function setPlayerName(name) {
  localStorage.setItem(NAME_KEY, name);
}
