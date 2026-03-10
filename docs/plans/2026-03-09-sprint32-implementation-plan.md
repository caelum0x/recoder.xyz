# Sprint 32: Deep Platform Development — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build context compression, provider fallback, cost prediction, visual workflow engine, analytics dashboards, developer docs, and mobile responsive overhaul across the Recoder platform.

**Architecture:** Sequential deep dives — AI capabilities first (foundation), then workflows (core feature), analytics (builds on both), developer experience (documents APIs), mobile (polish layer). Each section builds on the previous.

**Tech Stack:** Python (FastAPI, asyncio), TypeScript (Next.js, React Flow, yargs), Supabase (Postgres, RLS), SSE streaming, Recharts, Scalar (API docs), Service Workers

---

## Phase 1: AI Capabilities

### Task 1: Context Compression — Backend Endpoint

**Files:**
- Create: `backend/core/ai/context_compressor.py`
- Modify: `backend/api.py` (add route)
- Test: `backend/tests/core/test_context_compressor.py`

**Step 1: Write the test**

```python
# backend/tests/core/test_context_compressor.py
import pytest
from core.ai.context_compressor import compress_messages

def test_compress_preserves_system_prompt():
    messages = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "old message 1"},
        {"role": "assistant", "content": "old response 1"},
        {"role": "user", "content": "old message 2"},
        {"role": "assistant", "content": "old response 2"},
        {"role": "user", "content": "recent message"},
        {"role": "assistant", "content": "recent response"},
    ]
    result = compress_messages(messages, preserve_last_n=2)
    assert result[0]["role"] == "system"
    assert result[0]["content"] == "You are helpful"
    assert len(result) == 4  # system + summary + last 2 turns
    assert result[1]["role"] == "system"
    assert "summary" in result[1]["content"].lower() or "conversation" in result[1]["content"].lower()

def test_compress_no_op_when_few_messages():
    messages = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]
    result = compress_messages(messages, preserve_last_n=2)
    assert result == messages  # No compression needed

def test_compress_preserves_tool_results():
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "old"},
        {"role": "assistant", "content": "old resp"},
        {"role": "user", "content": "recent"},
        {"role": "assistant", "content": "resp", "tool_calls": [{"id": "t1"}]},
        {"role": "tool", "content": "result", "tool_call_id": "t1"},
    ]
    result = compress_messages(messages, preserve_last_n=3)
    tool_msgs = [m for m in result if m["role"] == "tool"]
    assert len(tool_msgs) == 1
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/core/test_context_compressor.py -v`
Expected: FAIL — module not found

**Step 3: Write implementation**

```python
# backend/core/ai/context_compressor.py
from typing import Any

def compress_messages(
    messages: list[dict[str, Any]],
    preserve_last_n: int = 4,
    max_summary_tokens: int = 500,
) -> list[dict[str, Any]]:
    """Compress older messages into a summary, preserving recent turns and system prompts."""
    if len(messages) <= preserve_last_n + 1:
        return messages

    system_msgs = [m for m in messages if m["role"] == "system"]
    non_system = [m for m in messages if m["role"] != "system"]

    if len(non_system) <= preserve_last_n:
        return messages

    to_compress = non_system[:-preserve_last_n]
    to_preserve = non_system[-preserve_last_n:]

    # Check if preserved messages reference tool calls — pull those in
    preserved_tool_ids = set()
    for m in to_preserve:
        if m.get("tool_calls"):
            for tc in m["tool_calls"]:
                preserved_tool_ids.add(tc.get("id"))
        if m.get("tool_call_id"):
            preserved_tool_ids.add(m["tool_call_id"])

    # Move tool messages that are referenced by preserved messages
    moved_to_preserve = []
    final_compress = []
    for m in to_compress:
        if m.get("tool_call_id") and m["tool_call_id"] in preserved_tool_ids:
            moved_to_preserve.append(m)
        elif m.get("tool_calls"):
            tc_ids = {tc.get("id") for tc in m["tool_calls"]}
            if tc_ids & preserved_tool_ids:
                moved_to_preserve.append(m)
            else:
                final_compress.append(m)
        else:
            final_compress.append(m)

    if not final_compress:
        return messages

    summary_lines = []
    for m in final_compress:
        role = m["role"]
        content = m.get("content", "")
        if content and len(content) > 200:
            content = content[:200] + "..."
        if content:
            summary_lines.append(f"[{role}]: {content}")

    summary_text = (
        "[Conversation Summary — older messages compressed]\n"
        + "\n".join(summary_lines)
    )

    summary_msg = {"role": "system", "content": summary_text}

    return system_msgs + [summary_msg] + moved_to_preserve + to_preserve
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/core/test_context_compressor.py -v`
Expected: PASS

**Step 5: Add API route**

Add to `backend/api.py`:
```python
from core.ai.context_compressor import compress_messages

@app.post("/threads/{thread_id}/compress")
async def compress_thread_context(thread_id: str, request: Request):
    """Compress older messages in a thread to reduce context window usage."""
    data = await request.json()
    messages = data.get("messages", [])
    preserve_last_n = data.get("preserve_last_n", 4)
    compressed = compress_messages(messages, preserve_last_n=preserve_last_n)
    return {
        "compressed_messages": compressed,
        "original_count": len(messages),
        "compressed_count": len(compressed),
    }
```

**Step 6: Commit**

```bash
git add backend/core/ai/context_compressor.py backend/tests/core/test_context_compressor.py backend/api.py
git commit -m "feat: add context compression for thread messages"
```

---

### Task 2: Context Compression — Frontend Integration

**Files:**
- Create: `recoder-agents/src/lib/api/context-compression.ts`
- Modify: `recoder-agents/src/components/thread/ContextUsageIndicator.tsx`
- Modify: `recoder-agents/src/lib/streaming/stream-connection.ts`

**Step 1: Create API client**

```typescript
// recoder-agents/src/lib/api/context-compression.ts
import { getBackendUrl } from '@/lib/runtime-urls';

export interface CompressResult {
  compressed_messages: Array<{ role: string; content: string }>;
  original_count: number;
  compressed_count: number;
}

export async function compressThreadContext(
  threadId: string,
  messages: Array<{ role: string; content: string }>,
  preserveLastN = 4,
): Promise<CompressResult> {
  const res = await fetch(`${getBackendUrl()}/threads/${threadId}/compress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, preserve_last_n: preserveLastN }),
  });
  if (!res.ok) throw new Error(`Compression failed: ${res.status}`);
  return res.json();
}
```

**Step 2: Add compress button to ContextUsageIndicator**

Modify `ContextUsageIndicator.tsx` to show a "Compress" button when usage exceeds 80%. Add an onClick handler that calls `compressThreadContext()` and shows a toast on success.

**Step 3: Commit**

```bash
git add recoder-agents/src/lib/api/context-compression.ts recoder-agents/src/components/thread/ContextUsageIndicator.tsx
git commit -m "feat: add context compression button to thread UI"
```

---

### Task 3: Provider Fallback Routing

**Files:**
- Create: `backend/core/ai/provider_fallback.py`
- Test: `backend/tests/core/test_provider_fallback.py`
- Modify: `backend/api.py` (wire into chat endpoint)

**Step 1: Write test**

```python
# backend/tests/core/test_provider_fallback.py
import pytest
from core.ai.provider_fallback import FallbackRouter, FallbackChain

def test_fallback_chain_returns_next_model():
    chain = FallbackChain(models=["claude-sonnet-4", "gpt-5.1", "gemini-2.5-flash"])
    assert chain.primary() == "claude-sonnet-4"
    assert chain.next_after("claude-sonnet-4") == "gpt-5.1"
    assert chain.next_after("gpt-5.1") == "gemini-2.5-flash"
    assert chain.next_after("gemini-2.5-flash") is None

def test_fallback_router_selects_chain():
    router = FallbackRouter()
    chain = router.get_chain("claude-sonnet-4")
    assert chain is not None
    assert chain.primary() == "claude-sonnet-4"

