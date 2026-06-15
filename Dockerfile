# syntax=docker/dockerfile:1
# Portable image for any long-running host (Fly.io, Railway, Render-as-Docker,
# a VPS, etc.). Builds the React client and runs the single Node server, which
# serves the API, the WebSocket hub, and the built SPA on one port.

# ---- build stage: install deps (compiles better-sqlite3) + build the client --
FROM node:20-bookworm AS build
WORKDIR /app

# Install with the lockfile first for better layer caching.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

# Build the client (vite). devDependencies are present in this stage.
COPY . .
RUN npm run build

# ---- runtime stage ----------------------------------------------------------
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/app/data/app.db
WORKDIR /app

# Bring over the fully-built app (node_modules incl. the compiled native module,
# server source, and client/dist).
COPY --from=build /app ./

# SQLite lives here — mount a persistent volume at /app/data to keep data.
VOLUME ["/app/data"]
EXPOSE 4000

# Run node directly (clean signal handling as PID 1).
CMD ["node", "server/src/index.js"]
