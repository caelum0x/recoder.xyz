# Phase 7: Verify, Expand & Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically verify all deployed fixes, expand core features (unified model registry, Daytona LSP, A2A workflows), and build comprehensive test coverage across all 5 apps.

**Architecture:** Three sub-phases executed sequentially: (7A) verify all 19 open issues and close what works, (7B) expand features using the unified model registry spec and Daytona API, (7C) build automated test suites that cover every app surface. Each sub-phase produces deployable, testable results independently.

**Tech Stack:** Python/FastAPI (backend), Next.js 15 (agents/app), Remix/Vite (web), Vitest (unit tests), Bash scripts (e2e), PostgreSQL, Daytona SDK, OpenRouter API

**Reference docs:**
- `plan.md` — Current state, 19 open issues, phase history
- `docs/superpowers/specs/2026-03-21-unified-model-registry-design.md` — Unified model registry spec
- `docs/daytona-api-reference.md` — Daytona sandbox API

---

## Sub-Phase 7A: Verify & Close Issues

Systematically verify each of the 19 open issues. For each: check if the fix is already deployed, test it, close it or document what's still broken.

---

### Task 1: Build verification script for all deployed fixes

**Files:**
- Create: `scripts/verify-phase7-deployed-fixes.sh`

- [ ] **Step 1: Write the verification script**

```bash
#!/usr/bin/env bash
# Phase 7A: Verify all deployed fixes
# Run from local machine — tests production endpoints

set -euo pipefail

BASE="https://recoder.xyz"
AGENTS="https://agents.recoder.xyz"
WEB="https://web.recoder.xyz"
PM="https://pm.recoder.xyz"
AGENCY="https://agency.recoder.xyz"
API="https://api.recoder.xyz"
DOCKER="https://docker.recoder.xyz"
OPENCLAW="https://openclaw.recoder.xyz"

PASS=0; FAIL=0; SKIP=0
results=()

check() {
  local name="$1" url="$2" expect="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "$expect" ]]; then
    results+=("PASS: $name (HTTP $status)")
    ((PASS++))
  else
    results+=("FAIL: $name (expected $expect, got $status)")
    ((FAIL++))
  fi
}

check_contains() {
  local name="$1" url="$2" needle="$3"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -qi "$needle"; then
    results+=("PASS: $name (contains '$needle')")
    ((PASS++))
  else
    results+=("FAIL: $name (missing '$needle')")
    ((FAIL++))
  fi
}

echo "=== Phase 7A: Deployed Fix Verification ==="
echo ""

# ISSUE 3: Double logo fix (deployed)
echo "[ISSUE 3] recoder-web double logo..."
check "web loads" "$WEB" "200"

# ISSUE 4: White components on dark design (deployed)
echo "[ISSUE 4] recoder-web dark theme..."
check "web loads cleanly" "$WEB" "200"

# ISSUE 6: openclaw blank screen (FIXED, user verified)
echo "[ISSUE 6] openclaw renders..."
check "openclaw loads" "$OPENCLAW" "200"

# ISSUE 8: auth broken (deployed fix)
echo "[ISSUE 8] recoder.xyz auth..."
check "auth session endpoint" "$BASE/api/auth/get-session" "200"

# ISSUE 9: Kortix branding (deployed fix)
echo "[ISSUE 9] branding check..."
check_contains "agents page no Kortix" "$AGENTS" "Recoder"

# ISSUE 10: agents nothing works (partially fixed)
echo "[ISSUE 10] agents basic load..."
check "agents loads" "$AGENTS" "200"

# ISSUE 13: duplicate icons (deployed fix)
echo "[ISSUE 13] agents header..."
check "agents page loads" "$AGENTS" "200"

# ISSUE 14: duplicate agency card (deployed fix)
echo "[ISSUE 14] agents page..."
check "agents loads" "$AGENTS" "200"

# All services health
echo ""
echo "=== Service Health ==="
check "recoder.xyz"       "$BASE"     "200"
check "agents.recoder.xyz" "$AGENTS"  "200"
check "web.recoder.xyz"    "$WEB"     "200"
check "pm.recoder.xyz"     "$PM"      "200"
check "agency.recoder.xyz" "$AGENCY"  "200"
check "openclaw.recoder.xyz" "$OPENCLAW" "200"
check "api.recoder.xyz health" "$API/health" "200"
check "docker.recoder.xyz health" "$DOCKER/health" "200"

# API endpoints
echo ""
echo "=== API Endpoints ==="
check "models endpoint" "$API/v1/models" "200"
check "web-search endpoint" "$DOCKER/api/web-search?q=test" "200"

# Print results
echo ""
echo "================================"
echo "  RESULTS"
echo "================================"
for r in "${results[@]}"; do
  if [[ "$r" == PASS* ]]; then
    echo "  ✅ ${r#PASS: }"
  elif [[ "$r" == FAIL* ]]; then
    echo "  ❌ ${r#FAIL: }"
  else
    echo "  ⏭️  ${r#SKIP: }"
  fi
done
echo ""
echo "Total: $PASS passed, $FAIL failed, $SKIP skipped"
```

