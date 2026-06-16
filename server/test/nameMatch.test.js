// Unit tests for cross-provider golfer matching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, indexScoresByName, matchScore, looseKey } from '../src/services/nameMatch.js';

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

test('looseKey collapses accent and first-name variants to last name + initial', () => {
  assert.equal(looseKey('Ludvig Åberg'), 'abergl');
  assert.equal(looseKey('Ludvig Aberg'), 'abergl');
  assert.equal(looseKey('Matt Fitzpatrick'), 'fitzpatrickm');
  assert.equal(looseKey('Matthew Fitzpatrick'), 'fitzpatrickm');
});

test('matchScore: loose fallback resolves accent / Matt-vs-Matthew mismatches', () => {
  // Score rows use ESPN's name forms; drafted golfers use the odds feed's forms.
  const index = indexScoresByName([
    { golferId: 'ludvig-aberg', name: 'Ludvig Åberg', toPar: 0, status: 'not_started' },
    { golferId: 'matt-fitzpatrick', name: 'Matt Fitzpatrick', toPar: 0, status: 'not_started' },
  ]);
  // Different first-name form, no exact id/name match -> resolved by loose key.
  assert.equal(matchScore({ golfer_id: 'matthew-fitzpatrick', name: 'Matthew Fitzpatrick' }, index).status, 'not_started');
  // Accent vs no-accent.
  assert.equal(matchScore({ golfer_id: 'ludvig-aberg-x', name: 'Ludvig Aberg' }, index).status, 'not_started');
});

test('matchScore: ambiguous loose key does not match', () => {
  const index = indexScoresByName([
    { golferId: 'a', name: 'Adam Scott', toPar: -2 },
    { golferId: 'b', name: 'Aaron Scott', toPar: 3 },
  ]);
  // "Alex Scott" loose-keys to "scotta" which matches two players -> no match.
  assert.equal(matchScore({ golfer_id: 'x', name: 'Alex Scott' }, index), null);
});
