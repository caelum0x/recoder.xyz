FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.16.0 --activate
WORKDIR /app

# ── Build ─────────────────────────────────────────────────
FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build-sdk

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# BUILD-TIME ONLY: placeholders satisfy Next.js static analysis during build.
# Real values come from container env vars at runtime.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
RUN pnpm -F recoder-studio build

# ── Production runner ─────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/recoder-studio/.next/standalone ./
COPY --from=builder /app/recoder-studio/.next/static ./recoder-studio/.next/static
COPY --from=builder /app/recoder-studio/public ./recoder-studio/public

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3005/api/health || exit 1

USER nextjs
EXPOSE 3005

CMD ["node", "recoder-studio/server.js"]
