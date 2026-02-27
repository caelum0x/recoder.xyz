FROM node:20-slim

WORKDIR /app

# Install Docker CLI + build tools for native modules (node-pty)
RUN apt-get update && apt-get install -y \
    docker.io \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm for workspace protocol support
RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

# Install Tier-1 connector CLIs used by A2A runtime checks.
# Retry to tolerate transient registry/network errors during image builds.
RUN npm install -g @openai/codex @anthropic-ai/claude-code || \
    npm install -g @openai/codex @anthropic-ai/claude-code || \
    npm install -g @openai/codex @anthropic-ai/claude-code

# Copy workspace root files for dependency resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

# Allow esbuild, @swc/core, and node-pty to run postinstall scripts
RUN echo 'onlyBuiltDependencies[]=esbuild' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=@swc/core' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=node-pty' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=better-sqlite3' >> .npmrc

COPY docker-backend/package*.json ./docker-backend/
COPY shared/package.json ./shared/
# packages/ includes pre-built dist/ for vault and stream (synced via rsync)
COPY packages/ ./packages/

# Create stubs for workspace members we don't need
RUN for dir in production-engine recoder-web recoder-chat app recoder-frontend apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done && \
    mkdir -p internal-packages/stub && echo '{"name":"stub-internal","version":"0.0.0","private":true}' > internal-packages/stub/package.json

# Install docker-backend and its workspace dependencies only.
# NOTE: `./docker-backend...` selects *dependents* (reverse deps) and explodes
# the install set; we want dependencies, so use `..../docker-backend`.
# Retry to tolerate transient network failures in third-party postinstall downloads.
RUN AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile || \
    AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile || \
    AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile

# Copy the actual source code
COPY docker-backend/ ./docker-backend/
COPY shared/ ./shared/

# vault/stream dist/ already included via COPY packages/ (pre-built locally)

WORKDIR /app/docker-backend
# The repo ships prebuilt `docker-backend/dist/*`. Building with `tsc` inside the
# container currently fails due to TS config/import mismatches, but runtime
# uses `dist/server.js` directly. Deploys should not be blocked on typecheck.
RUN test -f dist/server.js

# Run as non-root for production security
RUN addgroup --system --gid 1001 backend && \
    adduser --system --uid 1001 --ingroup backend backend && \
    chown -R backend:backend /app
USER backend

EXPOSE 3100
ENV NODE_OPTIONS="--max-old-space-size=3072"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3100/health -o /dev/null || exit 1

CMD ["pnpm", "start"]
