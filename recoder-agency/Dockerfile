FROM node:24-alpine@sha256:26eb49fbfdf03bf69f728b73178fa6f9e7c2cef88b06561b65497f5ae8e50a3d AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.16.0 --activate
WORKDIR /app

# ── Install dependencies ────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/agency/package.json apps/agency/package.json
# Copy all workspace package.json files for pnpm install
COPY packages/ packages/
COPY internal-packages/ internal-packages/
COPY tools/ tools/
RUN pnpm install --frozen-lockfile

# ── Build SDK packages ──────────────────────────────────────
FROM base AS sdk-builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build-sdk

# ── Build the agency app ────────────────────────────────────
FROM base AS builder
COPY --from=sdk-builder /app ./
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
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/agency/.next/standalone ./
COPY --from=builder /app/apps/agency/.next/static ./apps/agency/.next/static
COPY --from=builder /app/apps/agency/public ./apps/agency/public

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

USER nextjs
EXPOSE 3000

CMD ["node", "apps/agency/server.js"]
