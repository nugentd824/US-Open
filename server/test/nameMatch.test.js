// Unit tests for cross-provider golfer matching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, indexScoresByName, matchScore } from '../src/services/nameMatch.js';

test('normalizeName: lowercases, strips spaces/punctuation/accents/suffixes', () => {
  assert.equal(normalizeName('Rory McIlroy'), 'rorymcilroy');
  assert.equal(normalizeName('J.T. Poston'), 'jtposton');
  assert.equal(normalizeName('Matthieu Pavon'), 'matthieupavon');
  assert.equal(normalizeName('Davis Love III'), 'davislove');
  assert.equal(normalizeName('  Will   Zalatoris '), 'willzalatoris');
});

test('matchScore: prefers exact id, falls back to normalized name', () => {
  const index = indexScoresByName([
    { golferId: 'scottie-scheffler', name: 'Scottie Scheffler', toPar: -6 },
    { golferId: 'sr:player:123', name: 'Rory McIlroy', toPar: -4 },
  ]);

  // exact id match
  assert.equal(matchScore({ golfer_id: 'scottie-scheffler', name: 'Scottie Scheffler' }, index).toPar, -6);
  // id differs (odds vs score provider) -> matched by normalized name
  assert.equal(matchScore({ golfer_id: 'rory-mcilroy', name: 'Rory McIlroy' }, index).toPar, -4);
  // no match -> null
  assert.equal(matchScore({ golfer_id: 'nobody', name: 'Nobody Here' }, index), null);
});