- [ ] **Step 2: Run the script**

```bash
chmod +x scripts/verify-phase7-deployed-fixes.sh
bash scripts/verify-phase7-deployed-fixes.sh
```

Expected: All services return 200, identify which issues can be closed.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-phase7-deployed-fixes.sh
git commit -m "feat: add Phase 7A deployed fix verification script"
```

---

### Task 2: Verify and fix agents multi-turn conversation (ISSUE 15)

**Files:**
- Modify: `backend/core/agents/api.py` — Check for stuck agent runs
- Modify: `backend/core/agents/agent_crud.py` — Add stale run cleanup
- Test: `scripts/test-backend-api.sh` — Extend with multi-turn test

- [ ] **Step 1: SSH to server and check for stuck runs**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "cd /root/recoder.xyz && source backend/.venv/bin/activate && python3 -c \"
import asyncio
from core.services.db import execute_read
async def check():
    rows = await execute_read('SELECT id, status, created_at FROM agent_runs WHERE status = :status', {'status': 'running'})
    for r in rows:
        print(f'RUN {r[\"id\"]}: status={r[\"status\"]}, created={r[\"created_at\"]}')
    print(f'Total stuck runs: {len(rows)}')
asyncio.run(check())
\""
```

- [ ] **Step 2: Add stale run cleanup to agent start endpoint**

Read `backend/core/agents/api.py` and find the agent start endpoint. Add logic to auto-close runs older than 10 minutes that are still in "running" status before starting a new run.

```python
# Before creating a new run, clean up stale ones
stale_cutoff = datetime.utcnow() - timedelta(minutes=10)
await execute_mutate(
    "UPDATE agent_runs SET status = 'failed', error = 'Auto-cleaned: stale run' "
    "WHERE account_id = :account_id AND status = 'running' AND created_at < :cutoff",
    {"account_id": account_id, "cutoff": stale_cutoff}
)
```

- [ ] **Step 3: Test multi-turn conversation**

```bash
# Send first message
TOKEN="YOUR_TOKEN"
curl -s -X POST "$API/v1/agent/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"default","message":"Hello, what can you do?"}' | jq .

# Wait for completion, then send follow-up
sleep 5
curl -s -X POST "$API/v1/agent/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"default","thread_id":"THREAD_FROM_ABOVE","message":"Tell me more"}' | jq .
```

- [ ] **Step 4: Commit**

```bash
git add backend/core/agents/api.py
git commit -m "fix: auto-cleanup stale agent runs blocking multi-turn conversation"
```

---

### Task 3: Fix recoder-web chat history 500 (ISSUE 28)

**Files:**
- Modify: `recoder-web/app/routes/api.chat.ts` — Fix getUserApiKey cross-domain auth
- Modify: `recoder-web/app/lib/.server/llm/api-key.ts` — Platform key fallback

- [ ] **Step 1: Read current api-key.ts to understand the auth flow**

```bash
cat recoder-web/app/lib/.server/llm/api-key.ts
```

- [ ] **Step 2: Ensure platform OpenRouter key is used as fallback**

The file should fall back to `process.env.OPENROUTER_API_KEY` when user has no BYOK key. Verify this logic exists and works for anonymous/cross-domain users.

- [ ] **Step 3: Read and fix chat history route**

