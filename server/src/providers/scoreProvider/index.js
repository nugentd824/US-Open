// ScoreProvider — the single, swappable interface the scoring layer depends on.
// Game logic NEVER imports a concrete provider; it imports `scoreProvider` here.
// To change data sources, add a module and a case below — nothing else changes.
//
//   interface ScoreProvider {
//     // Returns live scores for every golfer in the tournament field.
//     // Each entry: {
//     //   golferId: string,       // stable id (mock: name slug; real: matched by name)
//     //   name: string,
//     //   toPar: number | null,   // integer relative to par; null if unknown/not started
//     //   status: 'active' | 'cut' | 'wd' | 'dq' | 'not_started',
//     //   thru: string | null,    // holes completed this round: "12", "F", or null
//     //   round: number | null,   // current round 1..4
//     //   position: string | null // leaderboard position label, e.g. "T4"
//     // }
//     getScores(tournamentId): Promise<Entry[]>
//   }
//
// Swap with SCORE_PROVIDER=mock|sportradar.
import { config } from '../../config.js';
import { mockScoreProvider } from './mockProvider.js';
import { sportradarScoreProvider } from './sportradarProvider.js';

let provider;
let providerName;

switch (config.scoreProvider) {
  case 'sportradar':
    provider = sportradarScoreProvider;
    providerName = 'sportradar';
    break;
  case 'mock':
  default:
    provider = mockScoreProvider;
    providerName = 'mock';
    break;
}

export const scoreProvider = provider;
export const scoreProviderName = providerName;
