# ── Stage 0: zrok2 client ──
FROM docker.io/openziti/zrok2:latest AS zrok2

# ── Stage 1: Build ──
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (node-pty, better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

# Allow native dependencies to build (pnpm 10 requires explicit opt-in)
# duckdb requires native compilation; better-sqlite3 does too
RUN printf '\nonlyBuiltDependencies[]=duckdb\nonlyBuiltDependencies[]=better-sqlite3\nonlyBuiltDependencies[]=node-pty\n' >> .npmrc || true

COPY docker-backend/package*.json ./docker-backend/
COPY shared/package.json ./shared/
COPY packages/ ./packages/

# Create stubs for workspace members we don't need
RUN for dir in apps/mobile scripts; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done

RUN AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile || \
    AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --no-frozen-lockfile

COPY docker-backend/ ./docker-backend/
COPY shared/ ./shared/

# Compile shared opencode-client to JS (Node.js can't import .ts at runtime)
RUN npx tsc shared/src/opencode-client.ts --outDir shared/dist \
    --declaration --esModuleInterop --module commonjs --target es2020 --skipLibCheck 2>/dev/null || true
# Update shared exports to point to compiled JS
RUN node -e "const fs=require('fs'); \
    const p=JSON.parse(fs.readFileSync('shared/package.json','utf8')); \
    if(p.exports['./opencode-client']) p.exports['./opencode-client']='./dist/opencode-client.js'; \
    fs.writeFileSync('shared/package.json',JSON.stringify(p,null,2));"

# Verify prebuilt dist exists
RUN test -f docker-backend/dist/server.js

# Prune to production dependencies only
RUN CI=true AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm install --filter ..../docker-backend --prod --no-frozen-lockfile

# ── Stage 2: Runtime ──
FROM node:20-slim

WORKDIR /app

# Docker CLI for container management, curl for healthchecks, and git + tmux for
# the Conductor: git worktrees isolate each parallel agent run and tmux hosts the
# persistent per-agent terminal (survives backend restarts). Versions are pinned
# by the node:20-slim (Debian stable) base tag.
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io curl git tmux \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

# Create the runtime user before copying app files so we can use COPY --chown
# instead of an expensive recursive chown over /app in a later layer.
RUN addgroup --system --gid 1001 backend && \
    adduser --system --uid 1001 --ingroup backend --home /home/backend backend && \
    mkdir -p /home/backend/.cache/node/corepack && \
    chown -R backend:backend /home/backend && \
    groupadd -g 119 hostdocker 2>/dev/null || true && \
    usermod -aG hostdocker backend 2>/dev/null || true

# Copy only production artifacts from builder
COPY --from=builder --chown=backend:backend /app/package.json /app/pnpm-workspace.yaml /app/.npmrc* ./
COPY --from=builder --chown=backend:backend /app/node_modules ./node_modules
COPY --from=builder --chown=backend:backend /app/docker-backend ./docker-backend
COPY --from=builder --chown=backend:backend /app/shared ./shared
COPY --from=builder --chown=backend:backend /app/packages ./packages
COPY --from=zrok2 /usr/local/bin/zrok2 /usr/local/bin/zrok2

# Pi coding agent SDK (optional — enables POST /api/pi/:projectId)
# Copy built pi-mono packages and install their npm dependencies
COPY --chown=backend:backend pi-mono-dist/ /tmp/pi-mono/
USER backend
RUN cd /tmp/pi-mono/coding-agent && npm install --omit=dev --ignore-scripts 2>/dev/null; \
    for pkg in coding-agent ai agent tui web-ui; do \
      src="/tmp/pi-mono/$pkg"; \
      name=$(node -e "console.log(require('$src/package.json').name)"); \
      dest="/app/node_modules/$name"; \
      mkdir -p "$dest" && cp -r "$src/dist" "$dest/" && cp "$src/package.json" "$dest/"; \
      [ -d "$src/node_modules" ] && cp -r "$src/node_modules"/* /app/node_modules/ 2>/dev/null; \
    done; \
    rm -rf /tmp/pi-mono

WORKDIR /app/docker-backend

EXPOSE 3100
ENV NODE_OPTIONS="--max-old-space-size=3072"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3100/health -o /dev/null || exit 1

CMD ["pnpm", "start"]
