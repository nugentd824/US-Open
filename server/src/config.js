// Central runtime configuration, all sourced from environment variables.
// Loading .env from the repo root so a single file configures both workspaces.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env') });

export const config = {
  port: Number(process.env.PORT || 4000),
  dbPath: process.env.DB_PATH
    ? path.resolve(repoRoot, process.env.DB_PATH)
    : path.join(repoRoot, 'data', 'app.db'),

  oddsProvider: (process.env.ODDS_PROVIDER || 'mock').toLowerCase(),
  oddsApiKey: process.env.ODDS_API_KEY || '',

  scoreProvider: (process.env.SCORE_PROVIDER || 'mock').toLowerCase(),
  sportradarApiKey: process.env.SPORTRADAR_API_KEY || '',
  sportradarAccessLevel: process.env.SPORTRADAR_ACCESS_LEVEL || 'trial',

  scorePollSeconds: Number(process.env.SCORE_POLL_SECONDS || 20),
  mockRoundSeconds: Number(process.env.MOCK_ROUND_SECONDS || 120),

  isProduction: process.env.NODE_ENV === 'production',
  repoRoot,
};
