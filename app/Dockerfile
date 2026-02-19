FROM node:20-slim AS base
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm && corepack prepare pnpm@9.4.0 --activate

# Copy workspace root files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

# Allow postinstall scripts for native modules
RUN echo 'onlyBuiltDependencies[]=esbuild' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=@swc/core' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=@prisma/engines' >> .npmrc && \
    echo 'onlyBuiltDependencies[]=prisma' >> .npmrc

# Copy workspace member package.json files needed for resolution
COPY app/package.json ./app/
COPY app/prisma/ ./app/prisma/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma/ ./packages/database/prisma/
COPY packages/ ./packages/
COPY shared/package.json ./shared/

# Stub out @recoder/auth — its postinstall runs prisma generate which fails
# with Prisma 7.x, and app does not depend on it.
RUN rm -rf packages/auth && \
    mkdir -p packages/auth && \
    echo '{"name":"@recoder/auth","version":"0.0.0","private":true}' > packages/auth/package.json

# Create stubs for workspace members we don't need
RUN for dir in production-engine docker-backend recoder-web recoder-chat recoder-frontend apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done && \
    mkdir -p internal-packages/stub && echo '{"name":"stub-internal","version":"0.0.0","private":true}' > internal-packages/stub/package.json

# Install dependencies
RUN pnpm install --filter ./app... --no-frozen-lockfile

# Generate Prisma client using the app's own schema (Prisma 6.x compatible)
WORKDIR /app/app
RUN pnpm exec prisma generate

# Copy source code
COPY app/ ./app/
COPY packages/database/ ./packages/database/
COPY shared/ ./shared/

# Build the Next.js app (provide dummy DATABASE_URL for page data collection phase)
WORKDIR /app/app
RUN SKIP_ENV_VALIDATION=true DATABASE_URL="postgresql://build:build@localhost:5432/build" NODE_OPTIONS=--max_old_space_size=4096 pnpm run build

# Production stage
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=base /app/app/public ./public
COPY --from=base --chown=nextjs:nodejs /app/app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/app/.next/static ./app/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "app/server.js"]
