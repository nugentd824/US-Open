// HTTP + WebSocket entrypoint. Serves the REST API, the websocket hub, and (in
// production) the built React client. Starts the background schedulers.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import './db.js';
import { tournamentsRouter } from './routes/tournaments.js';
import { leaguesRouter } from './routes/leagues.js';
import { draftRouter } from './routes/draft.js';
import { initWebSocket } from './ws.js';
import { startSchedulers } from './services/poller.js';
import { oddsProviderName } from './providers/oddsProvider.js';
import { scoreProviderName } from './providers/scoreProvider/index.js';

const app = express();
app.use(express.json());

// Expose which providers are active so the UI can label data sources.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, oddsProvider: oddsProviderName, scoreProvider: scoreProviderName });
});

app.use('/api/tournaments', tournamentsRouter);
app.use('/api/leagues', leaguesRouter);
app.use('/api/leagues', draftRouter);

// Serve the built client in production (single-server deploy).
const clientDist = path.resolve(config.repoRoot, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Centralized error handler -> consistent JSON errors.
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal error' });
});

const server = http.createServer(app);
initWebSocket(server);
startSchedulers();

server.listen(config.port, () => {
  console.log(`\n  Fairway Fantasy server on http://localhost:${config.port}`);
  console.log(`  odds provider:  ${oddsProviderName}`);
  console.log(`  score provider: ${scoreProviderName}`);
  console.log(`  poll interval:  ${config.scorePollSeconds}s\n`);
});
