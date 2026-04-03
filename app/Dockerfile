FROM node:20-slim AS base
RUN apt-get update && apt-get install -y curl python3 make g++ && rm -rf /var/lib/apt/lists/*
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

# Install dependencies
RUN AUTH_DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm install --filter ./app... --no-frozen-lockfile

# Generate Prisma client using the app's own schema (Prisma 6.x compatible)
WORKDIR /app/app
RUN pnpm exec prisma generate

# Copy source code into the workspace root paths (not nested under /app/app)
WORKDIR /app
COPY app/ ./app/
COPY packages/database/ ./packages/database/
COPY shared/ ./shared/

# Build the Next.js app (provide dummy DATABASE_URL for page data collection phase)
WORKDIR /app/app
ARG BUILD_NODE_MAX_OLD_SPACE=3072

# NEXT_PUBLIC_* vars must be declared as ARGs so Next.js can inline them at build time
ARG NEXT_PUBLIC_APP_URL=https://recoder.xyz
ARG NEXT_PUBLIC_RECODER_WEB_URL=https://web.recoder.xyz
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_RECODER_WEB_URL=${NEXT_PUBLIC_RECODER_WEB_URL}

RUN SKIP_ENV_VALIDATION=true DATABASE_URL="postgresql://build:build@localhost:5432/build" NODE_OPTIONS=--max_old_space_size=${BUILD_NODE_MAX_OLD_SPACE} pnpm run build

# Production stage
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=base /app/app/public ./public
COPY --from=base --chown=nextjs:nodejs /app/app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/app/.next/static ./.next/static
COPY --from=base --chown=nextjs:nodejs /app/app/.next/static ./app/.next/static
# @recoder/auth uses a separately generated Prisma client with a custom output
# path. Next standalone does not copy it automatically, so make it available
# where Prisma looks at runtime: /app/prisma/auth-client.
COPY --from=base --chown=nextjs:nodejs /app/packages/auth/prisma/auth-client ./prisma/auth-client
# Next standalone output keeps pnpm symlinks pointing to /node_modules/.pnpm.
# Copy the virtual store so those symlinks resolve at runtime.
COPY --from=base --chown=nextjs:nodejs /app/node_modules/.pnpm /node_modules/.pnpm

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV NODE_OPTIONS="--max-old-space-size=2048"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:3000/api/health -o /dev/null || exit 1

CMD ["node", "server.js"]
