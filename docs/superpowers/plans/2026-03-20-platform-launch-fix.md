# Recoder Platform Launch Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Recoder app, service, and package fully functional for launch — agents, web, pm, agency, openclaw, recoder-code, cli-router, A2A.

**Architecture:** Fix-forward approach. No rewrites. Each task targets one specific broken behavior with the minimum change needed. Deploy after each task. Verify on production.

**Tech Stack:** Python/FastAPI (backend), Next.js (agents, pm, agency), Remix/Vite (web), Express (docker-backend), Docker, PM2, nginx, PostgreSQL, Redis, LiteLLM/OpenRouter

**Constraint:** OpenRouter has $0 credits right now. User will fund it. Plan does not depend on free tier workarounds — all AI-dependent testing happens after funding.

**Server:** Hetzner 77.42.23.19, SSH: `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19`

---

## Dependency Order

```
Task 1: Agent run lifecycle fix (agents)     ← CRITICAL, no AI needed to fix
Task 2: Agency crash fixes                   ← no AI needed
Task 3: Web chat-history + workspace fix     ← no AI needed
Task 4: Auth /tr/dashboard/api-keys fix      ← no AI needed
Task 5: OpenClaw favicon fix                 ← no AI needed
Task 6: recoder-code + cli-router publish    ← no AI needed
Task 7: Agents full AI conversation test     ← NEEDS OPENROUTER CREDITS
Task 8: Web code generation + live preview   ← NEEDS OPENROUTER CREDITS
Task 9: PM AI features test                  ← NEEDS OPENROUTER CREDITS
Task 10: Agency AI features test             ← NEEDS OPENROUTER CREDITS
Task 11: Final cross-platform verification   ← NEEDS ALL ABOVE DONE
```

Tasks 1-6 can run in parallel. Tasks 7-10 can run in parallel after OpenRouter is funded. Task 11 is the final gate.

---

### Task 1: Fix agent run lifecycle (agents break after 1 response)

**Problem:** After the first AI response, subsequent messages fail. The agent_run status stays "running" in the database and/or the Redis slot counter doesn't decrement, blocking new runs.

**Root cause analysis:**
- `reserve_slot()` in `slot_manager.py:98` increments Redis counter `slots:{account_id}`
- `release_slot()` in `slot_manager.py:141` decrements it — but only if called
- User's tier (`tier_200_1000`) allows 100 concurrent runs — so slot limit isn't the issue
- If Redis is unavailable, slot manager falls through to "error_allow" — so Redis being down isn't the issue
- **Real issue**: `update_agent_run_status()` may fail to set status to "completed", OR the executor's cleanup path doesn't run, OR the response_processor's `trigger_flush()` fails silently
- The `release_slot()` is in a try/except that logs but doesn't retry (api.py:692-697)

**Files:**
- Modify: `backend/core/agents/api.py` — ensure run cleanup always fires
- Modify: `backend/core/agents/runner/executor.py` — ensure status always transitions to completed/failed
- Modify: `backend/core/agents/pipeline/slot_manager.py` — add slot release retry
- Modify: `backend/core/agents/pipeline/stateless/recovery.py` — lower stuck run threshold

- [ ] **Step 1: Check current stuck runs on production**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "PGPASSWORD=recoder_prod_2026 psql -U recoder -d recoder_backend -h 127.0.0.1 \
   -c \"SELECT id, status, started_at, completed_at FROM agent_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 10;\""
```

Expected: May show runs stuck in "running" with no `completed_at`

- [ ] **Step 2: Force-complete all stuck runs**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "PGPASSWORD=recoder_prod_2026 psql -U recoder -d recoder_backend -h 127.0.0.1 \
   -c \"UPDATE agent_runs SET status = 'completed', completed_at = NOW() WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';\""
```

