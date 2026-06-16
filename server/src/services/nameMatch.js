// Cross-provider name matching. Odds and score providers use different golfer
// ids and sometimes different name forms (accents, "Matt" vs "Matthew"), so we
// match in tiers: exact id, then normalized full name, then a loose
// last-name+first-initial key (only when it's unambiguous).
export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '') // drop suffixes
    .replace(/[^a-z]/g, ''); // keep letters only -> "rorymcilroy"
}

// Loose key: "<lastname><first initial>", accent/suffix-insensitive.
// "Matt Fitzpatrick" and "Matthew Fitzpatrick" both -> "fitzpatrickm";
// "Ludvig Åberg" and "Ludvig Aberg" both -> "abergl".
export function looseKey(name) {
  const parts = (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return '';
  return parts[parts.length - 1] + parts[0][0];
}

// Build lookups from a list of provider score rows.
export function indexScoresByName(scoreRows) {
  const byId = new Map();
  const byName = new Map();
  const byLoose = new Map(); // key -> array (so we can detect ambiguity)
  for (const row of scoreRows) {
    byId.set(row.golferId, row);
    byName.set(normalizeName(row.name), row);
    const lk = looseKey(row.name);
    if (lk) (byLoose.get(lk) || byLoose.set(lk, []).get(lk)).push(row);
  }
  return { byId, byName, byLoose };
}

// Resolve a pool golfer to its score row: exact id, then normalized name, then
// an unambiguous loose key.
export function matchScore(poolGolfer, index) {
  const id = poolGolfer.golfer_id || poolGolfer.golferId;
  if (id && index.byId.has(id)) return index.byId.get(id);

  const named = index.byName.get(normalizeName(poolGolfer.name));
  if (named) return named;

  const lk = looseKey(poolGolfer.name);
  const cands = lk ? index.byLoose.get(lk) : null;
  if (cands && cands.length === 1) return cands[0]; // only if unambiguous
  return null;
}
