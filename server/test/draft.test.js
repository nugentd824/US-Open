// Unit tests for the snake-draft ordering math (pure helpers, no DB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { snakeTeamForPick, totalPicks } from '../src/services/draftEngine.js';

const ORDER = ['A', 'B', 'C', 'D'];

test('round 1 runs forward 1..N', () => {
  assert.deepEqual([1, 2, 3, 4].map((p) => snakeTeamForPick(ORDER, p).teamId), ['A', 'B', 'C', 'D']);
  assert.equal(snakeTeamForPick(ORDER, 1).round, 1);
  assert.equal(snakeTeamForPick(ORDER, 4).round, 1);
});

test('round 2 reverses N..1 (the snake)', () => {
  assert.deepEqual([5, 6, 7, 8].map((p) => snakeTeamForPick(ORDER, p).teamId), ['D', 'C', 'B', 'A']);
  assert.equal(snakeTeamForPick(ORDER, 5).round, 2);
});

test('round 3 runs forward again', () => {
  assert.deepEqual([9, 10, 11, 12].map((p) => snakeTeamForPick(ORDER, p).teamId), ['A', 'B', 'C', 'D']);
  assert.equal(snakeTeamForPick(ORDER, 9).round, 3);
});

test('back-to-back picks at the turn (end of odd round into even round)', () => {
  // Team D picks #4 (end of round 1) and #5 (start of round 2).
  assert.equal(snakeTeamForPick(ORDER, 4).teamId, 'D');
  assert.equal(snakeTeamForPick(ORDER, 5).teamId, 'D');
});

test('totalPicks = teams * roster size', () => {
  assert.equal(totalPicks(['A', 'B', 'C'], 6), 18);
  assert.equal(totalPicks(ORDER, 5), 20);
});

test('works for a 2-team league', () => {
  const o = ['X', 'Y'];
  assert.deepEqual([1, 2, 3, 4].map((p) => snakeTeamForPick(o, p).teamId), ['X', 'Y', 'Y', 'X']);
});