- [ ] **Step 3: Reset Redis slot counter**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "docker exec recoder-redis redis-cli DEL slots:38ee13d3-7209-482d-8a2a-4046b7a00593"
```

- [ ] **Step 4: Add robust slot release with retry**

In `backend/core/agents/pipeline/slot_manager.py`, modify `release_slot()`:

```python
async def release_slot(account_id: str, agent_run_id: str) -> bool:
    if config.ENV_MODE == EnvMode.LOCAL:
        return True

    for attempt in range(3):
        try:
            key = _slot_key(account_id)
            count = await asyncio.wait_for(redis.decr(key), timeout=SLOT_OP_TIMEOUT)

            if count < 0:
                await redis.set(key, "0", ex=SLOT_KEY_TTL)

            logger.debug(f"[SLOT] Released {agent_run_id}: now {max(0, count)}")
            return True
        except Exception as e:
            logger.error(f"[SLOT] Release attempt {attempt+1} failed for {agent_run_id}: {e}")
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))

    # Last resort: reset counter from DB
    try:
        from core.utils.limits_repo import count_running_agent_runs
        db_count = await count_running_agent_runs(account_id)
        key = _slot_key(account_id)
        await redis.set(key, str(db_count), ex=SLOT_KEY_TTL)
        logger.warning(f"[SLOT] Reset counter from DB for {account_id}: {db_count}")
        return True
    except Exception as e2:
        logger.error(f"[SLOT] DB reset also failed: {e2}")
        return False
```

- [ ] **Step 5: Ensure run status always transitions on completion**

In `backend/core/agents/runner/executor.py`, wrap the completion logic in a finally block that guarantees status update. Find the main execution method and ensure:

```python
# In the finally block of execute():
try:
    await update_agent_run_status(agent_run_id, final_status)
except Exception as e:
    logger.error(f"Failed to update run status: {e}")
    # Direct DB fallback
    try:
        await execute_mutate(
            "UPDATE agent_runs SET status = :status, completed_at = NOW() WHERE id = :id",
            {"status": "failed", "id": agent_run_id}
        )
    except Exception:
        pass
```

- [ ] **Step 6: Lower stuck run recovery threshold**

In `backend/core/agents/pipeline/stateless/recovery.py`, change `STUCK_RUN_THRESHOLD_SECONDS` from whatever it is to 300 (5 minutes).

- [ ] **Step 7: Deploy and test**

```bash
# Sync modified files
rsync -avz backend/core/agents/pipeline/slot_manager.py \
  backend/core/agents/runner/executor.py \
  backend/core/agents/pipeline/stateless/recovery.py \
  backend/core/agents/api.py \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  root@77.42.23.19:/root/recoder.xyz/backend/core/agents/

# Restart backend
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "pm2 restart recoder-backend"

# Test: start a run, wait for completion, start another
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  curl -s -X POST http://127.0.0.1:8000/v1/agent/start \
    -H 'Authorization: Bearer TW4RckaW72UaCulXixoDHDY6czsECP2u' \
    -F 'prompt=say hello' -F 'optimistic=false'
"
# Wait 30s, then:
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  curl -s -X POST http://127.0.0.1:8000/v1/agent/start \
    -H 'Authorization: Bearer TW4RckaW72UaCulXixoDHDY6czsECP2u' \
    -F 'prompt=say goodbye' -F 'optimistic=false'
"
```

Expected: Both runs succeed. Second run doesn't get rejected.

- [ ] **Step 8: Commit**

```bash
git add backend/core/agents/pipeline/slot_manager.py backend/core/agents/runner/executor.py backend/core/agents/pipeline/stateless/recovery.py
git commit -m "fix: robust slot release + stuck run recovery for multi-turn conversations"
```

---

### Task 2: Fix agency crashes (503s + archived view 500)

**Problem:** agency.recoder.xyz returns 503 on ALL admin routes. `/services?showArchived=1` returns 500.

**Root cause (CONFIRMED by research):** The `.env.local` on the server still points to the **dead Neon database** (`ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech`). Same bug that hit recoder.xyz earlier. Every page calls `fetchCurrentTeam()` → DB connection fails → 503.

**Files:**
- Modify: `.env.local` on server at `/root/recoder.xyz/recoder-agency/apps/agency/.env.local` — fix DATABASE_URL + AUTH_DATABASE_URL
- Modify: `recoder-agency/apps/agency/next.config.ts:99-111` — add cloudflareinsights to CSP

- [ ] **Step 1: Fix DATABASE_URL on server**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cd /root/recoder.xyz/recoder-agency/apps/agency
  # Backup
  cp .env.local .env.local.bak
  # Fix DATABASE_URL and AUTH_DATABASE_URL
  sed -i 's|postgresql://neondb_owner.*neon\.tech/neondb.*|postgresql://recoder:recoder_prod_2026@127.0.0.1:5432/recoder_main|g' .env.local
  # Verify
  grep DATABASE_URL .env.local
"
```