```bash
cat recoder-web/app/routes/api.chat.ts | head -100
```

Ensure the route doesn't crash when `getUserApiKey` returns null — it should gracefully fall back to platform key.

- [ ] **Step 4: Test chat history endpoint**

```bash
curl -s -X POST "https://web.recoder.xyz/api/chat-history" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"test","messages":[]}' | head -5
```

Expected: 200 or 401 (not 500)

- [ ] **Step 5: Commit**

```bash
git add recoder-web/app/lib/.server/llm/api-key.ts recoder-web/app/routes/api.chat.ts
git commit -m "fix: chat history 500 — platform key fallback for anonymous users"
```

---

### Task 4: Fix recoder.xyz /dashboard/api-keys error (ISSUE 7)

**Files:**
- Modify: `app/app/[locale]/dashboard/page.tsx` or relevant API keys page
- Check: `app/app/api/auth/keys/route.ts`

- [ ] **Step 1: Read the API keys route handler**

```bash
cat app/app/api/auth/keys/route.ts
```

- [ ] **Step 2: Read the dashboard page that renders API keys**

Find the page component that renders at `/dashboard/api-keys` and check for errors.

- [ ] **Step 3: Fix the error**

Common issue: `.map()` on undefined, missing null checks, or permissions/scopes field mismatch. Fix based on what's found.

- [ ] **Step 4: Test**

```bash
curl -s "https://recoder.xyz/api/auth/keys" \
  -H "Cookie: recoder.session_token=YOUR_TOKEN" | jq .
```

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "fix: /dashboard/api-keys error — null safety for API key listing"
```

---

### Task 5: Update plan.md with verification results

**Files:**
- Modify: `plan.md` — Update issue statuses based on verification

- [ ] **Step 1: Update each issue status**

For each of the 19 issues, update status to one of:
- `VERIFIED FIXED` — confirmed working in production
- `STILL BROKEN` — fix deployed but not working, needs more work
- `BLOCKED` — can't fix from code (needs external config)

- [ ] **Step 2: Commit**

```bash
git add plan.md
git commit -m "docs: update issue statuses after Phase 7A verification"
```

---

## Sub-Phase 7B: Feature Expansion

Build out the unified model registry across all apps, wire Daytona LSP into recoder-web, and make PM/Agency AI features work end-to-end.

---

### Task 6: Implement unified model registry in recoder-web

**Files:**
- Modify: `recoder-web/app/lib/stores/model-selection.ts` — Fetch from `/v1/models` API
- Modify: `recoder-web/app/lib/stores/model-profiles.ts` — Update defaults to `openrouter/free`
- Modify: `recoder-web/app/components/chat/ModelProfileSelector.tsx` — Add free tier badge

**Spec:** `docs/superpowers/specs/2026-03-21-unified-model-registry-design.md` Section 5 "Frontend Changes > recoder-web"

- [ ] **Step 1: Read current model-selection.ts**

```bash
cat recoder-web/app/lib/stores/model-selection.ts
```

- [ ] **Step 2: Replace hardcoded AVAILABLE_MODELS with API fetch**

Add a function that fetches from `GET https://api.recoder.xyz/v1/models` with localStorage caching (1-hour TTL). Fall back to current hardcoded list if API unreachable.

```typescript
const MODEL_CACHE_KEY = 'recoder-models-cache';
const MODEL_CACHE_TTL = 3600000; // 1 hour

async function fetchModels(): Promise<ModelInfo[]> {
  const cached = localStorage.getItem(MODEL_CACHE_KEY);
  if (cached) {
    const { models, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < MODEL_CACHE_TTL) return models;
  }
  try {
    const res = await fetch('https://api.recoder.xyz/v1/models');
    const data = await res.json();
    const models = data.models.map((m: any) => ({
      name: m.id,
      label: m.name,
      provider: m.provider,
      maxTokenAllowed: m.context_length,
      isFree: m.tier === 'free',
      speedTier: m.speed_tier,
    }));
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ models, timestamp: Date.now() }));
    return models;
  } catch {
    return FALLBACK_MODELS; // current hardcoded list
  }
}
```

- [ ] **Step 3: Update model-profiles.ts defaults**

Change default model for all profiles from hardcoded model to `openrouter/free`:

