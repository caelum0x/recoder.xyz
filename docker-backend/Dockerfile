# ── Stage 1: Build ──
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (node-pty, better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

RUN echo 'onlyBuiltDependencies[]=esbuild' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=@swc/core' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=node-pty' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=better-sqlite3' >> .npmrc

COPY docker-backend/package*.json ./docker-backend/
COPY shared/package.json ./shared/
COPY packages/ ./packages/

# Create stubs for workspace members we don't need
RUN for dir in production-engine recoder-web recoder-chat app recoder-agents apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done && \
    mkdir -p internal-packages/stub && echo '{"name":"stub-internal","version":"0.0.0","private":true}' > internal-packages/stub/package.json

RUN AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile || \
    AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile

COPY docker-backend/ ./docker-backend/
COPY shared/ ./shared/

# Verify prebuilt dist exists
RUN test -f docker-backend/dist/server.js

# Prune to production dependencies only
RUN CI=true AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --prod --no-frozen-lockfile

# ── Stage 2: Runtime ──
FROM node:20-slim

WORKDIR /app

# Docker CLI needed for container management, curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

# Copy only production artifacts from builder
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/docker-backend ./docker-backend
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages ./packages

WORKDIR /app/docker-backend

# Run as non-root
RUN addgroup --system --gid 1001 backend && \
    adduser --system --uid 1001 --ingroup backend --home /home/backend backend && \
    mkdir -p /home/backend/.cache/node/corepack && \
    chown -R backend:backend /app /home/backend
USER backend

EXPOSE 3100
ENV NODE_OPTIONS="--max-old-space-size=3072"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3100/health -o /dev/null || exit 1

CMD ["pnpm", "start"]