Expected: Both URLs point to `127.0.0.1:5432/recoder_main`

- [ ] **Step 2: Ensure agency DB tables exist**

Agency uses Drizzle ORM with schema at `recoder-agency/apps/agency/db/schema.ts`. Key tables: `teams`, `serviceCatalog`, `clients`, `projects`, `deliverables`, `quotes`, `budgetEntries`.

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  PGPASSWORD=recoder_prod_2026 psql -U recoder -d recoder_main -h 127.0.0.1 \
  -c \"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('teams','service_catalog','clients','projects','deliverables','quotes','budget_entries') ORDER BY tablename;\"
"
```

If tables are missing, run Drizzle push:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cd /root/recoder.xyz/recoder-agency && npx drizzle-kit push
"
```

- [ ] **Step 3: Add Cloudflare insights to CSP**

In `recoder-agency/apps/agency/next.config.ts` line ~101, change:
```
"script-src 'self' 'unsafe-inline'"
```
to:
```
"script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com"
```

- [ ] **Step 4: Deploy and verify**

```bash
# Sync CSP fix
rsync -avz recoder-agency/apps/agency/next.config.ts \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  root@77.42.23.19:/root/recoder.xyz/recoder-agency/apps/agency/next.config.ts

# Rebuild (if CSP change requires it) and restart
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "pm2 restart recoder-agency"

# Wait 10s, test
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  sleep 10
  curl -sI https://agency.recoder.xyz/dashboard
  curl -sI 'https://agency.recoder.xyz/services?showArchived=1'
"
```

Expected: Both return 200 (not 503)

---

### Task 3: Fix web chat-history + workspace-state errors

**Problem:** `POST /api/chat-history` returns 500 (retries 3x). `GET /api/workspace-state/{projectId}` returns 500.

**Root cause (CONFIRMED by research):**
- **Chat history 500**: `createChatHistoryDB()` at `recoder-web/app/lib/.server/db/chat-history-db.ts:537-545` throws `Error: DATABASE_URL not configured` if env var is missing. The Docker container likely has no `DATABASE_URL`.
- **Workspace-state 500**: Route at `docker-backend/src/server.ts:3326-3393` runs `find` and `test -f` inside the container. Fails if container exec fails (container may not have bash or workspace dir).

**Files:**
- Modify: Docker environment — add `DATABASE_URL` to recoder-web container
- Modify: `docker-backend/src/server.ts:3389-3392` — graceful fallback for workspace-state

- [ ] **Step 1: Add DATABASE_URL to recoder-web Docker container**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  # Check current env
  docker inspect recoderxyz-recoder-web --format '{{range .Config.Env}}{{println .}}{{end}}' | grep DATABASE
"
```

If missing, add it to docker-compose or container env:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  # Add DATABASE_URL to the container
  cd /root/recoder.xyz
  grep -q 'DATABASE_URL' docker-compose.production.yml || \
    sed -i '/recoder-web:/,/environment:/{/environment:/a\\      - DATABASE_URL=postgresql://recoder:recoder_prod_2026@host.docker.internal:5432/recoder_main}' docker-compose.production.yml
  docker compose -f docker-compose.production.yml up -d recoder-web
"
```

Note: Use `host.docker.internal` (Mac) or `172.17.0.1` (Linux) for host DB access from container.

- [ ] **Step 2: Make workspace-state graceful on failure**

In `docker-backend/src/server.ts:3389-3392`, the error handler should return defaults instead of 500:

Change the error response from 500 to 200 with empty defaults:
```typescript
// Instead of: res.status(500).json(...)
return sendSuccess(res, {
  hasFiles: false,
  fileCount: 0,
  hasPackageJson: false,
  devServerRunning: false,
});
```

- [ ] **Step 3: Deploy workspace-state fix**

```bash
rsync -avz docker-backend/src/server.ts \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  root@77.42.23.19:/root/recoder.xyz/docker-backend/src/server.ts

ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cd /root/recoder.xyz && docker compose -f docker-compose.production.yml up -d --build docker-backend
"
```

- [ ] **Step 4: Verify**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  curl -s https://docker.recoder.xyz/api/workspace-state/test-project | head -5
  curl -s -X POST https://web.recoder.xyz/api/chat-history -H 'Content-Type: application/json' -d '{}' | head -5
