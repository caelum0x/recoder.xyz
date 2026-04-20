# ── Stage 1: Build ──
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl python3 make g++ && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3 /usr/bin/python

RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

COPY recoder-web/package.json ./recoder-web/
COPY shared/package.json ./shared/
COPY packages/ ./packages/
COPY internal-packages/ ./internal-packages/

# Stub unused packages to skip resolution
RUN rm -rf packages/auth && \
    mkdir -p packages/auth && \
    echo '{"name":"@recoder/auth","version":"0.0.0","private":true}' > packages/auth/package.json

# Stub Giselle/Agency packages that use catalog: protocol (not needed by web)
RUN for pkg in action-registry data-store-registry document-preprocessor giselle github-tool http langfuse language-model language-model-registry logger nextjs node-registry protocol pseudo-tiktoken react sdk storage supabase-driver text-editor text-editor-utils trigger-registry utils workspace-utils; do \
      if [ -d "packages/$pkg" ]; then \
        name=$(cat "packages/$pkg/package.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('name','stub-$pkg'))" 2>/dev/null || echo "stub-$pkg"); \
        echo "{\"name\":\"$name\",\"version\":\"0.0.0\",\"private\":true}" > "packages/$pkg/package.json"; \
      fi; \
    done

RUN for dir in production-engine docker-backend recoder-chat app recoder-agents apps/mobile recoder-studio apps/ui.giselles.ai scripts deployment; do \
      mkdir -p "$dir" && echo '{"name":"stub-'$(echo $dir | tr / -)'","version":"0.0.0","private":true}' > "$dir/package.json"; \
    done

# Install all deps (shamefully-hoist puts everything in root node_modules)
RUN echo "shamefully-hoist=true" >> .npmrc && pnpm install --no-frozen-lockfile

# Copy source AFTER install (Docker layer caching)
COPY recoder-web/ ./recoder-web/
COPY shared/ ./shared/

# Build from ROOT so pnpm can resolve @remix-run/dev from root node_modules
ARG VITE_DOCKER_BACKEND_URL=https://docker.recoder.xyz
ARG VITE_MAIN_SITE_URL=https://recoder.xyz
ARG VITE_RUNTIME_MODE=docker
ENV VITE_DOCKER_BACKEND_URL=${VITE_DOCKER_BACKEND_URL}
ENV VITE_MAIN_SITE_URL=${VITE_MAIN_SITE_URL}
ENV VITE_RUNTIME_MODE=${VITE_RUNTIME_MODE}
ENV NODE_OPTIONS="--max-old-space-size=6144"

# Build from root using pnpm --filter (resolves bins from root workspace)
RUN SKIP_ENV_VALIDATION=true pnpm --filter bolt run build

# Fix Vite's polyfill shims — replace browser polyfill imports with real Node.js globals
# Without this, process.env and Buffer are undefined at runtime
RUN find recoder-web/build/server -name '*.js' -exec \
    sed -i \
      -e "s|import process from 'vite-plugin-node-polyfills/shims/process';|const process = globalThis.process;|g" \
      -e "s|import { Buffer as Buffer\$1 } from 'vite-plugin-node-polyfills/shims/buffer';|const Buffer\$1 = globalThis.Buffer;|g" \
      -e "s|import 'vite-plugin-node-polyfills/shims/process';||g" \
      -e "s|import 'vite-plugin-node-polyfills/shims/buffer';||g" \
      {} + 2>/dev/null || true

# ── Post-build cleanup (reduce runtime image size) ──
# Remove starters source (already bundled into starters-bundle.json at build time)
RUN rm -rf recoder-web/starters

# Aggressively prune build-time-only packages from node_modules and .pnpm store.
# Keep vite-plugin-node-polyfills in the runtime image because the Remix server
# bundle can still reference its shim modules after build.
# With shamefully-hoist, top-level entries are symlinks into .pnpm/.
# We remove both the symlinks AND matching .pnpm store entries.
RUN rm -rf node_modules/.cache 2>/dev/null; \
    for pkg in \
      @swc @esbuild esbuild typescript @types vite @remix-run/dev \
      rollup @rollup postcss tailwindcss autoprefixer lightningcss \
      prettier eslint @eslint webpack terser sass less stylus \
      @vitejs vitest @vitest playwright @playwright cypress jest \
      @babel babel-loader babel-plugin-macros @next next \
      turbo @turbo wrangler @cloudflare/workers-types workerd miniflare \
      tsx ts-node source-map-support source-map; \
    do \
      rm -rf "node_modules/$pkg" 2>/dev/null; \
    done; \
    # Remove matching entries from .pnpm virtual store (the actual disk space)
    cd node_modules/.pnpm 2>/dev/null && \
    rm -rf typescript@* @types+* vite@* @vitejs+* rollup@* @rollup+* \
      esbuild@* @esbuild+* @swc+* postcss@* tailwindcss@* autoprefixer@* \
      lightningcss@* prettier@* eslint@* @eslint+* terser@* sass@* \
      less@* stylus@* vitest@* @vitest+* playwright@* @playwright+* \
      cypress@* jest@* @babel+* babel-* @next+* next@* turbo@* @turbo+* \
      wrangler@* workerd@* miniflare@* tsx@* ts-node@* \
      source-map@* source-map-support@* \
      webpack@* \
      2>/dev/null || true

# Remove source maps, TypeScript source files, and docs from remaining node_modules
RUN find node_modules -name '*.map' -delete 2>/dev/null || true && \
    find node_modules -name '*.ts' ! -name '*.d.ts' -delete 2>/dev/null || true && \
    find node_modules \( -name 'CHANGELOG*' -o -name 'HISTORY*' -o -name 'CHANGES*' \) -delete 2>/dev/null || true && \
    find node_modules -name '*.md' ! -name 'LICENSE*' -delete 2>/dev/null || true

# ── Stage 2: Runtime ──
FROM node:20-slim

WORKDIR /app

RUN addgroup --system --gid 1001 webgroup && \
    adduser --system --uid 1001 --ingroup webgroup --home /home/webuser webuser && \
    mkdir -p /home/webuser/.cache/node/corepack && \
    chown -R webuser:webgroup /home/webuser

# Copy production artifacts (shared/ and packages/ are bundled by Vite — not needed at runtime)
COPY --from=builder --chown=webuser:webgroup /app/node_modules ./node_modules
COPY --from=builder --chown=webuser:webgroup /app/recoder-web/node_modules ./recoder-web/node_modules
COPY --from=builder --chown=webuser:webgroup /app/recoder-web/package.json ./recoder-web/package.json
COPY --from=builder --chown=webuser:webgroup /app/recoder-web/server.js ./recoder-web/server.js
COPY --from=builder --chown=webuser:webgroup /app/recoder-web/build ./recoder-web/build

WORKDIR /app/recoder-web

USER webuser

EXPOSE 5173
ENV NODE_OPTIONS="--max-old-space-size=1536"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:5173/api/health').then(r=>process.exit(r.status<400?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