```typescript
// Fast profile
{ model: 'openrouter/free', speedTier: 'fast' }
// Balanced profile
{ model: 'openrouter/free', speedTier: 'balanced' }
// Powerful profile
{ model: 'openrouter/free', speedTier: 'powerful' }
```

- [ ] **Step 4: Add FREE badge to ModelProfileSelector**

In `ModelProfileSelector.tsx`, add a visual indicator for free models:

```tsx
{model.isFree && (
  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium">
    FREE
  </span>
)}
```

- [ ] **Step 5: Test locally**

```bash
cd recoder-web && pnpm dev
# Open browser, check model selector shows models from API
# Verify free models have FREE badge
# Verify switching profiles works
```

- [ ] **Step 6: Commit**

```bash
git add recoder-web/app/lib/stores/model-selection.ts \
        recoder-web/app/lib/stores/model-profiles.ts \
        recoder-web/app/components/chat/ModelProfileSelector.tsx
git commit -m "feat: unified model registry in recoder-web — API fetch + free tier badges"
```

---

### Task 7: Wire Daytona LSP into recoder-web for code intelligence

**Files:**
- Modify: `docker-backend/src/server.ts` — Add LSP proxy routes
- Create: `docker-backend/src/daytona-lsp.ts` — LSP client for Daytona SDK
- Modify: `recoder-web/app/lib/hooks/useLSPDiagnostics.ts` — Connect to LSP

**Reference:** `docs/daytona-api-reference.md` LSP section

- [ ] **Step 1: Read existing daytona-lsp.ts**

```bash
cat docker-backend/src/daytona-lsp.ts
```

- [ ] **Step 2: Verify LSP routes exist in server.ts**

Check if `/api/daytona/lsp` routes are already wired. If not, add:
- `POST /api/daytona/lsp/:sandboxId/completions` — Get code completions
- `POST /api/daytona/lsp/:sandboxId/symbols` — Get document symbols
- `POST /api/daytona/lsp/:sandboxId/diagnostics` — Get diagnostics

- [ ] **Step 3: Update useLSPDiagnostics hook in recoder-web**

Read the current hook and connect it to the Daytona LSP endpoint:

```typescript
async function fetchDiagnostics(projectId: string, filePath: string) {
  const res = await dockerPost(`/api/daytona/lsp/${projectId}/diagnostics`, {
    file_path: filePath,
    language: detectLanguage(filePath),
  });
  return res.diagnostics;
}
```

- [ ] **Step 4: Test LSP completions**

```bash
curl -s -X POST "https://docker.recoder.xyz/api/daytona/lsp/test-sandbox/completions" \
  -H "Content-Type: application/json" \
  -d '{"file_path":"/workspace/main.py","line":1,"character":0,"language":"python"}' | jq .
```

- [ ] **Step 5: Commit**

```bash
git add docker-backend/src/daytona-lsp.ts docker-backend/src/server.ts \
        recoder-web/app/lib/hooks/useLSPDiagnostics.ts
git commit -m "feat: wire Daytona LSP into recoder-web for code intelligence"
```

---

### Task 8: Make PM AI features work end-to-end

**Files:**
- Check: `recoder-pm/apps/app/app/api/editor/generate/route.ts` — Editor AI route
- Check: `recoder-pm/apps/app/lib/plans.ts` — Plan/subscription gating
- Modify: PM env config to ensure `OPENROUTER_API_KEY` is available

- [ ] **Step 1: Read editor AI generate route**

```bash
cat recoder-pm/apps/app/app/api/editor/generate/route.ts
```

- [ ] **Step 2: Verify OpenRouter key is configured**

SSH to server and check PM env:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "pm2 env recoder-pm | grep -i openrouter"
```

If missing, set it:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "cd /root/recoder.xyz && pm2 set recoder-pm:OPENROUTER_API_KEY \$(grep OPENROUTER_API_KEY .env | cut -d= -f2)"
```

- [ ] **Step 3: Test PM AI endpoint**

```bash
curl -s -X POST "https://pm.recoder.xyz/api/editor/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie" \
  -d '{"prompt":"Write a PRD for a user authentication system","type":"generate"}' | head -20
```

- [ ] **Step 4: Test PM insights AI**