def test_fallback_router_unknown_model():
    router = FallbackRouter()
    chain = router.get_chain("unknown-model")
    assert chain is not None
    assert chain.primary() == "unknown-model"
    assert chain.next_after("unknown-model") is None
```

**Step 2: Run test — expect FAIL**

Run: `cd backend && uv run pytest tests/core/test_provider_fallback.py -v`

**Step 3: Implement**

```python
# backend/core/ai/provider_fallback.py
from dataclasses import dataclass, field

PREMIUM_CHAIN = ["claude-sonnet-4", "gpt-5.1", "gemini-2.5-flash"]
STANDARD_CHAIN = ["deepseek-v3", "qwen3-coder", "gemini-2.0-flash"]

MODEL_TO_CHAIN: dict[str, list[str]] = {}
for chain in [PREMIUM_CHAIN, STANDARD_CHAIN]:
    for model in chain:
        MODEL_TO_CHAIN[model] = chain

@dataclass
class FallbackChain:
    models: list[str] = field(default_factory=list)

    def primary(self) -> str:
        return self.models[0] if self.models else ""

    def next_after(self, model: str) -> str | None:
        try:
            idx = self.models.index(model)
            if idx + 1 < len(self.models):
                return self.models[idx + 1]
        except ValueError:
            pass
        return None

class FallbackRouter:
    def get_chain(self, model: str) -> FallbackChain:
        chain_models = MODEL_TO_CHAIN.get(model, [model])
        return FallbackChain(models=chain_models)
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add backend/core/ai/provider_fallback.py backend/tests/core/test_provider_fallback.py
git commit -m "feat: add provider fallback routing with chain selection"
```

---

### Task 4: Cost Prediction Endpoint

**Files:**
- Create: `backend/core/ai/cost_estimator.py`
- Test: `backend/tests/core/test_cost_estimator.py`
- Modify: `backend/api.py`

**Step 1: Write test**

```python
# backend/tests/core/test_cost_estimator.py
import pytest
from core.ai.cost_estimator import estimate_cost, MODEL_PRICING

def test_estimate_cost_known_model():
    result = estimate_cost(model="claude-sonnet-4", input_tokens=1000, output_multiplier=2.0)
    assert result["model"] == "claude-sonnet-4"
    assert result["estimated_input_tokens"] == 1000
    assert result["estimated_output_tokens"] == 2000
    assert result["estimated_cost_usd"] > 0
    assert isinstance(result["estimated_cost_usd"], float)

def test_estimate_cost_unknown_model():
    result = estimate_cost(model="unknown", input_tokens=500)
    assert result["estimated_cost_usd"] == 0.0
    assert result["pricing_available"] is False

def test_model_pricing_has_entries():
    assert len(MODEL_PRICING) > 0
    assert "claude-sonnet-4" in MODEL_PRICING
```

**Step 2: Implement**

```python
# backend/core/ai/cost_estimator.py
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4": {"input_per_1k": 0.003, "output_per_1k": 0.015},
    "claude-opus-4": {"input_per_1k": 0.015, "output_per_1k": 0.075},
    "gpt-5.1": {"input_per_1k": 0.005, "output_per_1k": 0.015},
    "gpt-5.2": {"input_per_1k": 0.0025, "output_per_1k": 0.010},
    "gemini-2.5-flash": {"input_per_1k": 0.00015, "output_per_1k": 0.0006},
    "gemini-2.0-flash": {"input_per_1k": 0.0001, "output_per_1k": 0.0004},
    "deepseek-v3": {"input_per_1k": 0.00014, "output_per_1k": 0.00028},
    "qwen3-coder": {"input_per_1k": 0.0002, "output_per_1k": 0.0006},
}

def estimate_cost(
    model: str,
    input_tokens: int,
    output_multiplier: float = 1.5,
) -> dict:
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return {
            "model": model,
            "estimated_input_tokens": input_tokens,
            "estimated_output_tokens": int(input_tokens * output_multiplier),
            "estimated_cost_usd": 0.0,
            "pricing_available": False,
        }

    est_output = int(input_tokens * output_multiplier)
    cost = (input_tokens / 1000 * pricing["input_per_1k"]) + (est_output / 1000 * pricing["output_per_1k"])

    return {
        "model": model,
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": est_output,
        "estimated_cost_usd": round(cost, 6),
        "pricing_available": True,
    }
```

**Step 3: Add route to api.py**

```python
@app.get("/agents/{agent_id}/cost-estimate")
async def get_cost_estimate(agent_id: str, prompt_length: int = 500, model: str = "claude-sonnet-4"):
    from core.ai.cost_estimator import estimate_cost
    return estimate_cost(model=model, input_tokens=prompt_length)
```

**Step 4: Run tests, commit**

```bash
cd backend && uv run pytest tests/core/test_cost_estimator.py -v
git add backend/core/ai/cost_estimator.py backend/tests/core/test_cost_estimator.py backend/api.py
git commit -m "feat: add cost estimation endpoint for agent runs"
```

---

### Task 5: Cost Prediction — Frontend Hook + UI

**Files:**
- Create: `recoder-agents/src/lib/api/cost-estimate.ts`
- Create: `recoder-agents/src/hooks/agents/use-cost-estimate.ts`
- Modify: `recoder-agents/src/hooks/dashboard/use-initiate-agent.ts` (show estimate before start)

**Step 1: Create API + hook**

```typescript
// recoder-agents/src/lib/api/cost-estimate.ts
import { getBackendUrl } from '@/lib/runtime-urls';

export interface CostEstimate {
  model: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  pricing_available: boolean;
}

export async function getCostEstimate(
  agentId: string,
  promptLength: number,
  model: string,
): Promise<CostEstimate> {
  const url = `${getBackendUrl()}/agents/${agentId}/cost-estimate?prompt_length=${promptLength}&model=${encodeURIComponent(model)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cost estimate failed: ${res.status}`);
  return res.json();
}
```

```typescript
// recoder-agents/src/hooks/agents/use-cost-estimate.ts
import { useQuery } from '@tanstack/react-query';
import { getCostEstimate, type CostEstimate } from '@/lib/api/cost-estimate';

export function useCostEstimate(agentId: string, promptLength: number, model: string) {
  return useQuery<CostEstimate>({
    queryKey: ['cost-estimate', agentId, promptLength, model],
    queryFn: () => getCostEstimate(agentId, promptLength, model),
    enabled: promptLength > 0 && !!model,
    staleTime: 60_000,
  });
}
```

**Step 2: Wire into agent start flow**

Modify `use-initiate-agent.ts` to call `useCostEstimate` and display estimate in the chat input area as a subtle line: "Est. ~$0.03 (Claude Sonnet 4)".

**Step 3: Commit**

```bash
git add recoder-agents/src/lib/api/cost-estimate.ts recoder-agents/src/hooks/agents/use-cost-estimate.ts recoder-agents/src/hooks/dashboard/use-initiate-agent.ts
git commit -m "feat: show cost estimate before agent runs"
```

---

## Phase 2: Agent Workflows

### Task 6: Workflow Database Schema

**Files:**
- Create: `backend/supabase/migrations/20260309300000_workflow_system_v2.sql`

**Step 1: Write migration**

```sql
-- 20260309300000_workflow_system_v2.sql
-- Workflow system v2 — restored and refined from original 20250417 schema

