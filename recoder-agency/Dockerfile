FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.16.0 --activate
WORKDIR /app

# ── Install dependencies ────────────────────────────────────
FROM base AS deps
COPY recoder-agency/pnpm-lock.yaml recoder-agency/pnpm-workspace.yaml recoder-agency/package.json ./
COPY recoder-agency/apps/agency/package.json apps/agency/package.json
# Copy all workspace package.json files for pnpm install
COPY recoder-agency/packages/ packages/
COPY recoder-agency/internal-packages/ internal-packages/
COPY recoder-agency/tools/ tools/
# Copy shared package (referenced as file:../../../shared from apps/agency)
COPY shared/ /shared/
RUN pnpm install --no-frozen-lockfile

# ── Build SDK packages ──────────────────────────────────────
FROM base AS sdk-builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /shared /shared
COPY recoder-agency/ .
RUN pnpm build-sdk

# ── Build the agency app ────────────────────────────────────
FROM base AS builder
COPY --from=sdk-builder /app ./
COPY --from=sdk-builder /shared /shared
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# BUILD-TIME ONLY: These placeholders satisfy Next.js static analysis during build.
# They are NOT used at runtime — real values come from container env vars.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
RUN pnpm -F agency build

# ── Production runner ───────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3007
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/agency/.next/standalone ./
COPY --from=builder /app/apps/agency/.next/static ./apps/agency/.next/static
COPY --from=builder /app/apps/agency/public ./apps/agency/public

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3007/api/health || exit 1

USER nextjs
EXPOSE 3007

CMD ["node", "apps/agency/server.js"]