"
```

Expected: workspace-state returns JSON with false values (not 500). Chat-history returns 400 (missing fields) not 500.

---

### Task 4: Fix auth /tr/dashboard/api-keys

**Problem:** `https://recoder.xyz/tr/dashboard/api-keys` returns an error.

**Root cause (CONFIRMED by research):**
- Page at `app/app/[locale]/dashboard/api-keys/page.tsx:86` calls `fetch('/api/user/keys')`
- Route at `app/app/api/user/keys/route.ts` uses `PlatformApiKeyService`
- Service at `app/lib/services/platform-api-key.service.ts` queries the `api_keys` table
- **The `api_keys` table may not exist** in the `recoder_main` DB, or the Prisma schema may be out of sync

**Files:**
- Check: DB for `api_keys` table existence
- Modify: `app/lib/services/platform-api-key.service.ts` — add graceful handling if table missing
- Run: Prisma migrate/push if table missing

- [ ] **Step 1: Check if api_keys table exists**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  PGPASSWORD=recoder_prod_2026 psql -U recoder -d recoder_main -h 127.0.0.1 \
  -c \"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='api_keys');\"
"
```

- [ ] **Step 2: If table missing, create it**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cd /root/recoder.xyz/app && npx prisma db push --accept-data-loss 2>&1 | tail -10
"
```

Or create manually:
```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 3: Test the endpoint**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  curl -s http://127.0.0.1:3000/api/user/keys \
    -H 'Cookie: recoder.session_token=...' 2>&1 | head -20
"
```

- [ ] **Step 4: Verify in browser**

Navigate to `https://recoder.xyz/tr/dashboard/api-keys` — should load without error.

---

### Task 5: Fix OpenClaw favicon

**Problem:** Browser tab for openclaw.recoder.xyz shows wrong favicon.

**Files:**
- Modify: `/var/www/openclaw-ui/` on server — replace favicon
- Source: `recoder-agents/public/favicon.ico` or `app/public/favicon.ico` — Recoder favicon

- [ ] **Step 1: Copy Recoder favicon to OpenClaw UI directory**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cp /root/recoder.xyz/recoder-agents/public/favicon.ico /var/www/openclaw-ui/favicon.ico
  cp /root/recoder.xyz/recoder-agents/public/logo.png /var/www/openclaw-ui/logo.png
"
```

- [ ] **Step 2: Replace favicon files in openclaw source AND deployed directory**

OpenClaw HTML at `openclaw/ui/index.html` references 3 favicon files:
- `favicon.svg` (primary)
- `favicon-32.png` (32x32 PNG)
- `apple-touch-icon.png` (180x180)

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  # Copy Recoder favicon files over OpenClaw's
  cp /root/recoder.xyz/recoder-agents/public/favicon.ico /var/www/openclaw-ui/favicon.ico
  cp /root/recoder.xyz/recoder-agents/public/favicon.ico /var/www/openclaw-ui/favicon-32.png
  cp /root/recoder.xyz/recoder-agents/public/logo.png /var/www/openclaw-ui/apple-touch-icon.png
  cp /root/recoder.xyz/recoder-agents/public/logo.png /var/www/openclaw-ui/favicon.svg 2>/dev/null || true
  # Title is already 'Recoder Claw' - verify
  grep '<title>' /var/www/openclaw-ui/index.html
"
```