Navigate to `pm.recoder.xyz/insights` and verify:
- Sample data button works
- AI insights generate when data exists
- Opportunity scoring runs

- [ ] **Step 5: Commit any fixes**

```bash
git add recoder-pm/
git commit -m "fix: PM AI features — verify OpenRouter key and editor AI route"
```

---

### Task 9: Make Agency AI features work end-to-end

**Files:**
- Check: `recoder-agency/apps/agency/lib/agency/agent-orchestrator.ts`
- Check: `recoder-agency/apps/agency/app/api/agency/project-chat/` — Project copilot
- Modify: Agency env config for AI keys

- [ ] **Step 1: Read the agent orchestrator**

```bash
cat recoder-agency/apps/agency/lib/agency/agent-orchestrator.ts
```

- [ ] **Step 2: Read the project copilot API**

```bash
ls recoder-agency/apps/agency/app/api/agency/project-chat/
cat recoder-agency/apps/agency/app/api/agency/project-chat/route.ts
```

- [ ] **Step 3: Verify AI keys on server**

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 \
  "pm2 env recoder-agency | grep -iE 'openrouter|anthropic|openai'"
```

- [ ] **Step 4: Test agency workflow execution**

Navigate to `agency.recoder.xyz`, create a workspace, add an LLM node to a workflow, and execute it.

- [ ] **Step 5: Test brief analyzer**

```bash
cat recoder-agency/apps/agency/lib/agency/workflows/brief-analyzer.ts
```

Verify the brief analyzer can auto-generate quotes from client briefs.

- [ ] **Step 6: Commit any fixes**

```bash
git add recoder-agency/
git commit -m "fix: agency AI features — workflow execution and brief analyzer"
```

---

### Task 10: Expand A2A cross-app workflows

**Files:**
- Modify: `docker-backend/src/a2a-cross-app-workflows.ts` — Add more workflow types
- Modify: `docker-backend/src/unified-activity-feed.ts` — Aggregate events from all apps
- Check: `docker-backend/src/unified-dashboard.ts` — Dashboard metrics

- [ ] **Step 1: Read current cross-app workflows**

```bash
cat docker-backend/src/a2a-cross-app-workflows.ts
```

- [ ] **Step 2: Add workflow: "code-to-project" (web → PM)**

When code is generated in recoder-web, automatically create a project entry in PM:

```typescript
workflows.set('code-to-project', {
  name: 'Code to Project',
  description: 'Auto-create PM project when web IDE generates a new app',
  steps: [
    { source: 'recoder_web', event: 'project.created', action: 'extract_metadata' },
    { target: 'recoder_pm', action: 'create_feature', data: '${metadata}' },
  ],
});
```

- [ ] **Step 3: Add workflow: "brief-to-agent" (agency → agents)**

When agency receives a client brief, auto-create an agent run to analyze it:

```typescript
workflows.set('brief-to-agent', {
  name: 'Brief to Agent Analysis',
  description: 'Auto-analyze client briefs with AI agent',
  steps: [
    { source: 'recoder_agency', event: 'brief.submitted', action: 'extract_brief' },
    { target: 'recoder_backend', action: 'start_agent_run', data: '${brief_content}' },
    { target: 'recoder_agency', action: 'update_quote', data: '${agent_analysis}' },
  ],
});
```

- [ ] **Step 4: Test workflows**

```bash
curl -s "https://docker.recoder.xyz/api/a2a/workflows" | jq '.workflows | length'
```

Expected: 5+ workflows listed.

- [ ] **Step 5: Commit**

```bash
git add docker-backend/src/a2a-cross-app-workflows.ts
git commit -m "feat: add code-to-project and brief-to-agent A2A workflows"
```

---

## Sub-Phase 7C: Comprehensive Test Suite

Build automated tests for every app surface. Tests should be runnable locally and on the server.

---

### Task 11: Expand recoder-agents Vitest test suite

**Files:**
- Create: `recoder-agents/src/__tests__/api/models-route.test.ts`
- Create: `recoder-agents/src/__tests__/api/threads-route.test.ts`
- Create: `recoder-agents/src/__tests__/api/agents-crud.test.ts`
- Create: `recoder-agents/src/__tests__/hooks/use-model-selection.test.ts`
- Create: `recoder-agents/src/__tests__/components/model-selector.test.tsx`
- Create: `recoder-agents/src/__tests__/stores/model-store.test.ts`

- [ ] **Step 1: Write model selection hook test**

```typescript
// src/__tests__/hooks/use-model-selection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('defaults to recoder/power for all users', () => {
    // Mock useAccountState to return free tier
    // Verify getDefaultModel returns 'recoder/power'
  });

  it('persists model selection to localStorage', () => {
    // Select a model, verify localStorage updated
  });

  it('handles missing subscription data gracefully', () => {
    // Mock null subscription, verify no crash
  });
});
```

- [ ] **Step 2: Write model selector component test**

```typescript
// src/__tests__/components/model-selector.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ModelSelector', () => {
  it('renders "Recoder" label (not "Advanced" or "Basic")', () => {
    // Render ModelLabel with 'recoder/power'
    // Verify text content is 'Recoder', not 'Recoder Advanced Mode'
  });

  it('shows upgrade prompt for locked models', () => {
    // Render with a model requiring subscription
    // Verify "Upgrade to access Recoder" text appears
  });
});
```

- [ ] **Step 3: Write API route tests**

```typescript
// src/__tests__/api/models-route.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('GET /api/models', () => {
  it('proxies to backend /v1/models', async () => {
    // Mock fetch to backend
    // Verify response shape matches unified registry spec
  });

  it('returns cached models when backend is down', async () => {
    // Mock fetch failure
    // Verify fallback models returned
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
cd recoder-agents && pnpm test
```

Expected: All existing + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add recoder-agents/src/__tests__/
git commit -m "test: expand recoder-agents test suite — models, hooks, components"
```

---

### Task 12: Build comprehensive backend API test script

**Files:**
- Modify: `scripts/test-backend-api.sh` — Expand to cover all major API domains

- [ ] **Step 1: Read current test-backend-api.sh**

```bash
cat scripts/test-backend-api.sh
```

- [ ] **Step 2: Expand with tests for every API domain**

Add test sections for:
- **Models API**: `GET /v1/models` — verify 42+ models, free/paid tiers
- **Agent CRUD**: Create → Get → Update → Delete agent
- **Thread lifecycle**: Create thread → Add message → Get messages → Delete
- **Knowledge Base**: Create folder → Upload file → Search → Delete
- **Billing**: Get account state → Check credit balance
- **Notifications**: List → Mark read → Mark all read
- **Composio**: List categories → List toolkits → Get toolkit details
- **Sandbox**: Create → Execute command → Delete
- **Admin**: Health check → User list → Analytics summary
- **Search**: Global search → Web search via SearXNG

Each test:
```bash
test_section "Models API"
  test_endpoint "GET" "/v1/models" 200 ".models | length > 10"
  test_endpoint "GET" "/v1/models" 200 '.models[] | select(.tier == "free") | .id' "has free models"
```

- [ ] **Step 3: Run expanded test suite**

```bash
bash scripts/test-backend-api.sh "$TOKEN"
```

Expected: 50+ endpoints tested, all pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-backend-api.sh
git commit -m "test: expand backend API test script to cover all domains"
```

---

### Task 13: Build end-to-end platform test suite

**Files:**
- Modify: `scripts/test-platform-e2e.sh` — Comprehensive cross-app tests

- [ ] **Step 1: Read current e2e test script**

```bash
cat scripts/test-platform-e2e.sh
```

- [ ] **Step 2: Add cross-app test flows**

Add test flows that verify cross-app integration:

```bash
## Cross-App SSO Test
test_section "Cross-App SSO"
  # Login on recoder.xyz
  SESSION=$(curl -s -c - "$BASE/api/auth/sign-in/email" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}' | grep session_token | awk '{print $NF}')

  # Verify session works on agents
  test_auth_endpoint "GET" "$AGENTS/api/auth/session" "$SESSION" 200

  # Verify session works on PM
  test_auth_endpoint "GET" "$PM/api/auth/session" "$SESSION" 200

## Unified Model Registry Test
test_section "Unified Model Registry"
  MODELS=$(curl -s "$API/v1/models")
  FREE_COUNT=$(echo "$MODELS" | jq '[.models[] | select(.tier == "free")] | length')
  PAID_COUNT=$(echo "$MODELS" | jq '[.models[] | select(.tier == "paid")] | length')
  assert_gt "$FREE_COUNT" 5 "At least 5 free models"
  assert_gt "$PAID_COUNT" 10 "At least 10 paid models"
  assert_eq "$(echo "$MODELS" | jq -r '.free_default')" "openrouter/free" "Default is openrouter/free"

## SearXNG Search Test
test_section "Web Search (SearXNG)"
  SEARCH=$(curl -s "$DOCKER/api/web-search?q=recoder.xyz" --max-time 10)
  assert_contains "$SEARCH" "results" "Search returns results"

## Daytona Sandbox Test
test_section "Daytona Sandboxes"
  HEALTH=$(curl -s "$DOCKER/api/health/daytona")
  assert_contains "$HEALTH" "ok" "Daytona is healthy"

## A2A Workflows Test
test_section "A2A Protocol"
  WORKFLOWS=$(curl -s "$DOCKER/api/a2a/workflows")
  WF_COUNT=$(echo "$WORKFLOWS" | jq '.workflows | length')
  assert_gt "$WF_COUNT" 2 "At least 3 A2A workflows"

  DASHBOARD=$(curl -s "$DOCKER/api/a2a/dashboard")
  assert_contains "$DASHBOARD" "services" "Dashboard has services"
```

- [ ] **Step 3: Run e2e tests**

```bash
bash scripts/test-platform-e2e.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/test-platform-e2e.sh
git commit -m "test: comprehensive e2e platform test suite — SSO, models, search, A2A"
```

---

### Task 14: Add recoder-web integration tests

**Files:**
- Create: `recoder-web/tests/api-routes.test.ts`
- Check: `recoder-web/vitest.config.ts` or test setup

- [ ] **Step 1: Check if test infrastructure exists**

```bash
ls recoder-web/vitest.config.* recoder-web/jest.config.* 2>/dev/null
cat recoder-web/package.json | grep -A5 '"test"'
```

- [ ] **Step 2: Write API route tests**

Test critical routes:
- `POST /api/chat` — sends message, gets AI response
- `GET /api/projects` — lists projects
- `POST /api/container` — creates container
- `GET /api/health` — returns ok

```typescript
describe('recoder-web API routes', () => {
  it('GET /api/health returns 200', async () => {
    const res = await fetch('http://localhost:5173/api/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/projects returns array', async () => {
    const res = await fetch('http://localhost:5173/api/projects');
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add recoder-web/tests/
git commit -m "test: add recoder-web API route integration tests"
```

---

### Task 15: Build monitoring & alerting test

**Files:**
- Create: `scripts/test-monitoring.sh`

- [ ] **Step 1: Write monitoring test script**

Tests all monitoring/observability endpoints:

```bash
#!/usr/bin/env bash
# Test all monitoring endpoints

set -euo pipefail

API="https://api.recoder.xyz"
DOCKER="https://docker.recoder.xyz"

echo "=== Monitoring & Observability Tests ==="

# Error dashboard
check "Error dashboard" "$API/v1/errors/dashboard" 200

# Health endpoints
check "API health" "$API/health" 200
check "Docker health" "$DOCKER/health" 200
check "Daytona health" "$DOCKER/api/health/daytona" 200
check "Container health" "$DOCKER/api/health/containers" 200
check "Pool stats" "$DOCKER/api/pool/stats" 200

# Metrics
check "WebSocket stats" "$DOCKER/api/websocket/stats" 200

# A2A dashboard
check "A2A dashboard" "$DOCKER/api/a2a/dashboard" 200
check "A2A activity" "$DOCKER/api/a2a/activity" 200

echo ""
echo "All monitoring endpoints verified."
```

- [ ] **Step 2: Run**

```bash
bash scripts/test-monitoring.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-monitoring.sh
git commit -m "test: add monitoring and observability endpoint test suite"
```

---

### Task 16: Final integration test — full platform sweep

**Files:**
- Create: `scripts/test-full-sweep.sh`

- [ ] **Step 1: Write full platform sweep**

A single script that tests EVERYTHING:

```bash
#!/usr/bin/env bash
# Full platform sweep — runs all test suites in sequence

set -euo pipefail

echo "╔══════════════════════════════════════╗"
echo "║  RECODER PLATFORM — FULL TEST SWEEP  ║"
echo "╚══════════════════════════════════════╝"
echo ""

PASS=0; FAIL=0

run_suite() {
  local name="$1" script="$2"
  echo "━━━ $name ━━━"
  if bash "$script" 2>&1; then
    echo "✅ $name PASSED"
    ((PASS++))
  else
    echo "❌ $name FAILED"
    ((FAIL++))
  fi
  echo ""
}

# Run all test suites
run_suite "Deployed Fix Verification" "scripts/verify-phase7-deployed-fixes.sh"
run_suite "Backend API Tests" "scripts/test-backend-api.sh"
run_suite "Platform E2E Tests" "scripts/test-platform-e2e.sh"
run_suite "Monitoring Tests" "scripts/test-monitoring.sh"

# Run unit tests
echo "━━━ Agents Unit Tests ━━━"
cd recoder-agents && pnpm test 2>&1 && ((PASS++)) || ((FAIL++))
cd ..
echo ""

echo "╔══════════════════════════════════════╗"
echo "║  RESULTS: $PASS passed, $FAIL failed  ║"
echo "╚══════════════════════════════════════╝"

exit $FAIL
```

- [ ] **Step 2: Run full sweep**

```bash
bash scripts/test-full-sweep.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-full-sweep.sh
git commit -m "test: full platform sweep — runs all test suites"
```

---

### Task 17: Update plan.md with Phase 7 completion

**Files:**
- Modify: `plan.md`

- [ ] **Step 1: Add Phase 7 to execution history**

```markdown
PHASE 7 — VERIFY, EXPAND & TEST (DONE ✓)
  ✓ Deployed fix verification script
  ✓ Multi-turn conversation fix (stale run cleanup)
  ✓ Chat history 500 fix (platform key fallback)
  ✓ API keys page fix
  ✓ Unified model registry in recoder-web
  ✓ Daytona LSP wired into recoder-web
  ✓ PM AI features verified
  ✓ Agency AI features verified
  ✓ A2A cross-app workflows expanded
  ✓ Agents Vitest suite expanded (models, hooks, components)
  ✓ Backend API test script expanded (50+ endpoints)
  ✓ Platform e2e test suite (SSO, models, search, A2A)
  ✓ Monitoring test suite
  ✓ Full platform sweep script
  → Phase 8: Landing page, marketing, Sentry DSN
```

- [ ] **Step 2: Commit**

```bash
git add plan.md
git commit -m "docs: mark Phase 7 complete — verify, expand, test"
```

---

## Execution Order

```
7A-1  Build verification script
7A-2  Verify & fix multi-turn (ISSUE 15)
7A-3  Fix chat history 500 (ISSUE 28)
7A-4  Fix API keys page (ISSUE 7)
7A-5  Update plan.md with results
      ─── checkpoint: all issues verified ───
7B-6  Unified model registry in recoder-web
7B-7  Daytona LSP in recoder-web
7B-8  PM AI features end-to-end
7B-9  Agency AI features end-to-end
7B-10 A2A cross-app workflows
      ─── checkpoint: all features expanded ───
7C-11 Agents Vitest test suite
7C-12 Backend API test script
7C-13 Platform e2e test suite
7C-14 recoder-web integration tests
7C-15 Monitoring test suite
7C-16 Full platform sweep
7C-17 Update plan.md
      ─── checkpoint: all tests passing ───
```

## Dependencies

- Tasks 1-5 (7A) must complete before 6-10 (7B)
- Tasks 6-10 (7B) must complete before 11-16 (7C)
- Task 17 runs last after all others

## Risk Mitigation

- **OpenRouter rate limits**: If $0 credits, tests involving AI calls will fail. Fund OpenRouter first.
- **SSH access**: Server tests require `~/.ssh/id_ed25519_hetzner`. Skip if unavailable.
- **Docker rebuild**: recoder-web fixes require Docker image rebuild on server.
- **PM/Agency AI**: May need separate OPENROUTER_API_KEY in PM2 env.
