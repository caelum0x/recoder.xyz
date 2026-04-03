FROM node:22-slim AS base

# ---- Deps Stage ----
# Install workspace dependencies with pnpm, including local workspace
# packages like @recoder/shared.
FROM base AS deps

WORKDIR /app

# Lockfile mode: use --frozen-lockfile for prod (default), --no-frozen-lockfile for local dev
ARG PNPM_LOCKFILE_MODE=--frozen-lockfile

# Copy workspace root files for dependency resolution.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

# Copy only the frontend app and its workspace deps
COPY recoder-agents/package.json ./recoder-agents/package.json
COPY shared/package.json ./shared/package.json
COPY packages ./packages
COPY internal-packages ./internal-packages

# Create stubs for workspace members we don't need
RUN for dir in production-engine docker-backend recoder-web recoder-chat app apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done

RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    openssl \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install only the frontend workspace project (and its deps) using pnpm.
RUN corepack enable pnpm && pnpm install --filter ./recoder-agents... ${PNPM_LOCKFILE_MODE}
RUN AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm install --filter @recoder/auth... --no-frozen-lockfile
RUN AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @recoder/auth run build


# ---- Builder Stage ----
FROM base AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Bring the fully-installed workspace into the builder image.
COPY --from=deps /app /app

# Copy full source code for build
COPY recoder-agents ./recoder-agents
COPY shared ./shared

# Build the frontend app from its workspace location.
WORKDIR /app/recoder-agents

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

ARG BUILD_NODE_MAX_OLD_SPACE=5120

# NEXT_PUBLIC_* vars must be declared as ARGs so Next.js can inline them at build time
ARG NEXT_PUBLIC_APP_URL=https://agents.recoder.xyz
ARG NEXT_PUBLIC_BACKEND_URL=https://api.recoder.xyz/v1
ARG NEXT_PUBLIC_AUTH_URL=https://recoder.xyz
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NEXT_PUBLIC_AUTH_URL=${NEXT_PUBLIC_AUTH_URL}

RUN corepack enable pnpm && NODE_OPTIONS=--max_old_space_size=${BUILD_NODE_MAX_OLD_SPACE} pnpm run build
RUN test -d .next/standalone


# ---- Runner Stage ----
FROM base AS runner
WORKDIR /app

ENV NEXT_PUBLIC_VERCEL_ENV=production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built frontend assets from the workspace path.
# Next.js standalone output includes everything needed to run the server.
# The standalone directory structure mirrors the workspace, so we copy it as-is.
COPY --from=builder --chown=nextjs:nodejs /app/recoder-agents/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/recoder-agents/.next/static ./recoder-agents/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/recoder-agents/public ./recoder-agents/public

USER nextjs

ARG APP_PORT=3000
EXPOSE ${APP_PORT}

ENV PORT=${APP_PORT}

ENV HOSTNAME="0.0.0.0"
ENV NODE_OPTIONS="--max-old-space-size=1536"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:${PORT}').then(r => process.exit(r.status < 400 ? 0 : 1)).catch(() => process.exit(1))"

# Next.js standalone output in a monorepo creates server.js at recoder-agents/server.js
# relative to the standalone root (which we copied to /app)
CMD ["node", "recoder-agents/server.js"]