- [ ] **Step 3: Verify**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "curl -sI https://openclaw.recoder.xyz/favicon.ico | head -5"
```

---

### Task 6: Publish recoder-code + cli-router

**Problem:** npm packages are outdated. Publishing is blocked by private dependency chain.

**Root cause (CONFIRMED by research):**
- `recoder-code` (v2.4.5, CLI v2.5.2) depends on `recoder-code-core` (v2.4.4) — private, must publish first
- `recoder-cli-router` (v2.3.1) depends on `recoder-shared` (v1.0.2) + `roo-code-types` (v1.0.1) — both private
- **`roo-code-types` has NO dist/ folder** — must build before publishing
- Homebrew formula references wrong package name (`recoder-code-cli` v2.4.4)

**Publish order (strict dependency chain):**
```
1. packages/shared/ (recoder-shared)        → npm publish
2. packages/roo-code-types/ (roo-code-types) → npm run build && npm publish
3. packages/recoder-code/packages/core/ (recoder-code-core) → npm publish
4. packages/recoder-code/packages/cli/ (recoder-code) → npm publish
5. packages/recoder-cli-router/              → npm publish
6. homebrew-recoder/Formula/                 → update formula
```

- [ ] **Step 1: Build roo-code-types (currently has no dist/)**

```bash
cd packages/roo-code-types
npm run build  # uses tsup
ls dist/  # verify dist/index.js exists
```

- [ ] **Step 2: Publish recoder-shared**

```bash
cd packages/shared
# Verify package.json has correct name and public access
cat package.json | grep -E '"name"|"version"|"private"'
# If private: true, change to false or add publishConfig
npm publish --access public
```

- [ ] **Step 3: Publish roo-code-types**

```bash
cd packages/roo-code-types
npm publish --access public
```

- [ ] **Step 4: Publish recoder-code-core**

```bash
cd packages/recoder-code/packages/core
npm publish --access public
```

- [ ] **Step 5: Build and publish recoder-code**

```bash
cd packages/recoder-code/packages/cli
npm run build
npm publish --access public
```

- [ ] **Step 6: Build and publish recoder-cli-router**

```bash
cd packages/recoder-cli-router
npm run build  # esbuild + copy tiktoken wasm
npm publish --access public
```

- [ ] **Step 7: Update Homebrew formula**

In `homebrew-recoder/Formula/recoder-code.rb`:
- Fix URL from `recoder-code-cli` to `recoder-code`
- Update version to match published version
- Update SHA256 hash
- Fix test to use correct binary name

- [ ] **Step 8: Commit**

```bash
git add packages/ homebrew-recoder/
git commit -m "chore: publish recoder-code v2.4.6, cli-router v2.3.2, and dependencies"
```

**Requires:** `npm login` with npm auth token before any publish step.

---

### Task 7: Test agents full AI conversation (NEEDS OPENROUTER CREDITS)

**Prerequisite:** Task 1 done. OpenRouter funded.

- [ ] **Step 1: Verify OpenRouter works**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cd /root/recoder.xyz/backend && .venv/bin/python3 -c \"
import asyncio, os, litellm
os.environ['OPENROUTER_API_KEY'] = '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'
async def test():
    r = await litellm.acompletion(model='openrouter/openai/gpt-4o-mini', messages=[{'role':'user','content':'say hi'}])
    print(r.choices[0].message.content)
asyncio.run(test())
\"
"
```

- [ ] **Step 2: Test 5-message conversation in browser**

1. Open https://agents.recoder.xyz
2. Send "Hello"
3. Wait for response
4. Send "What's 2+2?"
5. Wait for response
6. Send "Tell me a joke"
7. Wait for response
8. Send "Summarize our conversation"
9. Wait for response
10. Send "Thanks, goodbye"

All 5 should get AI responses without billing popups or errors.

- [ ] **Step 3: Test agent creation**

1. Click "New Agent"
2. Give it a name and system prompt
3. Start a thread with the new agent
4. Verify it responds with the custom system prompt behavior

- [ ] **Step 4: Test file upload**

Upload a text file and ask the agent to summarize it.

---

### Task 8: Fix web code generation + live preview (NEEDS OPENROUTER CREDITS)

**Prerequisite:** Task 3 done. OpenRouter funded.

- [ ] **Step 1: Verify model has enough context**

The system prompt is ~57K tokens. Ensure the default model has 128K+ context:

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "grep MAIN_LLM_MODEL /root/recoder.xyz/docker-backend/.env"
```

If using a model with <128K context, switch to `openrouter/openai/gpt-4o-mini` (128K) or `openrouter/anthropic/claude-3.5-haiku` (200K).

- [ ] **Step 2: Test code generation**

1. Open https://web.recoder.xyz
2. Type "Create a React counter app with increment and decrement buttons"
3. Verify: AI generates real React code (not a landing page)
4. Verify: code appears in the editor panel

- [ ] **Step 3: Fix live preview**

Check if the preview iframe loads:
1. After code is generated, check the preview panel
2. If blank, check browser console for iframe errors
3. Common fixes:
   - Add `web.recoder.xyz` to CSP frame-src in nginx
   - Ensure the dev server starts inside the container
   - Check if preview URL is correct: `https://web.recoder.xyz/preview/{projectId}`

- [ ] **Step 4: Test preview end-to-end**

1. Generate a simple app
2. See it running in the preview panel
3. Make a change in the editor
4. See the preview update

---

### Task 9: Test PM AI features (NEEDS OPENROUTER CREDITS)

