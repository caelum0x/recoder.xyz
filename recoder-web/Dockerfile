# ── Stage 1: Build ──
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

RUN echo 'onlyBuiltDependencies[]=esbuild' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=@swc/core' >> .npmrc

COPY recoder-web/package.json ./recoder-web/
COPY shared/package.json ./shared/
COPY packages/ ./packages/

# Stub @recoder/auth to skip prisma generate
RUN rm -rf packages/auth && \
    mkdir -p packages/auth && \
    echo '{"name":"@recoder/auth","version":"0.0.0","private":true}' > packages/auth/package.json

RUN for dir in production-engine docker-backend recoder-chat app recoder-agents apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done && \
    mkdir -p internal-packages/stub && echo '{"name":"stub-internal","version":"0.0.0","private":true}' > internal-packages/stub/package.json

# Full install with dev deps for build
RUN pnpm install --filter ..../recoder-web --no-frozen-lockfile

COPY recoder-web/ ./recoder-web/
COPY shared/ ./shared/

WORKDIR /app/recoder-web

ARG BUILD_NODE_MAX_OLD_SPACE=3072
RUN NODE_OPTIONS=--max_old_space_size=${BUILD_NODE_MAX_OLD_SPACE} SKIP_ENV_VALIDATION=true pnpm run build

# Go back to root and prune to production deps
WORKDIR /app
RUN CI=true pnpm install --filter ..../recoder-web --prod --no-frozen-lockfile

# ── Stage 2: Runtime ──
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

# Copy only production artifacts
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/recoder-web/node_modules ./recoder-web/node_modules
COPY --from=builder /app/recoder-web/package.json ./recoder-web/package.json
COPY --from=builder /app/recoder-web/server.js ./recoder-web/server.js
COPY --from=builder /app/recoder-web/build ./recoder-web/build
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages ./packages

WORKDIR /app/recoder-web

# Run as non-root
RUN addgroup --system --gid 1001 webgroup && \
    adduser --system --uid 1001 --ingroup webgroup --home /home/webuser webuser && \
    mkdir -p /home/webuser/.cache/node/corepack && \
    chown -R webuser:webgroup /app /home/webuser
USER webuser

EXPOSE 5173
ENV NODE_OPTIONS="--max-old-space-size=1536"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:5173/api/health -o /dev/null || exit 1

CMD ["node", "server.js"]
