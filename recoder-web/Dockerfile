FROM node:20-slim

WORKDIR /app

# Install curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Enable pnpm for workspace protocol support
RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

# Copy workspace root files for dependency resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

# Allow esbuild and @swc/core to run postinstall scripts (needed for Vite)
RUN echo 'onlyBuiltDependencies[]=esbuild' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=@swc/core' >> .npmrc

# Copy workspace member package.json files for pnpm resolution.
# We need stubs for ALL workspace members referenced in pnpm-workspace.yaml
# so pnpm doesn't error on missing directories.
COPY recoder-web/package.json ./recoder-web/
COPY shared/package.json ./shared/
# packages/ includes pre-built dist/ for vault and stream (synced via rsync)
COPY packages/ ./packages/

# Stub out workspace packages that should never run in this image build.
# `@recoder/auth` runs `prisma generate` in `postinstall` and will fail without
# its DB config; recoder-web does not depend on it.
RUN rm -rf packages/auth && \
    mkdir -p packages/auth && \
    echo '{"name":"@recoder/auth","version":"0.0.0","private":true}' > packages/auth/package.json

# Create stubs for workspace members we don't need but that pnpm-workspace.yaml references
RUN for dir in production-engine docker-backend recoder-chat app recoder-agents apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done && \
    mkdir -p internal-packages/stub && echo '{"name":"stub-internal","version":"0.0.0","private":true}' > internal-packages/stub/package.json

# Install recoder-web and its workspace dependencies only.
RUN pnpm install --filter ..../recoder-web --no-frozen-lockfile

# Copy source code
COPY recoder-web/ ./recoder-web/
COPY shared/ ./shared/

# vault/stream dist/ already included via COPY packages/ (pre-built locally)

WORKDIR /app/recoder-web

# Build the Remix app (needs extra heap for Vite bundling)
RUN NODE_OPTIONS=--max_old_space_size=4096 SKIP_ENV_VALIDATION=true pnpm run build

# Run as non-root for production security
RUN addgroup --system --gid 1001 webgroup && \
    adduser --system --uid 1001 --ingroup webgroup webuser && \
    chown -R webuser:webgroup /app
USER webuser

EXPOSE 5173
ENV NODE_OPTIONS="--max-old-space-size=1536"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:5173/api/health -o /dev/null || exit 1

CMD ["node", "server.js"]
