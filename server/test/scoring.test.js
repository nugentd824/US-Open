// Unit tests for the scoring engine — the "best N of M" rules + edge cases.
// Pure functions, no DB/network. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamScore, rankTeams } from '../src/services/scoringEngine.js';

// Helper: build a rostered golfer. toPar === null => no score data.
const g = (name, toPar, status = 'active', draftOverallPick = 1) => ({
  golferId: name,
  name,
  draftOverallPick,
  score: toPar === null ? null : { toPar, status, thru: null, round: 1, position: null },
});

test('best 3 of 6: sums the three lowest, drops the rest', () => {
  const team = [g('a', -5), g('b', -3), g('c', -1), g('d', 2), g('e', 4), g('f', 6)];
  const r = computeTeamScore(team, 3);
  assert.equal(r.teamScore, -9); // -5 + -3 + -1
  assert.equal(r.totalAll, 3); // sum of all six
  assert.equal(r.counting.length, 3);
  assert.equal(r.dropped.length, 3);
  assert.deepEqual(
    r.counting.map((x) => x.name),
    ['a', 'b', 'c']
  );
  assert.equal(r.flags.fewerThanCounted, false);
  assert.equal(r.flags.hasNoData, false);
});

test('counting flag is set on counters and cleared on dropped', () => {
  const r = computeTeamScore([g('a', -2), g('b', 0), g('c', 1), g('d', 5)], 3);
  assert.ok(r.counting.every((x) => x.counting === true));
  assert.ok(r.dropped.every((x) => x.counting === false));
});

test('missed-cut golfer is frozen-but-eligible and can still count', () => {
  // Cut golfer (+1, frozen) beats two active golfers, so it must count.
  const team = [g('a', -2), g('cut', 1, 'cut'), g('c', 5), g('d', 10), g('e', 12), g('f', 14)];
  const r = computeTeamScore(team, 3);
  assert.equal(r.teamScore, 4); // -2 + 1 + 5
  assert.ok(r.counting.some((x) => x.name === 'cut'));
});

test('WD and DQ are treated like a missed cut (eligible, frozen score)', () => {
  const team = [g('a', -3), g('wd', -1, 'wd'), g('dq', 0, 'dq'), g('d', 9), g('e', 11), g('f', 13)];
  const r = computeTeamScore(team, 3);
  assert.equal(r.teamScore, -4); // -3 + -1 + 0
  assert.deepEqual(
    r.counting.map((x) => x.name).sort(),
    ['a', 'dq', 'wd']
  );
});

test('not-started golfers count as even par and are eligible', () => {
  const team = [g('a', 3), g('pre', 0, 'not_started'), g('c', 1), g('d', 8), g('e', 9), g('f', 10)];
  const r = computeTeamScore(team, 3);
  assert.equal(r.teamScore, 4); // 0 + 1 + 3
  assert.ok(r.counting.some((x) => x.name === 'pre'));
});

test('fewer than 3 valid scores: counts what is available and flags it', () => {
  const team = [g('a', -4), g('b', 2), g('c', null), g('d', null), g('e', null), g('f', null)];
  const r = computeTeamScore(team, 3);
  assert.equal(r.teamScore, -2); // -4 + 2 (only two eligible)
  assert.equal(r.eligibleCount, 2);
  assert.equal(r.flags.fewerThanCounted, true);
  assert.equal(r.flags.hasNoData, true);
});

test('no eligible golfers yields null team score', () => {
  const team = [g('a', null), g('b', null)];
  const r = computeTeamScore(team, 3);
  assert.equal(r.teamScore, null);
  assert.equal(r.totalAll, null);
  assert.equal(r.counting.length, 0);
});

test('configurable count: best 1 of N', () => {
  const r = computeTeamScore([g('a', -2), g('b', -7), g('c', 3)], 1);
  assert.equal(r.teamScore, -7);
  assert.equal(r.counting.length, 1);
});

test('rankTeams: lowest combined on top, ties share a rank, nulls sink', () => {
  const teams = [
    { teamId: 't1', teamScore: 1 },
    { teamId: 't2', teamScore: -5 },
    { teamId: 't3', teamScore: -3 },
    { teamId: 't4', teamScore: -3 },
    { teamId: 't5', teamScore: null },
  ];
  const ranked = rankTeams(teams);
  assert.deepEqual(
    ranked.map((t) => [t.teamId, t.rank]),
    [
      ['t2', 1],
      ['t3', 2],
      ['t4', 2], // tie shares rank 2
      ['t1', 4], // next distinct score skips to 4
      ['t5', 5], // no-score team last
    ]
  );
});