-- Enums
DO $$ BEGIN
  CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wf_execution_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wf_node_type AS ENUM ('agent', 'tool', 'condition', 'loop', 'parallel', 'delay', 'approval', 'input', 'output');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status workflow_status DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  definition JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, agent_id)
);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_type wf_node_type NOT NULL,
  label VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  condition JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status wf_execution_status DEFAULT 'pending',
  trigger_type VARCHAR(50),
  trigger_data JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds FLOAT,
  total_cost DECIMAL(10,4) DEFAULT 0.0,
  total_tokens INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  status wf_execution_status DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  cost DECIMAL(10,4) DEFAULT 0.0,
  tokens_used INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  definition JSONB NOT NULL,
  node_types TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  context JSONB NOT NULL DEFAULT '{}',
  ttl_seconds INTEGER DEFAULT 86400,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  responder_id UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_agent ON workflows(agent_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_workflow ON workflow_edges(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_exec ON workflow_node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_approval_gates_status ON approval_gates(status) WHERE status = 'pending';

-- Updated at trigger
CREATE OR REPLACE TRIGGER set_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_node_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_gates ENABLE ROW LEVEL SECURITY;

-- Permissive policies (service role manages, users view own)
CREATE POLICY workflows_select ON workflows FOR SELECT USING (true);
CREATE POLICY workflows_all ON workflows FOR ALL USING (true);
CREATE POLICY wf_nodes_all ON workflow_nodes FOR ALL USING (true);
CREATE POLICY wf_edges_all ON workflow_edges FOR ALL USING (true);
CREATE POLICY wf_exec_all ON workflow_executions FOR ALL USING (true);
CREATE POLICY wf_node_exec_all ON workflow_node_executions FOR ALL USING (true);
CREATE POLICY wf_templates_select ON workflow_templates FOR SELECT USING (true);
CREATE POLICY approval_gates_all ON approval_gates FOR ALL USING (true);
```

**Step 2: Commit**

```bash
git add backend/supabase/migrations/20260309300000_workflow_system_v2.sql
git commit -m "feat: add workflow system v2 database schema"
```

---

### Task 7: Workflow CRUD API (Backend)

**Files:**
- Create: `backend/core/workflows/workflow_service.py`
- Create: `backend/core/workflows/__init__.py`
- Create: `backend/core/workflows/workflow_api.py`
- Test: `backend/tests/core/test_workflow_service.py`
- Modify: `backend/api.py`

**Step 1: Write tests**

```python
# backend/tests/core/test_workflow_service.py
import pytest
from core.workflows.workflow_service import WorkflowService, WorkflowCreate, NodeCreate

def test_workflow_create_model():
    wf = WorkflowCreate(name="Test", agent_id="abc-123", description="A test workflow")
    assert wf.name == "Test"
    assert wf.status == "draft"

def test_node_create_model():
    node = NodeCreate(node_type="agent", label="Run Agent", config={"agent_id": "x", "prompt": "do thing"})
    assert node.node_type == "agent"
    assert node.config["prompt"] == "do thing"

def test_validate_dag_detects_cycle():
    from core.workflows.workflow_service import validate_dag
    nodes = ["a", "b", "c"]
    edges = [("a", "b"), ("b", "c"), ("c", "a")]
    assert validate_dag(nodes, edges) is False

def test_validate_dag_accepts_valid():
    from core.workflows.workflow_service import validate_dag
    nodes = ["a", "b", "c"]
    edges = [("a", "b"), ("a", "c")]
    assert validate_dag(nodes, edges) is True
```

**Step 2: Implement service**

```python
# backend/core/workflows/__init__.py
# Workflow engine package

# backend/core/workflows/workflow_service.py
from dataclasses import dataclass, field
from typing import Any

@dataclass
class WorkflowCreate:
    name: str
    agent_id: str
    description: str = ""
    status: str = "draft"
    definition: dict = field(default_factory=dict)

@dataclass
class NodeCreate:
    node_type: str
    label: str
    config: dict = field(default_factory=dict)
    position_x: float = 0
    position_y: float = 0

def validate_dag(node_ids: list[str], edges: list[tuple[str, str]]) -> bool:
    """Check if the graph is a valid DAG (no cycles)."""
    adjacency: dict[str, list[str]] = {n: [] for n in node_ids}
    for src, tgt in edges:
        adjacency.setdefault(src, []).append(tgt)

    visited: set[str] = set()
    in_stack: set[str] = set()

    def dfs(node: str) -> bool:
        if node in in_stack:
            return False  # Cycle
        if node in visited:
            return True
        visited.add(node)
        in_stack.add(node)
        for neighbor in adjacency.get(node, []):
            if not dfs(neighbor):
                return False
        in_stack.discard(node)
        return True

    for n in node_ids:
        if n not in visited:
            if not dfs(n):
                return False
    return True

def topological_sort(node_ids: list[str], edges: list[tuple[str, str]]) -> list[str]:
    """Return nodes in execution order."""
    in_degree: dict[str, int] = {n: 0 for n in node_ids}
    adjacency: dict[str, list[str]] = {n: [] for n in node_ids}
    for src, tgt in edges:
        adjacency[src].append(tgt)
        in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue = [n for n in node_ids if in_degree[n] == 0]
    result = []
    while queue:
        node = queue.pop(0)
        result.append(node)
        for neighbor in adjacency[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    return result
```

**Step 3: Create API routes**

```python
# backend/core/workflows/workflow_api.py
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workflows", tags=["workflows"])

class WorkflowCreateRequest(BaseModel):
    name: str
    agent_id: str
    description: str = ""

class NodeCreateRequest(BaseModel):
    node_type: str
    label: str
    config: dict = {}
    position_x: float = 0
    position_y: float = 0

class EdgeCreateRequest(BaseModel):
    source_node_id: str
    target_node_id: str
    condition: Optional[dict] = None

@router.post("")
async def create_workflow(req: WorkflowCreateRequest, request: Request):
    db = request.app.state.db
    result = await db.execute(
        """INSERT INTO workflows (name, agent_id, account_id, description, definition)
           VALUES ($1, $2, $3, $4, '{}') RETURNING id, name, status, version, created_at""",
        req.name, req.agent_id, request.state.account_id, req.description,
    )
    return dict(result[0]) if result else None

@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, request: Request):
    db = request.app.state.db
    wf = await db.execute("SELECT * FROM workflows WHERE id = $1", workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    nodes = await db.execute("SELECT * FROM workflow_nodes WHERE workflow_id = $1 ORDER BY created_at", workflow_id)
    edges = await db.execute("SELECT * FROM workflow_edges WHERE workflow_id = $1", workflow_id)
    return {"workflow": dict(wf[0]), "nodes": [dict(n) for n in nodes], "edges": [dict(e) for e in edges]}

@router.get("/agent/{agent_id}")
async def list_agent_workflows(agent_id: str, request: Request):
    db = request.app.state.db
    rows = await db.execute("SELECT * FROM workflows WHERE agent_id = $1 ORDER BY updated_at DESC", agent_id)
    return [dict(r) for r in rows]

@router.post("/{workflow_id}/nodes")
async def add_node(workflow_id: str, req: NodeCreateRequest, request: Request):
    db = request.app.state.db
    result = await db.execute(
        """INSERT INTO workflow_nodes (workflow_id, node_type, label, config, position_x, position_y)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        workflow_id, req.node_type, req.label, req.config, req.position_x, req.position_y,
    )
    return dict(result[0]) if result else None

@router.post("/{workflow_id}/edges")
async def add_edge(workflow_id: str, req: EdgeCreateRequest, request: Request):
    db = request.app.state.db
    result = await db.execute(
        """INSERT INTO workflow_edges (workflow_id, source_node_id, target_node_id, condition)
           VALUES ($1, $2, $3, $4) RETURNING *""",
        workflow_id, req.source_node_id, req.target_node_id, req.condition,
    )
    return dict(result[0]) if result else None

@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, request: Request):
    db = request.app.state.db
    await db.execute("DELETE FROM workflows WHERE id = $1", workflow_id)
    return {"deleted": True}
```

**Step 4: Wire into api.py**

```python
from core.workflows.workflow_api import router as workflow_router
app.include_router(workflow_router)
```

**Step 5: Run tests and commit**

```bash
cd backend && uv run pytest tests/core/test_workflow_service.py -v
git add backend/core/workflows/ backend/tests/core/test_workflow_service.py backend/api.py
git commit -m "feat: add workflow CRUD API with DAG validation"
```

---

### Task 8: Workflow Execution Engine

**Files:**
- Create: `backend/core/workflows/workflow_engine.py`
- Test: `backend/tests/core/test_workflow_engine.py`

**Step 1: Write tests**

```python
# backend/tests/core/test_workflow_engine.py
import pytest
import asyncio
from core.workflows.workflow_engine import WorkflowEngine, NodeExecutor, ExecutionContext

class MockNodeExecutor(NodeExecutor):
    async def execute_node(self, node_type: str, config: dict, input_data: dict, ctx: ExecutionContext) -> dict:
        if node_type == "agent":
            return {"result": f"agent ran: {config.get('prompt', '')}"}
        if node_type == "condition":
            val = input_data.get("value", 0)
            return {"branch": "true" if val > 5 else "false"}
        if node_type == "delay":
            return {"delayed": True}
        if node_type == "output":
            return input_data
        return {}

@pytest.mark.asyncio
async def test_simple_linear_workflow():
    engine = WorkflowEngine(executor=MockNodeExecutor())
    nodes = [
        {"id": "n1", "node_type": "agent", "config": {"prompt": "hello"}},
        {"id": "n2", "node_type": "output", "config": {}},
    ]
    edges = [{"source_node_id": "n1", "target_node_id": "n2"}]
    result = await engine.execute(nodes, edges, trigger_data={})
    assert result["status"] == "completed"
    assert len(result["node_results"]) == 2

@pytest.mark.asyncio
async def test_condition_branching():
    engine = WorkflowEngine(executor=MockNodeExecutor())
    nodes = [
        {"id": "n1", "node_type": "condition", "config": {}},
        {"id": "n2", "node_type": "agent", "config": {"prompt": "true path"}},
        {"id": "n3", "node_type": "agent", "config": {"prompt": "false path"}},
    ]
    edges = [
        {"source_node_id": "n1", "target_node_id": "n2", "condition": {"branch": "true"}},
        {"source_node_id": "n1", "target_node_id": "n3", "condition": {"branch": "false"}},
    ]
    result = await engine.execute(nodes, edges, trigger_data={"value": 10})
    assert result["status"] == "completed"
    executed_ids = [nr["node_id"] for nr in result["node_results"]]
    assert "n2" in executed_ids
    assert "n3" not in executed_ids

@pytest.mark.asyncio
async def test_engine_handles_node_failure():
    class FailingExecutor(NodeExecutor):
        async def execute_node(self, node_type, config, input_data, ctx):
            raise ValueError("intentional failure")

    engine = WorkflowEngine(executor=FailingExecutor())
    nodes = [{"id": "n1", "node_type": "agent", "config": {}}]
    edges = []
    result = await engine.execute(nodes, edges, trigger_data={})
    assert result["status"] == "failed"
    assert result["node_results"][0]["error"] is not None
```

**Step 2: Implement engine**

```python
# backend/core/workflows/workflow_engine.py
import asyncio
import time
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

@dataclass
class ExecutionContext:
    execution_id: str = ""
    trigger_data: dict = field(default_factory=dict)
    node_outputs: dict[str, dict] = field(default_factory=dict)

class NodeExecutor(ABC):
    @abstractmethod
    async def execute_node(self, node_type: str, config: dict, input_data: dict, ctx: ExecutionContext) -> dict:
        ...

@dataclass
class NodeResult:
    node_id: str
    status: str  # completed, failed, skipped
    output: dict = field(default_factory=dict)
    error: str | None = None
    duration_ms: int = 0

class WorkflowEngine:
    def __init__(self, executor: NodeExecutor):
        self.executor = executor

    async def execute(
        self,
        nodes: list[dict],
        edges: list[dict],
        trigger_data: dict,
        execution_id: str = "",
    ) -> dict:
        ctx = ExecutionContext(execution_id=execution_id, trigger_data=trigger_data)
        node_map = {n["id"]: n for n in nodes}
        adjacency: dict[str, list[dict]] = {n["id"]: [] for n in nodes}
        in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

        for edge in edges:
            adjacency[edge["source_node_id"]].append(edge)
            in_degree[edge["target_node_id"]] = in_degree.get(edge["target_node_id"], 0) + 1

        # Start with nodes that have no incoming edges
        ready = [nid for nid, deg in in_degree.items() if deg == 0]
        results: list[dict] = []
        executed: set[str] = set()
        status = "completed"

        while ready:
            node_id = ready.pop(0)
            if node_id in executed:
                continue
            executed.add(node_id)

            node = node_map[node_id]
            # Gather input from parent nodes
            input_data = dict(ctx.trigger_data)
            for edge in edges:
                if edge["target_node_id"] == node_id and edge["source_node_id"] in ctx.node_outputs:
                    input_data.update(ctx.node_outputs[edge["source_node_id"]])

            start = time.monotonic()
            try:
                output = await self.executor.execute_node(
                    node["node_type"], node.get("config", {}), input_data, ctx,
                )
                duration_ms = int((time.monotonic() - start) * 1000)
                ctx.node_outputs[node_id] = output
                results.append({"node_id": node_id, "status": "completed", "output": output, "error": None, "duration_ms": duration_ms})
            except Exception as e:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error(f"Node {node_id} failed: {e}")
                results.append({"node_id": node_id, "status": "failed", "output": {}, "error": str(e), "duration_ms": duration_ms})
                status = "failed"
                break

            # Evaluate outgoing edges
            for edge in adjacency.get(node_id, []):
                target = edge["target_node_id"]
                condition = edge.get("condition")

                if condition:
                    # Check if output matches condition
                    match = all(output.get(k) == v for k, v in condition.items())
                    if not match:
                        continue

                in_degree[target] -= 1
                if in_degree[target] <= 0 and target not in executed:
                    ready.append(target)

        return {"status": status, "node_results": results}
```

**Step 3: Run tests and commit**

```bash
cd backend && uv run pytest tests/core/test_workflow_engine.py -v
git add backend/core/workflows/workflow_engine.py backend/tests/core/test_workflow_engine.py
git commit -m "feat: add workflow execution engine with DAG traversal"
```

---

### Task 9: Workflow Execution API Routes

**Files:**
- Modify: `backend/core/workflows/workflow_api.py`

**Step 1: Add execution routes**

```python
# Add to workflow_api.py

@router.post("/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, request: Request):
    """Start a workflow execution."""
    db = request.app.state.db
    data = await request.json() if request.headers.get("content-type") == "application/json" else {}

    # Load workflow
    wf = await db.execute("SELECT * FROM workflows WHERE id = $1", workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")

    nodes = await db.execute("SELECT * FROM workflow_nodes WHERE workflow_id = $1", workflow_id)
    edges = await db.execute("SELECT * FROM workflow_edges WHERE workflow_id = $1", workflow_id)

    # Create execution record
    exec_row = await db.execute(
        """INSERT INTO workflow_executions (workflow_id, status, trigger_type, trigger_data, started_at)
           VALUES ($1, 'running', $2, $3, NOW()) RETURNING id""",
        workflow_id, data.get("trigger_type", "manual"), data.get("trigger_data", {}),
    )
    execution_id = str(exec_row[0]["id"])

    # Execute asynchronously
    from core.workflows.workflow_engine import WorkflowEngine
    engine = WorkflowEngine(executor=request.app.state.node_executor)
    result = await engine.execute(
        [dict(n) for n in nodes],
        [dict(e) for e in edges],
        trigger_data=data.get("trigger_data", {}),
        execution_id=execution_id,
    )

    # Update execution record
    await db.execute(
        """UPDATE workflow_executions SET status = $1, completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
           WHERE id = $2""",
        result["status"], execution_id,
    )

    # Store node execution results
    for nr in result["node_results"]:
        await db.execute(
            """INSERT INTO workflow_node_executions (execution_id, node_id, status, output_data, error, duration_ms)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            execution_id, nr["node_id"], nr["status"], nr.get("output"), nr.get("error"), nr.get("duration_ms", 0),
        )

    return {"execution_id": execution_id, **result}

@router.get("/{workflow_id}/executions")
async def list_executions(workflow_id: str, request: Request):
    db = request.app.state.db
    rows = await db.execute(
        """SELECT * FROM workflow_executions WHERE workflow_id = $1 ORDER BY created_at DESC LIMIT 50""",
        workflow_id,
    )
    return [dict(r) for r in rows]

@router.get("/executions/{execution_id}")
async def get_execution(execution_id: str, request: Request):
    db = request.app.state.db
    ex = await db.execute("SELECT * FROM workflow_executions WHERE id = $1", execution_id)
    if not ex:
        raise HTTPException(404, "Execution not found")
    node_execs = await db.execute(
        "SELECT * FROM workflow_node_executions WHERE execution_id = $1 ORDER BY started_at", execution_id,
    )
    return {"execution": dict(ex[0]), "node_executions": [dict(ne) for ne in node_execs]}

# Approval endpoints
@router.post("/approvals/{approval_id}/approve")
async def approve_gate(approval_id: str, request: Request):
    db = request.app.state.db
    await db.execute(
        "UPDATE approval_gates SET status = 'approved', responded_at = NOW() WHERE id = $1 AND status = 'pending'",
        approval_id,
    )
    return {"status": "approved"}

@router.post("/approvals/{approval_id}/reject")
async def reject_gate(approval_id: str, request: Request):
    db = request.app.state.db
    await db.execute(
        "UPDATE approval_gates SET status = 'rejected', responded_at = NOW() WHERE id = $1 AND status = 'pending'",
        approval_id,
    )
    return {"status": "rejected"}

@router.get("/approvals/pending")
async def list_pending_approvals(request: Request):
    db = request.app.state.db
    rows = await db.execute(
        """SELECT ag.*, wn.label as node_label, w.name as workflow_name
           FROM approval_gates ag
           JOIN workflow_nodes wn ON ag.node_id = wn.id
           JOIN workflow_executions we ON ag.execution_id = we.id
           JOIN workflows w ON we.workflow_id = w.id
           WHERE ag.status = 'pending'
           ORDER BY ag.requested_at DESC"""
    )
    return [dict(r) for r in rows]
```

**Step 2: Commit**

```bash
git add backend/core/workflows/workflow_api.py
git commit -m "feat: add workflow execution and approval API routes"
```

---

### Task 10: Workflow Frontend — API Layer + Types

**Files:**
- Create: `recoder-agents/src/lib/api/workflows.ts`
- Create: `recoder-agents/src/hooks/workflows/use-workflows.ts`

**Step 1: Create API client**

```typescript
// recoder-agents/src/lib/api/workflows.ts
import { getBackendUrl } from '@/lib/runtime-urls';

export interface Workflow {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNode {
  id: string;
  workflow_id: string;
  node_type: 'agent' | 'tool' | 'condition' | 'loop' | 'parallel' | 'delay' | 'approval' | 'input' | 'output';
  label: string;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
}

export interface WorkflowEdge {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  condition?: Record<string, unknown>;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  total_cost?: number;
}

export interface ApprovalGate {
  id: string;
  execution_id: string;
  node_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  context: Record<string, unknown>;
  node_label?: string;
  workflow_name?: string;
  requested_at: string;
}

const api = (path: string, init?: RequestInit) =>
  fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  }).then((r) => {
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
  });

export const workflowApi = {
  list: (agentId: string) => api(`/workflows/agent/${agentId}`) as Promise<Workflow[]>,
  get: (id: string) => api(`/workflows/${id}`) as Promise<{ workflow: Workflow; nodes: WorkflowNode[]; edges: WorkflowEdge[] }>,
  create: (data: { name: string; agent_id: string; description?: string }) => api('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/workflows/${id}`, { method: 'DELETE' }),
  addNode: (wfId: string, node: Omit<WorkflowNode, 'id' | 'workflow_id'>) => api(`/workflows/${wfId}/nodes`, { method: 'POST', body: JSON.stringify(node) }),
  addEdge: (wfId: string, edge: { source_node_id: string; target_node_id: string; condition?: Record<string, unknown> }) => api(`/workflows/${wfId}/edges`, { method: 'POST', body: JSON.stringify(edge) }),
  execute: (wfId: string, triggerData?: Record<string, unknown>) => api(`/workflows/${wfId}/execute`, { method: 'POST', body: JSON.stringify({ trigger_data: triggerData }) }),
  listExecutions: (wfId: string) => api(`/workflows/${wfId}/executions`) as Promise<WorkflowExecution[]>,
  getExecution: (execId: string) => api(`/workflows/executions/${execId}`),
  pendingApprovals: () => api('/workflows/approvals/pending') as Promise<ApprovalGate[]>,
  approve: (id: string) => api(`/workflows/approvals/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => api(`/workflows/approvals/${id}/reject`, { method: 'POST' }),
};
```

**Step 2: Create React Query hooks**

```typescript
// recoder-agents/src/hooks/workflows/use-workflows.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowApi, type Workflow, type WorkflowNode, type WorkflowEdge, type ApprovalGate } from '@/lib/api/workflows';

export function useWorkflows(agentId: string) {
  return useQuery({ queryKey: ['workflows', agentId], queryFn: () => workflowApi.list(agentId), enabled: !!agentId });
}

export function useWorkflow(workflowId: string) {
  return useQuery({ queryKey: ['workflow', workflowId], queryFn: () => workflowApi.get(workflowId), enabled: !!workflowId });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workflowApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workflowApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function useExecuteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, triggerData }: { workflowId: string; triggerData?: Record<string, unknown> }) =>
      workflowApi.execute(workflowId, triggerData),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['workflow-executions', vars.workflowId] }),
  });
}

export function useWorkflowExecutions(workflowId: string) {
  return useQuery({ queryKey: ['workflow-executions', workflowId], queryFn: () => workflowApi.listExecutions(workflowId), enabled: !!workflowId, refetchInterval: 5000 });
}

export function usePendingApprovals() {
  return useQuery<ApprovalGate[]>({ queryKey: ['pending-approvals'], queryFn: workflowApi.pendingApprovals, refetchInterval: 10000 });
}

export function useApproveGate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: workflowApi.approve, onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-approvals'] }) });
}

export function useRejectGate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: workflowApi.reject, onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-approvals'] }) });
}
```

**Step 3: Commit**

```bash
git add recoder-agents/src/lib/api/workflows.ts recoder-agents/src/hooks/workflows/use-workflows.ts
git commit -m "feat: add workflow API client and React Query hooks"
```

---

### Task 11: Visual Workflow Editor — React Flow Canvas

**Files:**
- Create: `recoder-agents/src/components/workflows/WorkflowCanvas.tsx`
- Create: `recoder-agents/src/components/workflows/WorkflowNodePalette.tsx`
- Create: `recoder-agents/src/components/workflows/nodes/AgentNode.tsx`
- Create: `recoder-agents/src/components/workflows/nodes/ConditionNode.tsx`
- Create: `recoder-agents/src/components/workflows/nodes/GenericNode.tsx`

This is a large task. Implementation details:

- `WorkflowCanvas.tsx`: Main React Flow wrapper. Uses `useWorkflow()` hook to load nodes/edges. Maps `WorkflowNode` to React Flow `Node` objects with custom node types. Handles `onNodesChange`, `onEdgesChange`, `onConnect`. Save button calls `workflowApi.addNode/addEdge`.

- `WorkflowNodePalette.tsx`: Sidebar with draggable node type cards. Each card has icon + label. Uses `onDragStart` with `dataTransfer.setData('application/reactflow', nodeType)`. Canvas handles `onDrop` to create node at drop position.

- Node components: Each custom node renders with an icon (from lucide-react), label, and status indicator. `AgentNode` shows agent name + model. `ConditionNode` shows if/else branches. `GenericNode` covers tool, delay, approval, input, output with appropriate icons.

Install React Flow if not already present:
```bash
cd recoder-agents && pnpm add @xyflow/react
```

**Commit after implementation:**
```bash
git add recoder-agents/src/components/workflows/
git commit -m "feat: add visual workflow editor with React Flow canvas"
```

---

### Task 12: Workflow Editor — Config Panel + Toolbar

**Files:**
- Create: `recoder-agents/src/components/workflows/WorkflowNodeConfig.tsx`
- Create: `recoder-agents/src/components/workflows/WorkflowToolbar.tsx`
- Create: `recoder-agents/src/components/workflows/WorkflowExecutionView.tsx`

- `WorkflowNodeConfig.tsx`: Right panel that opens when a node is selected. Shows node-type-specific config form: agent node → agent picker + prompt textarea; condition → JSONPath expression input; delay → duration input; approval → TTL + context fields.

- `WorkflowToolbar.tsx`: Top bar with: workflow name (editable), status badge, Save button, Run button, version history dropdown, "Save as Template" button.

- `WorkflowExecutionView.tsx`: Overlay that shows during/after execution. Each node gets a status indicator (spinner for running, green check for completed, red X for failed). Shows elapsed time and cost accumulation.

**Commit:**
```bash
git add recoder-agents/src/components/workflows/
git commit -m "feat: add workflow config panel, toolbar, and execution view"
```

---

### Task 13: Wire Workflow Editor into Agent Config

**Files:**
- Modify: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/workflows-screen.tsx`

Replace the current tool-config screen with the real workflow editor. Import `WorkflowCanvas`, `WorkflowNodePalette`, `WorkflowToolbar`. Layout: toolbar top, palette left, canvas center, config panel right (conditionally shown).

Add a "Create Workflow" button when no workflows exist. List existing workflows in a dropdown when multiple exist.

**Commit:**
```bash
git add recoder-agents/src/app/(dashboard)/agents/config/*/screens/workflows-screen.tsx
git commit -m "feat: wire visual workflow editor into agent config"
```

---

### Task 14: Workflow Templates

**Files:**
- Create: `backend/core/workflows/templates.py`
- Modify: `backend/core/workflows/workflow_api.py`

**Step 1: Define templates**

```python
# backend/core/workflows/templates.py
WORKFLOW_TEMPLATES = [
    {
        "name": "Daily Standup Report",
        "description": "Summarize recent agent activity and send a daily report",
        "category": "productivity",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Summarize Activity", "config": {"prompt": "Summarize the recent threads and agent runs from the last 24 hours. Focus on key outcomes and pending items."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "output", "label": "Send Report", "config": {"format": "markdown"}, "position_x": 250, "position_y": 300},
            ],
            "edges": [{"source": "t1", "target": "t2"}],
        },
        "is_featured": True,
    },
    {
        "name": "PR Review Pipeline",
        "description": "Review pull requests with AI and route for human approval",
        "category": "development",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Review Code", "config": {"prompt": "Review this pull request for bugs, security issues, and code quality."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "condition", "label": "Issues Found?", "config": {"expression": "issues_count > 0"}, "position_x": 250, "position_y": 250},
                {"id": "t3", "node_type": "approval", "label": "Human Review", "config": {"ttl_seconds": 86400}, "position_x": 100, "position_y": 400},
                {"id": "t4", "node_type": "agent", "label": "Auto-Approve", "config": {"prompt": "Post approval comment on the PR."}, "position_x": 400, "position_y": 400},
                {"id": "t5", "node_type": "output", "label": "Done", "config": {}, "position_x": 250, "position_y": 550},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3", "condition": {"branch": "true"}},
                {"source": "t2", "target": "t4", "condition": {"branch": "false"}},
                {"source": "t3", "target": "t5"},
                {"source": "t4", "target": "t5"},
            ],
        },
        "is_featured": True,
    },
    {
        "name": "Research & Report",
        "description": "Research a topic, write a report, and get approval before sharing",
        "category": "research",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "input", "label": "Research Topic", "config": {"prompt": "What topic should I research?"}, "position_x": 250, "position_y": 50},
                {"id": "t2", "node_type": "agent", "label": "Research", "config": {"prompt": "Research the given topic thoroughly using web search and knowledge base."}, "position_x": 250, "position_y": 200},
                {"id": "t3", "node_type": "agent", "label": "Write Report", "config": {"prompt": "Write a structured report based on the research findings."}, "position_x": 250, "position_y": 350},
                {"id": "t4", "node_type": "approval", "label": "Review Report", "config": {"ttl_seconds": 172800}, "position_x": 250, "position_y": 500},
                {"id": "t5", "node_type": "output", "label": "Publish", "config": {"format": "markdown"}, "position_x": 250, "position_y": 650},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3"},
                {"source": "t3", "target": "t4"},
                {"source": "t4", "target": "t5"},
            ],
        },
        "is_featured": True,
    },
    {
        "name": "Data Pipeline",
        "description": "Scrape, clean, and store data in knowledge base",
        "category": "data",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Scrape Data", "config": {"prompt": "Scrape the target URL and extract structured data."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "agent", "label": "Clean & Transform", "config": {"prompt": "Clean and normalize the scraped data."}, "position_x": 250, "position_y": 250},
                {"id": "t3", "node_type": "agent", "label": "Store in KB", "config": {"prompt": "Store the cleaned data in the knowledge base."}, "position_x": 250, "position_y": 400},
                {"id": "t4", "node_type": "output", "label": "Summary", "config": {}, "position_x": 250, "position_y": 550},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3"},
                {"source": "t3", "target": "t4"},
            ],
        },
        "is_featured": False,
    },
    {
        "name": "Customer Support Triage",
        "description": "Classify incoming support requests and route to human or auto-reply",
        "category": "support",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Classify Request", "config": {"prompt": "Classify this support request as 'urgent', 'standard', or 'faq'."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "condition", "label": "Urgency Check", "config": {"expression": "classification"}, "position_x": 250, "position_y": 250},
                {"id": "t3", "node_type": "approval", "label": "Escalate to Human", "config": {"ttl_seconds": 3600}, "position_x": 50, "position_y": 400},
                {"id": "t4", "node_type": "agent", "label": "Auto-Reply", "config": {"prompt": "Draft a helpful response for this standard support request."}, "position_x": 450, "position_y": 400},
                {"id": "t5", "node_type": "output", "label": "Resolved", "config": {}, "position_x": 250, "position_y": 550},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3", "condition": {"branch": "urgent"}},
                {"source": "t2", "target": "t4", "condition": {"branch": "standard"}},
                {"source": "t2", "target": "t4", "condition": {"branch": "faq"}},
                {"source": "t3", "target": "t5"},
                {"source": "t4", "target": "t5"},
            ],
        },
        "is_featured": True,
    },
]

def get_templates(category: str | None = None) -> list[dict]:
    if category:
        return [t for t in WORKFLOW_TEMPLATES if t["category"] == category]
    return WORKFLOW_TEMPLATES

def get_template(name: str) -> dict | None:
    for t in WORKFLOW_TEMPLATES:
        if t["name"] == name:
            return t
    return None
```

**Step 2: Add template API routes**

```python
# Add to workflow_api.py
@router.get("/templates/list")
async def list_templates(category: str = None):
    from core.workflows.templates import get_templates
    return get_templates(category)

@router.post("/{workflow_id}/from-template")
async def create_from_template(workflow_id: str, request: Request):
    data = await request.json()
    template_name = data.get("template_name")
    from core.workflows.templates import get_template
    tmpl = get_template(template_name)
    if not tmpl:
        raise HTTPException(404, "Template not found")
    # Create nodes and edges from template definition
    db = request.app.state.db
    node_id_map = {}
    for node_def in tmpl["definition"]["nodes"]:
        result = await db.execute(
            """INSERT INTO workflow_nodes (workflow_id, node_type, label, config, position_x, position_y)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
            workflow_id, node_def["node_type"], node_def["label"],
            node_def.get("config", {}), node_def.get("position_x", 0), node_def.get("position_y", 0),
        )
        node_id_map[node_def["id"]] = str(result[0]["id"])

    for edge_def in tmpl["definition"]["edges"]:
        await db.execute(
            """INSERT INTO workflow_edges (workflow_id, source_node_id, target_node_id, condition)
               VALUES ($1, $2, $3, $4)""",
            workflow_id, node_id_map[edge_def["source"]], node_id_map[edge_def["target"]],
            edge_def.get("condition"),
        )
    return {"created_nodes": len(node_id_map), "created_edges": len(tmpl["definition"]["edges"])}
```

**Step 3: Commit**

```bash
git add backend/core/workflows/templates.py backend/core/workflows/workflow_api.py
git commit -m "feat: add workflow templates with 5 starter definitions"
```

---

## Phase 3: Analytics & Insights

### Task 15: Model Performance Metrics — Backend

**Files:**
- Create: `backend/supabase/migrations/20260309300001_analytics_latency.sql`
- Modify: `backend/core/agents/analytics_api.py`

**Step 1: Migration**

```sql
-- Add latency tracking columns to existing analytics
ALTER TABLE agent_analytics ADD COLUMN IF NOT EXISTS response_latency_ms INTEGER;
ALTER TABLE agent_analytics ADD COLUMN IF NOT EXISTS time_to_first_token_ms INTEGER;
ALTER TABLE agent_analytics ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);
```

**Step 2: Add model performance endpoint**

Add to `analytics_api.py`:
```python
@router.get("/agents/{agent_id}/analytics/models")
async def get_model_analytics(agent_id: str, range: str = "30d"):
    # Query: group by model, compute avg latency, p95, error rate, cost per run, total runs
    # Return sorted by total_runs DESC
```

**Step 3: Commit**

```bash
git add backend/supabase/migrations/20260309300001_analytics_latency.sql backend/core/agents/analytics_api.py
git commit -m "feat: add model performance metrics tracking"
```

---

### Task 16: Model Performance — Frontend Tab

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/model-performance-tab.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/analytics-screen.tsx`

Add a "Model Performance" tab to the analytics screen. Shows:
- Comparison table (model, avg latency, p95 latency, error rate, cost/run, total runs)
- Latency histogram per model (recharts BarChart)
- Recommendation badges ("Fastest", "Best Value", "Most Reliable")

**Commit:**
```bash
git add recoder-agents/src/app/(dashboard)/agents/config/*/screens/model-performance-tab.tsx recoder-agents/src/app/(dashboard)/agents/config/*/screens/analytics-screen.tsx
git commit -m "feat: add model performance analytics tab"
```

---

### Task 17: Workflow Analytics — Backend + Frontend

**Files:**
- Modify: `backend/core/workflows/workflow_api.py`
- Create: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/workflow-analytics-tab.tsx`

**Backend endpoints:**
```python
@router.get("/{workflow_id}/analytics")
async def workflow_analytics(workflow_id: str):
    # Return: execution_count, success_rate, avg_duration, bottleneck_nodes, failure_hotspots

@router.get("/analytics/overview")
async def workflows_overview():
    # Return: aggregate across all user workflows
```

**Frontend:** Tab with execution timeline (gantt-style), bottleneck heatmap, failure funnel, cost per node type. Uses recharts.

**Commit:**
```bash
git add backend/core/workflows/workflow_api.py recoder-agents/src/app/(dashboard)/agents/config/*/screens/workflow-analytics-tab.tsx
git commit -m "feat: add workflow execution analytics"
```

---

### Task 18: Cost Dashboard + Budget Alerts

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/billing/cost-dashboard/page.tsx`
- Create: `recoder-agents/src/lib/api/budget-alerts.ts`
- Create: `recoder-agents/src/hooks/billing/use-budget-alerts.ts`
- Create: `backend/supabase/migrations/20260309300002_budget_alerts.sql`

**Migration:**
```sql
CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  threshold_amount DECIMAL(10,2) NOT NULL,
  alert_type VARCHAR(20) DEFAULT 'warning_80pct',
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_budget_alerts_user ON budget_alerts(user_id);
```

**Frontend page:** Daily/weekly/monthly cost trend (LineChart), cost by agent (BarChart), cost by model (PieChart), projected monthly cost, budget threshold setting with notification toggle.

**Commit:**
```bash
git add backend/supabase/migrations/20260309300002_budget_alerts.sql recoder-agents/src/app/(dashboard)/billing/cost-dashboard/ recoder-agents/src/lib/api/budget-alerts.ts recoder-agents/src/hooks/billing/use-budget-alerts.ts
git commit -m "feat: add cost dashboard with budget alerts"
```

---

### Task 19: Active Runs Monitor

**Files:**
- Create: `recoder-agents/src/components/sidebar/active-runs.tsx`
- Create: `recoder-agents/src/hooks/threads/use-active-runs.ts`
- Modify: `recoder-agents/src/components/sidebar/sidebar-left.tsx`

`active-runs.tsx`: Collapsible sidebar section showing count badge. Expanded: list of running agents with name, model, elapsed time, token count, estimated cost. Auto-removes completed after 5s. Uses `useActiveRuns()` hook that polls `/agents/active-runs` every 3 seconds.

Wire into `sidebar-left.tsx` between thread list and user profile sections.

**Commit:**
```bash
git add recoder-agents/src/components/sidebar/active-runs.tsx recoder-agents/src/hooks/threads/use-active-runs.ts recoder-agents/src/components/sidebar/sidebar-left.tsx
git commit -m "feat: add active runs monitor to sidebar"
```

---

## Phase 4: Developer Experience

### Task 20: FastAPI OpenAPI Annotations

**Files:**
- Modify: `backend/api.py` (add Pydantic response models to key routes)
- Modify: `backend/core/workflows/workflow_api.py` (add response models)
- Modify: `backend/core/agents/analytics_api.py` (add response models)

Add Pydantic `response_model` and `summary`/`description` to all workflow, analytics, agent, trigger, and KB routes. FastAPI auto-generates OpenAPI from these. Verify with `GET /openapi.json`.

**Commit:**
```bash
git add backend/api.py backend/core/workflows/workflow_api.py backend/core/agents/analytics_api.py
git commit -m "feat: annotate FastAPI routes with Pydantic models for OpenAPI"
```

---

### Task 21: Docker-Backend Swagger Setup

**Files:**
- Modify: `docker-backend/package.json` (add swagger-jsdoc, swagger-ui-express)
- Create: `docker-backend/src/swagger-config.ts`
- Modify: `docker-backend/src/server.ts` (mount swagger UI)

```typescript
// docker-backend/src/swagger-config.ts
import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.1.0',
    info: { title: 'Recoder Docker Backend API', version: '1.0.0', description: 'Container management, A2A, and file operations' },
    servers: [{ url: 'https://docker.recoder.xyz' }],
  },
  apis: ['./src/server.ts', './src/a2a/*.ts', './src/public-api/routes/*.ts'],
});
```

Mount at `/api-docs` in server.ts.

**Commit:**
```bash
git add docker-backend/src/swagger-config.ts docker-backend/package.json docker-backend/src/server.ts
git commit -m "feat: add Swagger UI to docker-backend at /api-docs"
```

---

### Task 22: API Explorer Page

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/developers/page.tsx`
- Create: `recoder-agents/src/app/(dashboard)/developers/layout.tsx`
- Modify: `recoder-agents/src/components/sidebar/sidebar-left.tsx` (add Developers nav item)

Install Scalar: `cd recoder-agents && pnpm add @scalar/api-reference-react`

Page embeds Scalar React component pointing at `/openapi.json` from the Python backend. Add auth header input for live requests. Add "Developers" link in sidebar nav under a code icon.

**Commit:**
```bash
git add recoder-agents/src/app/(dashboard)/developers/ recoder-agents/src/components/sidebar/sidebar-left.tsx
git commit -m "feat: add interactive API explorer with Scalar"
```

---

### Task 23: SDK Documentation Pages

**Files:**
- Create: `docs/sdk/getting-started.md`
- Create: `docs/sdk/agents.md`
- Create: `docs/sdk/workflows.md`
- Create: `docs/sdk/triggers.md`
- Create: `docs/sdk/streaming.md`
- Create: `docs/sdk/billing.md`
- Create: `recoder-agents/src/app/(dashboard)/developers/docs/page.tsx`

Each doc covers: overview, authentication, code examples (curl + TypeScript), error handling. The docs page renders MDX from the `docs/sdk/` directory.

**Commit:**
```bash
git add docs/sdk/ recoder-agents/src/app/(dashboard)/developers/docs/
git commit -m "feat: add SDK documentation guides"
```

---

### Task 24: CLI Workflow + Analytics Commands

**Files:**
- Create: `packages/recoder-code/packages/cli/src/commands/workflow.ts`
- Create: `packages/recoder-code/packages/cli/src/commands/workflow/list.ts`
- Create: `packages/recoder-code/packages/cli/src/commands/workflow/run.ts`
- Create: `packages/recoder-code/packages/cli/src/commands/workflow/status.ts`
- Create: `packages/recoder-code/packages/cli/src/commands/cost.ts`
- Create: `packages/recoder-code/packages/cli/src/commands/docs.ts`
- Modify: `packages/recoder-code/packages/cli/src/config/config.ts` (register new commands)

Follow existing yargs CommandModule pattern. Each command:
1. Checks auth via `RecoderAuthService`
2. Calls backend API
3. Formats output with console.log
4. Exits with process.exit(0/1)

Register in config.ts `parseArguments()` alongside existing `.command()` calls.

**Commit:**
```bash
git add packages/recoder-code/packages/cli/src/commands/workflow* packages/recoder-code/packages/cli/src/commands/cost.ts packages/recoder-code/packages/cli/src/commands/docs.ts packages/recoder-code/packages/cli/src/config/config.ts
git commit -m "feat: add workflow, cost, and docs CLI commands"
```

---

## Phase 5: Mobile & Responsive

### Task 25: Cross-App Safe Area Fixes

**Files:**
- Modify: `app/app/layout.tsx` (add viewportFit)
- Modify: `app/app/globals.css` (add safe-area CSS)
- Modify: `recoder-agency/apps/agency/app/layout.tsx` (add viewportFit)
- Modify: `recoder-agency/apps/agency/app/globals.css` (add safe-area CSS)

Add `viewportFit: 'cover'` to viewport metadata in both layouts. Add safe-area CSS variables to both globals:

```css
/* Safe area support */
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}
```

Audit and fix `fixed bottom-0` elements to include `pb-[env(safe-area-inset-bottom)]`.

**Commit:**
```bash
git add app/app/layout.tsx app/app/globals.css recoder-agency/apps/agency/app/layout.tsx recoder-agency/apps/agency/app/globals.css
git commit -m "feat: add safe-area and viewport-fit support to app and agency"
```

---

### Task 26: Responsive Navigation — App

**Files:**
- Create: `app/app/components/MobileNav.tsx`
- Modify: `app/app/[locale]/dashboard/layout.tsx`
- Create: `packages/ui/src/hooks/use-is-mobile.ts`

Create shared `useIsMobile` hook in `@recoder/ui` (checks `window.matchMedia('(max-width: 768px)')`). Create `MobileNav.tsx` with hamburger menu + bottom tab bar (Overview, Agents, Analytics, Settings). Wire into dashboard layout with conditional rendering.

**Commit:**
```bash
git add app/app/components/MobileNav.tsx app/app/*/dashboard/layout.tsx packages/ui/src/hooks/use-is-mobile.ts
git commit -m "feat: add responsive mobile navigation to main app"
```

---

### Task 27: Responsive Navigation — Agency

**Files:**
- Modify: `recoder-agency/apps/agency/app/(main)/ui/header/header.tsx`
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/lobby-client.tsx`

Add hamburger menu to agency header on mobile. Cards in lobby stack vertically. Team switcher moves into mobile menu drawer.

**Commit:**
```bash
git add recoder-agency/apps/agency/app/(main)/ui/header/header.tsx recoder-agency/apps/agency/app/(main)/lobby/lobby-client.tsx
git commit -m "feat: add responsive navigation to agency app"
```

---

### Task 28: Service Worker + Offline Support

**Files:**
- Create: `recoder-agents/public/sw.js`
- Modify: `recoder-agents/src/app/layout.tsx` (register SW)
- Create: `recoder-agents/src/components/ui/offline-indicator.tsx`

```javascript
// recoder-agents/public/sw.js
const CACHE_NAME = 'recoder-agents-v1';
const STATIC_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Cache-first for static assets
  if (url.pathname.match(/\.(js|css|woff2|png|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }))
    );
    return;
  }
  // Network-first for API calls
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
});
```

`offline-indicator.tsx`: Listens to `navigator.onLine` events, shows a subtle top banner when offline.

Register in layout.tsx:
```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

**Commit:**
```bash
git add recoder-agents/public/sw.js recoder-agents/src/app/layout.tsx recoder-agents/src/components/ui/offline-indicator.tsx
git commit -m "feat: add service worker with offline support"
```

---

### Task 29: Touch-Friendly Workflow Viewer

**Files:**
- Create: `recoder-agents/src/components/workflows/WorkflowMobileView.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/workflows-screen.tsx`

`WorkflowMobileView.tsx`: Vertical card list. Each node rendered as a card with icon, label, expand button for config/output. Connecting lines between cards. Approval nodes show full-width approve/reject buttons (min 48px height). Status indicators animate during execution.

Workflows screen: `useIsMobile()` ? `<WorkflowMobileView />` : `<WorkflowCanvas />`.

**Commit:**
```bash
git add recoder-agents/src/components/workflows/WorkflowMobileView.tsx recoder-agents/src/app/(dashboard)/agents/config/*/screens/workflows-screen.tsx
git commit -m "feat: add touch-friendly mobile workflow viewer"
```

---

### Task 30: Mobile App Banner for recoder.xyz

**Files:**
- Create: `app/app/components/MobileAppBanner.tsx`
- Modify: `app/app/layout.tsx`

Port the pattern from `recoder-agents/src/app/share/[threadId]/_components/MobileAppBanner.tsx`. Detect iOS/Android via user agent. Show smart app banner with app store links. Dismissible with 7-day cookie (`recoder-app-banner-dismissed`). Add `apple-itunes-app` meta tag to layout.

**Commit:**
```bash
git add app/app/components/MobileAppBanner.tsx app/app/layout.tsx
git commit -m "feat: add mobile app banner to recoder.xyz"
```

---

## Final: Update Status Docs

### Task 31: Update todo.md and plan.md

**Files:**
- Modify: `tasks/todo.md`
- Modify: `plan.md`

Add Sprint 32 section to todo.md with all completed items. Update plan.md remaining tasks section.

**Commit:**
```bash
git add tasks/todo.md plan.md
git commit -m "docs: update status docs for Sprint 32 completion"
```

---

## Dependency Graph

```
Task 1-2 (Context Compression) ─┐
Task 3 (Fallback Routing) ──────┤── Phase 1: AI Capabilities
Task 4-5 (Cost Prediction) ─────┘
                                 │
Task 6 (Schema) ─────────────────┤
Task 7 (CRUD API) ───────────────┤
Task 8 (Engine) ─────────────────┤── Phase 2: Workflows (depends on Phase 1)
Task 9 (Execution API) ──────────┤
Task 10 (Frontend API) ──────────┤
Task 11-12 (React Flow Editor) ──┤
Task 13 (Wire into Config) ──────┤
Task 14 (Templates) ─────────────┘
                                 │
Task 15-16 (Model Metrics) ──────┤
Task 17 (Workflow Analytics) ────┤── Phase 3: Analytics (depends on Phase 2)
Task 18 (Cost Dashboard) ────────┤
Task 19 (Active Runs) ───────────┘
                                 │
Task 20 (FastAPI OpenAPI) ───────┤
Task 21 (Swagger Docker) ────────┤── Phase 4: DX (depends on Phase 1-3)
Task 22 (API Explorer) ──────────┤
Task 23 (SDK Docs) ──────────────┤
Task 24 (CLI Commands) ──────────┘
                                 │
Task 25 (Safe Areas) ────────────┤
Task 26-27 (Responsive Nav) ─────┤── Phase 5: Mobile (independent)
Task 28 (Service Worker) ────────┤
Task 29 (Mobile Workflow) ───────┤── (depends on Task 11)
Task 30 (App Banner) ────────────┘
                                 │
Task 31 (Status Docs) ───────────── Final
```