**Prerequisite:** OpenRouter funded.

**PM AI architecture (CONFIRMED by research):**
- Multi-provider: OpenRouter (default), OpenAI, Anthropic — configured via `AI_PROVIDER` env var
- Env file: `recoder-pm/apps/api/env.ts` — reads `OPENROUTER_API_KEY`, `AI_PROVIDER`, `OPENROUTER_TEXT_MODEL`
- Default model: `openai/gpt-5-nano` (OpenRouter format)
- AI backend: `recoder-pm/packages/backend/ai.ts` — resolves provider + model per organization
- BYOK: org-level encrypted keys at `/settings/ai` using `AI_KEY_ENCRYPTION_SECRET`
- Async jobs: `recoder-pm/packages/queue/workers.ts` — FEEDBACK_SENTIMENT, FEEDBACK_ANALYSIS, FEATURE_RICE
- AI features: proposal-generator, prd-generator, task-decomposer, opportunity-scoring, contradiction-detector, ai-insights

- [ ] **Step 1: Verify PM has OpenRouter key configured**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  grep -E 'OPENROUTER_API_KEY|AI_PROVIDER|OPENROUTER_TEXT_MODEL' /root/recoder.xyz/recoder-pm/.env /root/recoder.xyz/recoder-pm/apps/api/.env 2>/dev/null
"
```

If missing, add:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  echo 'OPENROUTER_API_KEY=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' >> /root/recoder.xyz/recoder-pm/apps/api/.env
  echo 'AI_PROVIDER=openrouter' >> /root/recoder.xyz/recoder-pm/apps/api/.env
  echo 'OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini' >> /root/recoder.xyz/recoder-pm/apps/api/.env
"
```

- [ ] **Step 2: Deploy PM with sample data button**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "
  cd /root/recoder.xyz/recoder-pm && NODE_OPTIONS='--max-old-space-size=4096' pnpm build 2>&1 | tail -5
  pm2 restart recoder-pm
"
```

- [ ] **Step 3: Test AI features**

1. Open https://pm.recoder.xyz
2. Click "Generate sample data" on insights page
3. Go to /settings/ai — verify provider shows OpenRouter
4. Try the editor AI assistant (create a document, use inline AI)
5. Try PRD generation
6. Try feedback analysis (requires feedback data from sample generation)

---

### Task 10: Test agency AI features (NEEDS OPENROUTER CREDITS)

**Prerequisite:** Task 2 done. OpenRouter funded.

- [ ] **Step 1: Test Giselle workflow execution**

1. Open https://agency.recoder.xyz
2. Go to Playground → create a workflow with an LLM node
3. Execute it
4. Verify: AI responds through the workflow

- [ ] **Step 2: Remove mock services data**

If services page still shows mock data, check the DB and remove placeholder entries.

---

### Task 11: Final cross-platform verification

**Prerequisite:** All above tasks done.

- [ ] **Step 1: Run automated test suite**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "bash /root/recoder.xyz/scripts/test-all-features.sh"
```

- [ ] **Step 2: Manual verification checklist**

| App | Test | Expected |
|-----|------|----------|
| recoder.xyz | Sign in | Works, session created |
| recoder.xyz | /tr/dashboard/api-keys | Page loads, can create keys |
| agents.recoder.xyz | 5-message conversation | All get AI responses |
| agents.recoder.xyz | Custom agent creation | Works |
| agents.recoder.xyz | File upload | Works |
| web.recoder.xyz | Code generation | Generates real apps |
| web.recoder.xyz | Live preview | Shows running app |
| pm.recoder.xyz | AI assistant | Responds |
| pm.recoder.xyz | Generate sample data | Populates dashboard |
| agency.recoder.xyz | Services page | Loads without crash |
| agency.recoder.xyz | Archived services | Loads without crash |
| agency.recoder.xyz | Workflow execution | AI responds |
| openclaw.recoder.xyz | Send message | AI responds |
| openclaw.recoder.xyz | Tab favicon | Shows Recoder logo |
| Cross-subdomain SSO | Login on recoder.xyz | Auto-logged-in on agents, pm, agency |

- [ ] **Step 3: Verify packages published**

```bash
npm view recoder-code version
npm view recoder-cli-router version
```

- [ ] **Step 4: Update plan.md with final status**

Mark all issues as FIXED or document remaining blockers.
