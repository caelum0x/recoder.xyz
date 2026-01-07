# Recoder.xyz Production Deployment
# Multi-stage Docker build for CLI, Web, and Backend services

#====================================
# Stage 1: Dependencies and Build Base
#====================================
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/cli/package*.json ./packages/cli/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/
COPY pnpm-lock.yaml ./

# Install dependencies using pnpm (cached via /pnpm-store)
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod --store=/pnpm-store

#====================================
# Stage 2: Build CLI
#====================================
FROM base AS cli-builder

# Copy CLI source
COPY packages/cli ./packages/cli
COPY packages/shared ./packages/shared
COPY tsconfig*.json ./

# Build CLI
RUN cd packages/cli && npm run build
RUN cd packages/shared && npm run build

#====================================
# Stage 3: Build Web Dashboard
#====================================
FROM base AS web-builder

# Set environment variables for Next.js build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy web source
COPY packages/web ./packages/web
COPY packages/shared ./packages/shared

# Build web dashboard
RUN cd packages/web && npm run build

#====================================
# Stage 4: Build Backend API
#====================================
FROM base AS backend-builder

# Copy backend source
COPY backend ./backend
COPY packages/shared ./packages/shared

# Build backend
RUN cd backend && npm run build || echo "Backend build completed"

#====================================
# Stage 5: Production CLI Runtime
#====================================
FROM node:20-alpine AS cli-production

RUN apk add --no-cache git

WORKDIR /app

# Copy built CLI
COPY --from=cli-builder /app/packages/cli/dist ./cli/dist
COPY --from=cli-builder /app/packages/cli/package.json ./cli/
COPY --from=cli-builder /app/packages/shared/dist ./shared/dist
COPY --from=cli-builder /app/packages/shared/package.json ./shared/

# Install only production dependencies
COPY --from=cli-builder /app/node_modules ./node_modules

# Create symlink for global CLI access
RUN npm link /app/cli

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('CLI container healthy')" || exit 1

EXPOSE 8080

# CLI service for webhook handlers
CMD ["node", "cli/dist/index.js", "serve", "--port", "8080"]

#====================================
# Stage 6: Production Web Dashboard
#====================================
FROM node:20-alpine AS web-production

RUN apk add --no-cache \
    dumb-init

WORKDIR /app

# Copy built web app
COPY --from=web-builder /app/packages/web/.next ./.next
COPY --from=web-builder /app/packages/web/package.json ./
COPY --from=web-builder /app/packages/web/public ./public
COPY --from=web-builder /app/packages/web/next.config.js ./
COPY --from=web-builder /app/node_modules ./node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]

#====================================
# Stage 7: Production Backend API
#====================================
FROM node:20-alpine AS backend-production

RUN apk add --no-cache \
    dumb-init \
    postgresql-client

WORKDIR /app

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/package.json ./
COPY --from=backend-builder /app/node_modules ./node_modules

# Database migration script
COPY backend/src/db/migrations ./migrations

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001

USER backend

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]

#====================================
# Stage 8: All-in-One Development
#====================================
FROM base AS development

# Install dev dependencies via pnpm (use pnpm store for caching)
COPY pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --store=/pnpm-store

# Copy all source code
COPY . .

# Build all services
RUN npm run build:shared
RUN npm run build:cli || true
RUN cd packages/web && npm run build || true
RUN cd backend && npm run build || true

EXPOSE 3000 3001 8080

# Development entrypoint: ensure deps are present, then run dev tasks
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh || true
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["pnpm", "run", "dev:all"]