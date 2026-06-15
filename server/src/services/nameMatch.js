// Cross-provider name matching. Odds and score providers use different golfer
// ids, so we match by normalized name when ids don't line up.
export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '') // drop suffixes
    .replace(/[^a-z]/g, ''); // keep letters only -> "rorymcilroy"
}

// Build a lookup from a list of provider score rows: normalizedName -> row.
export function indexScoresByName(scoreRows) {
  const byId = new Map();
  const byName = new Map();
  for (const row of scoreRows) {
    byId.set(row.golferId, row);
    byName.set(normalizeName(row.name), row);
  }
  return { byId, byName };
}

// Resolve a pool golfer to its score row: exact id first, then normalized name.
export function matchScore(poolGolfer, index) {
  return (
    index.byId.get(poolGolfer.golfer_id || poolGolfer.golferId) ||
    index.byName.get(normalizeName(poolGolfer.name)) ||
    null
  );
}
