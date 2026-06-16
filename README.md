# ⛳ Fairway Fantasy

[![CI](https://github.com/nugentd824/US-Open/actions/workflows/ci.yml/badge.svg)](https://github.com/nugentd824/US-Open/actions/workflows/ci.yml)

A mobile-friendly web app for a fantasy PGA golf game played among a small group
of friends (2–12 players). Each league does a **snake draft** of real golfers for
an upcoming PGA tournament, every team ends up with a 6-golfer roster, and during
the tournament a **live leaderboard** ranks teams by the combined score of their
**3 best-performing golfers**.

Three primary screens: **Draft Room**, **Live Leaderboard**, **My Team**.

---

## Contents

- [Features](#features)
- [How scoring works](#how-scoring-works)
- [Tech & architecture](#tech--architecture)
- [Quick start](#quick-start)
- [Deployment](#deployment)
- [Environment variables](#environment-variables)
- [Data providers (and how to swap them)](#data-providers-and-how-to-swap-them)
- [Running a mock demo](#running-a-mock-demo)
- [Where to tweak the rules](#where-to-tweak-the-rules)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Limitations](#limitations)

---

## Features

- **League & lobby** — create a league, get a shareable invite code/link, friends
  join and name their team. The host selects the tournament and configures
  roster size (default 6), how many scores count (default best 3), and an
  optional per-pick timer.
- **Golfer pool driven by odds** — the field is pulled with win odds from a
  sportsbook source, sorted favorites-first, with implied win probability shown.
  Searchable and sortable. *Odds drive draft order and the auto-pick only — they
  never affect scoring.*
- **Snake draft** — randomized or host-set order; 1→N, N→1, 1→N… for as many
  rounds as roster spots. A drafted golfer is removed from the pool. A per-pick
  timer (default **60 minutes**, suiting an async draft) auto-drafts the top
  remaining favorite on expiry, and any player can flip **auto-pick On/Off** for
  their own team to have their picks made for them while they're away (the host
  can toggle it for anyone). Draft state is **persisted**, so a
  refresh/disconnect resumes cleanly.
- **Live scoring** — the server polls the score provider on a schedule and
  **pushes** updates over WebSockets, so leaderboards move without a refresh.
- **Leaderboard & team views** — rank, team name, best-3 combined score, an
  expandable view of all 6 golfers showing which 3 are counting vs. dropped,
  color-coded under/over par, "thru X" status, and a visual cue when ranks change.

## How scoring works

Golf is scored relative to par, so **lower is better** (`-8` beats `-3` beats
`+2`). Scores are stored as integers relative to par.

- **Team score** = sum of the **best 3 of 6** golfers' to-par values. The 3 that
  count are **recomputed on every update** and can change round to round. The
  Leaderboard/My Team screens show which golfers are counting (highlighted) vs.
  dropped (dimmed).
- **Missed cut (MC):** the golfer's score is **frozen at the cut line** (their
  36-hole to-par) and simply stops moving. They remain eligible and can still
  count if your other golfers are worse.
- **Withdrawal (WD) / Disqualification (DQ):** treated **the same as a missed
  cut** — score frozen at the point they stopped. Shown with a `WD`/`DQ` badge.
- **Not yet started:** treated as even par (`E`) and eligible (pre-round, every
  golfer is genuinely E). In-progress golfers show a "thru X" badge.
- **Fewer than 3 valid scores:** the team counts whatever is available and the
  UI raises a "fewer than target valid scores" flag.
- **Ties:** teams with the same combined score **share a rank** (no tiebreaker).

These rules are stated in-app on the Leaderboard and My Team screens so players
always understand the edge cases.

## Tech & architecture

- **Frontend:** React 18 + Vite + Tailwind CSS, React Router. Mobile-first.
- **Backend:** Node + Express, a single long-running process that also hosts:
  - a **WebSocket hub** (`ws`) that pushes `lobby` / `draft` / `leaderboard`
    updates to clients in a per-league room;
  - two **background schedulers** — a score poller (every `SCORE_POLL_SECONDS`)
    and a 1-second draft-timer loop for auto-picks.
- **Persistence:** SQLite (`better-sqlite3`) — leagues, teams, draft picks,
  draft clock, the per-league golfer pool, and cached scores. Survives restarts.
- **Swappable data layer:** all live scoring goes through a single
  **`ScoreProvider`** interface (mock / Sportradar). Game logic never imports a
  concrete provider.
- **Secrets** live only in environment variables and are never exposed to the
  client. The browser only ever talks to this server's `/api` and `/ws`.

In production the Node server also serves the built React app, so it's a single
deployable process.

## Quick start

**Prerequisites:** Node.js ≥ 20.

```bash
# 1. install (root + both workspaces)
npm install

# 2. configure (defaults to the mock providers — no API keys needed)
cp .env.example .env

# 3a. development: server (:4000) + Vite dev server (:5173) with hot reload
npm run dev
#    -> open http://localhost:5173

# 3b. OR production single-server: build the client, serve everything on :4000
npm run build
npm start
#    -> open http://localhost:4000
```

By default everything runs against the **mock providers**, so you can develop
and demo a full game — draft and a live, moving leaderboard — with **no API keys
and no live tournament**.

To play with friends, share the invite link (`/join/<CODE>`). For real use across
the internet, run `npm run build && npm start` on a host they can reach.

## Deployment

This app is **one long-running Node process** (it serves the API, the WebSocket
hub, and the built SPA on a single port) with a background score poller and a
SQLite database. Deploy it on any host that runs a persistent process — **not**
a serverless platform like Vercel, where the schedulers wouldn't run, WebSockets
can't stay connected, and the SQLite file wouldn't persist.

Two things matter on every host:

1. **Set env vars** (see below) — at minimum your provider keys if you're going
   live; the defaults run on the mock providers.
2. **Persist `data/app.db`** — mount a volume at the database directory (or point
   `DB_PATH` at one) so leagues/drafts/scores survive restarts.

Config files are included for the common hosts:

| Host | How |
| --- | --- |
| **Render** | `render.yaml` is a Blueprint: New → Blueprint → pick this repo. It provisions a web service + a 1 GB persistent disk and sets `DB_PATH`. Add `ODDS_API_KEY` / `SPORTRADAR_API_KEY` as secrets in the dashboard. |
| **Fly.io** | `fly launch --no-deploy`, then `fly volumes create fairway_data --size 1`, `fly secrets set ODDS_API_KEY=… SPORTRADAR_API_KEY=…`, and `fly deploy`. Uses the `Dockerfile` + `fly.toml` (volume mounted at `/data`). |
| **Railway / VPS / Docker** | Build the `Dockerfile` and run it with a volume at `/app/data`. e.g. `docker build -t fairway . && docker run -p 4000:4000 -v fairway-data:/app/data --env-file .env fairway`. |
| **Bare metal** | `npm install && npm run build && npm start` behind a process manager (systemd/pm2) and HTTPS (the per-device player id rides in request bodies). |

WebSockets work on all of the above on the same port — no extra configuration.

### Split deploy: static frontend on Vercel + backend on Render/Fly

You can keep the static client on **Vercel** and run the Node backend on a
long-running host. (You cannot run the *backend* on Vercel — it's a persistent
process; a serverless function crashes with `FUNCTION_INVOCATION_FAILED`.)

1. **Backend → Render/Fly** (above). Note its public URL, e.g.
   `https://fairway-fantasy.onrender.com`. Set `CORS_ORIGINS` to your Vercel URL
   (or leave `*`).
2. **Frontend → Vercel.** `vercel.json` is included and pins a **static** build
   (no serverless function): it installs and builds **only the `client`
   workspace** (`npm ci --workspace client`, so the server's native
   `better-sqlite3` is never installed), relocates the build to a top-level
   `dist`, and serves it with SPA routing. In the Vercel project's
   **Environment Variables**, set:
   - `VITE_API_BASE = https://fairway-fantasy.onrender.com` (your backend URL)
   - optionally `VITE_WS_BASE` (otherwise derived from `VITE_API_BASE`, http→ws)

   These are read at build time, so the static client calls your backend's
   `/api` and `/ws` directly. Redeploy after changing them.

## Environment variables

Copy `.env.example` → `.env`. All config is environment-driven; **no keys are
hardcoded**.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP/WebSocket port. |
| `DB_PATH` | `./data/app.db` | SQLite file location. |
| `ODDS_PROVIDER` | `mock` | `mock` \| `theoddsapi`. Source of the field + win odds. |
| `ODDS_API_KEY` | — | The Odds API key (required if `ODDS_PROVIDER=theoddsapi`). |
| `SCORE_PROVIDER` | `mock` | `mock` \| `espn` \| `sportradar`. Source of live scores. |
| `ESPN_EVENT_ID` | — | Optional: pin a specific ESPN event id (else the current PGA event). |
| `SPORTRADAR_API_KEY` | — | Sportradar Golf key (required if `SCORE_PROVIDER=sportradar`). |
| `SPORTRADAR_ACCESS_LEVEL` | `trial` | `trial` \| `production`. |
| `SPORTRADAR_TOURNAMENT_ID` | — | Pin a Sportradar tournament id (see provider note). |
| `SCORE_POLL_SECONDS` | `20` | How often scores are polled and pushed. Use 60–120 for real APIs. |
| `MOCK_ROUND_SECONDS` | `120` | Mock only: real seconds per simulated round. Lower = faster demo. |
| `CORS_ORIGINS` | `*` | Allowed browser origins for cross-origin (split) deploys. Comma-separated, or `*`. |
| `VITE_API_BASE` | — | **Client build:** backend base URL for a split deploy (unset = same origin). |
| `VITE_WS_BASE` | — | **Client build:** WebSocket base URL (defaults to `VITE_API_BASE` with http→ws). |

## Data providers (and how to swap them)

The app cleanly separates **odds** (draft pool) from **scores** (leaderboard), so
you can mix and match.

### Odds — the draftable field + win odds

- **`mock`** (default): a realistic 60-golfer field with illustrative odds from
  `server/src/fixtures/golfers.js`.
- **`theoddsapi`**: [The Odds API](https://the-odds-api.com) (free tier
  available). Active golf events become selectable tournaments and the
  `outrights` market provides the field + decimal odds.
  ```env
  ODDS_PROVIDER=theoddsapi
  ODDS_API_KEY=your_key_here
  ```
  Implementation: `server/src/providers/oddsProvider.js`.

### Scores — the live leaderboard (the swappable `ScoreProvider`)

- **`mock`** (default): a deterministic, time-evolving tournament simulation
  (`server/src/providers/scoreProvider/mockProvider.js`) that exercises every
  edge case — in-progress "thru X", a mid-event cut, a WD, and a DQ.
- **`espn`** (free, no key): live PGA leaderboard via ESPN's public golf JSON
  (`server/src/providers/scoreProvider/espnProvider.js`). It auto-uses the
  current PGA event, so there's no tournament id to resolve. Not an officially
  documented/licensed API — stable in practice, but unofficial (use at your own
  discretion). Optionally pin a specific event with `ESPN_EVENT_ID`.
  ```env
  SCORE_PROVIDER=espn
  SCORE_POLL_SECONDS=120   # be polite to an unofficial endpoint
  # ESPN_EVENT_ID=401580351   # optional: pin a specific ESPN event
  ```
- **`sportradar`** (recommended for production): the **sanctioned** golf data
  feed — [Sportradar Golf v3](https://developer.sportradar.com/golf/reference).
  ```env
  SCORE_PROVIDER=sportradar
  SPORTRADAR_API_KEY=your_key_here
  SPORTRADAR_ACCESS_LEVEL=trial   # or production
  # Pin the event you're scoring (see note below):
  SPORTRADAR_TOURNAMENT_ID=sr:tournament:xxxxx
  ```
  Implementation: `server/src/providers/scoreProvider/sportradarProvider.js`.

> **Why not scrape PGATour.com?** PGATour.com has no documented public API;
> scraping it is fragile and may violate their terms of service. The app is built
> so you plug in a **licensed** feed (Sportradar) instead. To add another source,
> implement the `ScoreProvider` interface (documented at the top of
> `server/src/providers/scoreProvider/index.js`) and register it there — nothing
> in the game logic changes.

**Cross-provider name matching.** The odds provider and score provider assign
different golfer ids, so rostered golfers are matched to live scores by id first
and then by **normalized name** (`server/src/services/nameMatch.js`). With the
mock providers ids line up exactly. For real providers, name normalization
handles most cases; unusual spellings/suffixes may need tuning there.

**Resolving the Sportradar tournament id.** The league's tournament id comes from
the *odds* provider, which won't match Sportradar's id. Pin the live event with
`SPORTRADAR_TOURNAMENT_ID`, or resolve it once from Sportradar's
`/tournaments/schedule.json` and set it. (Mock mode needs none of this.)

## Running a mock demo

The mock score provider simulates a full 4-round tournament starting when the
server boots, so the leaderboard moves on its own.

```bash
# Fast demo: each round plays out in ~12s, scores pushed every 3s.
MOCK_ROUND_SECONDS=12 SCORE_POLL_SECONDS=3 npm run dev
```

Then:

1. Create a league, copy the invite link, and open it in another browser/profile
   (or have a friend join) — you need at least 2 teams.
2. As the host, pick a tournament (e.g. "U.S. Open"), then **Start snake draft**.
3. Draft until rosters fill (or set a pick timer and let auto-pick finish it).
4. Watch the **Leaderboard** — within a minute or two you'll see live "thru X"
   scores, the cut applied (golfers frozen at the cut line), a WD and a DQ, and
   teams swapping ranks with ▲/▼ cues.

With the default `MOCK_ROUND_SECONDS=120`, a full event plays out over ~8 minutes.

## Where to tweak the rules

The two pieces you'll most likely want to adjust are heavily commented:

- **Best-N-of-M scoring + edge cases + tie policy:**
  `server/src/services/scoringEngine.js`
- **Snake draft order + pick advancement + auto-pick:**
  `server/src/services/draftEngine.js`
- **Mock simulation pacing / cut / WD / DQ:**
  `server/src/providers/scoreProvider/mockProvider.js`

## API reference

All endpoints are JSON under `/api`. WebSocket: `/ws?leagueId=<id>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Active provider names. |
| `GET` | `/api/tournaments` | Selectable events. |
| `POST` | `/api/leagues` | Create a league (+ host team). |
| `GET` | `/api/leagues/resolve/:code` | Invite code → league id. |
| `GET` | `/api/leagues/:id` | Lobby/meta state. |
| `POST` | `/api/leagues/:id/join` | Join with a team name. |
| `POST` | `/api/leagues/:id/tournament` | Host selects event + loads the pool. |
| `PATCH` | `/api/leagues/:id/settings` | Host sets roster size / scores counted / timer. |
| `GET` | `/api/leagues/:id/pool` | Draftable golfer pool + availability. |
| `GET` | `/api/leagues/:id/draft` | Live draft board. |
| `POST` | `/api/leagues/:id/draft/start` | Host starts (optional order). |
| `POST` | `/api/leagues/:id/draft/pick` | Make a pick. |
| `POST` | `/api/leagues/:id/draft/autopick` | Toggle a team's auto-pick on/off. |
| `GET` | `/api/leagues/:id/leaderboard` | Live best-3-of-6 standings. |

WebSocket pushes (per league room): `{ type: 'lobby' | 'draft' | 'leaderboard', payload }`.

## Project structure

```
.
├── package.json            # npm workspaces + dev/build/start scripts
├── .env.example            # all configuration
├── server/                 # Node + Express + SQLite + WebSocket
│   └── src/
│       ├── index.js            # http + ws + static client, wiring
│       ├── config.js           # env-driven config
│       ├── db.js               # SQLite schema
│       ├── fixtures/golfers.js # mock field + odds + tournaments
│       ├── providers/
│       │   ├── oddsProvider.js          # mock | The Odds API
│       │   └── scoreProvider/           # swappable ScoreProvider
│       │       ├── index.js             # interface + factory
│       │       ├── mockProvider.js      # simulated live tournament
│       │       └── sportradarProvider.js
│       ├── services/
│       │   ├── draftEngine.js   # snake draft (commented)
│       │   ├── scoringEngine.js # best-N-of-M (commented)
│       │   ├── leaderboard.js   # rosters + scores -> standings
│       │   ├── leagues.js       # league/pool helpers
│       │   ├── nameMatch.js     # cross-provider matching
│       │   └── poller.js        # score + draft-timer schedulers
│       ├── routes/              # tournaments / leagues / draft
│       └── ws.js                # websocket hub
└── client/                 # React + Vite + Tailwind
    └── src/
        ├── pages/  Home, JoinPage, LeaguePage, Lobby, DraftRoom, Leaderboard, MyTeam
        ├── components/  AppHeader, GolferLine, ui
        ├── hooks/useLeagueSocket.js
        └── lib/  api, player, format
```

## Limitations

- **Identity is per-device** (no passwords): each browser gets a stable random
  player id in `localStorage`, plus a team name. Great for a friends group;
  clearing storage or switching devices starts a new identity. Swap in real auth
  if you need cross-device login.
- **Cross-provider name matching** is heuristic for real providers (see above).
- The default SQLite file is local to the server; back up `data/app.db` if you
  care about history.

### Tests

Core logic is covered by Node's built-in test runner (zero extra deps):

```bash
npm test
```

This exercises the **best-N-of-M scoring + every edge case** (cut/WD/DQ freeze,
not-started, fewer-than-3), the **snake-draft ordering**, **cross-provider name
matching**, and a **DB-backed wiring test** that runs a full league from
tournament selection → snake draft → live leaderboard against the mock provider.
CI is not wired up, and the React frontend is not browser-tested here (the
environment blocked downloading a headless browser).
