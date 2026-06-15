// ===========================================================================
// SCORING ENGINE — "best N of M" (default best 3 of 6)
// ===========================================================================
// This is the heart of the game. Tweak the rules here.
//
// Golf is scored relative to par, so LOWER IS BETTER (-8 beats -3 beats +2).
// All scores are integers relative to par.
//
// For each team we:
//   1. Take its M drafted golfers and their current scores.
//   2. Keep only golfers with a valid numeric score (eligible).
//   3. Sort eligible golfers ascending (best first).
//   4. The best `scoresCounted` (default 3) COUNT; the rest are dropped.
//   5. Team score = sum of the counting golfers' to-par values.
//
// The specific golfers that count are recomputed on EVERY update, so they can
// change round to round (that's intended).
//
// Edge cases (see league rules in the README/UI):
//   • Missed cut (MC): the golfer's score is FROZEN at the cut line by the
//     score provider, so here it is just a normal eligible numeric score that
//     happens to stop moving. WD/DQ are treated the same way (frozen).
//   • Not yet started: treated as even par (0) and eligible — pre-round all
//     golfers are E, which is their true score.
//   • Fewer than `scoresCounted` eligible golfers: we count whatever is
//     available and raise `flags.fewerThanCounted` so the UI can warn.
//   • A golfer with no score data at all (toPar null) is NOT eligible.
// ===========================================================================

// A golfer is eligible to count if it has a numeric score. Cut/WD/DQ golfers
// keep a frozen numeric score, so they remain eligible (per the league rule).
function isEligible(g) {
  return g.score && typeof g.score.toPar === 'number';
}

/**
 * @param {Array} golfers  Each: { golferId, name, oddsRank, draftOverallPick,
 *                                 score: { toPar, status, thru, round, position } | null }
 * @param {number} scoresCounted  How many golfers count (default 3).
 * @returns {{
 *   teamScore: number|null,   // sum of best `scoresCounted` (null if none eligible)
 *   totalAll: number|null,    // sum of ALL eligible golfers (used for display)
 *   counting: Array,          // golfers currently counting (with .toPar)
 *   dropped: Array,           // eligible-but-dropped + ineligible golfers
 *   eligibleCount: number,
 *   flags: { fewerThanCounted: boolean, hasNoData: boolean }
 * }}
 */
export function computeTeamScore(golfers, scoresCounted = 3) {
  const eligible = golfers.filter(isEligible);
  const ineligible = golfers.filter((g) => !isEligible(g));

  // Best first. Tie-break which golfers count by earlier draft pick, then name,
  // purely for stable, deterministic display (doesn't change the team total).
  const sorted = [...eligible].sort(
    (a, b) =>
      a.score.toPar - b.score.toPar ||
      (a.draftOverallPick ?? 0) - (b.draftOverallPick ?? 0) ||
      a.name.localeCompare(b.name)
  );

  const counting = sorted.slice(0, scoresCounted);
  const droppedEligible = sorted.slice(scoresCounted);

  const teamScore = counting.length
    ? counting.reduce((sum, g) => sum + g.score.toPar, 0)
    : null;

  const totalAll = eligible.length
    ? eligible.reduce((sum, g) => sum + g.score.toPar, 0)
    : null;

  // Mark each golfer so the UI can dim the non-counters.
  const countingIds = new Set(counting.map((g) => g.golferId));
  const annotate = (g) => ({ ...g, counting: countingIds.has(g.golferId) });

  return {
    teamScore,
    totalAll,
    counting: counting.map(annotate),
    dropped: [...droppedEligible, ...ineligible].map(annotate),
    eligibleCount: eligible.length,
    flags: {
      fewerThanCounted: eligible.length < scoresCounted,
      hasNoData: ineligible.length > 0,
    },
  };
}

/**
 * Rank teams for the league leaderboard. Lowest combined score wins.
 * Tie policy: LEAVE TIED — teams with the same team score share a rank
 * (standard competition ranking: 1, 2, 2, 4). Teams with no eligible golfers
 * yet (teamScore null) sort to the bottom.
 *
 * @param {Array} teams  Each: { ...team, teamScore: number|null }
 * @returns {Array}      Same teams, sorted, each with a `rank` number.
 */
export function rankTeams(teams) {
  const sorted = [...teams].sort((a, b) => {
    if (a.teamScore == null && b.teamScore == null) return 0;
    if (a.teamScore == null) return 1; // null (no scores) sinks to the bottom
    if (b.teamScore == null) return -1;
    return a.teamScore - b.teamScore; // lower is better
  });

  let lastScore = Symbol('none');
  let lastRank = 0;
  sorted.forEach((team, i) => {
    if (team.teamScore !== lastScore) {
      lastRank = i + 1; // ties share the earlier rank; next distinct score skips
      lastScore = team.teamScore;
    }
    team.rank = lastRank;
  });
  return sorted;
}
