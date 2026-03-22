# Production Fix Phase — Design Spec

**Date:** 2026-03-23
**Goal:** Make agents.recoder.xyz file tools work (slides, coding, data, docs) and stop dashboard crashes.

---

## Layer 1: DaytonaFileService

### Root Cause Investigation First

Before building DaytonaFileService, verify: does `resolve_sandbox()` in `tool_base.py` call `get_or_start_sandbox()` (which applies the monkey-patch), or does it return an unpatched sandbox? If unpatched, the fix is applying `_patch_sandbox_upload_auth()` in `resolve_sandbox()` — a 1-line fix that resolves ALL 12+ tool files immediately.

If the monkey-patch approach is fundamentally unreliable (keeps getting overwritten, fragile), proceed with DaytonaFileService.

### Python (`backend/core/sandbox/daytona_file_service.py`)

```python
class DaytonaFileService:
    def __init__(self, api_key: str, proxy_url: str = "http://localhost:4000"):
        self.api_key = api_key
        self.proxy_url = proxy_url

    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> bool
    async def write_files(self, sandbox_id: str, files: list[tuple[str, bytes]]) -> bool
    async def read_file(self, sandbox_id: str, path: str) -> bytes
    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]
    async def create_folder(self, sandbox_id: str, path: str) -> bool
    async def file_exists(self, sandbox_id: str, path: str) -> bool
```

**Implementation:**
- Direct HTTP via httpx to `http://localhost:4000/toolbox/{sandboxId}/files/bulk-upload`
- Bracket notation: `files[0][path]`, `files[0][file]`
- Auth header: `Authorization: Bearer {DAYTONA_API_KEY}`
- 3 retries with exponential backoff
- Timeout: 30 seconds per request
- Logs errors, never throws — returns False on failure

### Integration: SandboxToolsBase Level (NOT individual tools)

Add `self.file_service` property to `SandboxToolsBase` in `tool_base.py`. ALL tools inherit it automatically. No need to modify 12+ individual tool files.

```python
class SandboxToolsBase:
    def __init__(self, ...):
        self.file_service = DaytonaFileService(
            api_key=config.DAYTONA_API_KEY,
            proxy_url="http://localhost:4000"
        )
```

Tools that currently call `self.sandbox.fs.upload_file()` get migrated to `self.file_service.write_file()`.

### Files that use sandbox.fs.upload_file (12+ files):
- `sb_presentation_tool.py` — 5 call sites
- `sb_files_tool.py` — 3 call sites
- `sb_image_edit_tool.py` — 7 call sites
- `sb_canvas_tool.py` — 2 call sites
- `sb_code_interpreter_tool.py` — 2 call sites
- `sb_kb_tool.py` — 3 call sites
- `sb_designer_tool.py` — 1 call site
- `sb_vision_tool.py` — 1 call site
- `apify_tool.py` — 1 call site
- `sandbox/api.py` — 4 call sites
- `files/upload_handler.py` — 1 call site
- `utils/file_name_generator.py` — 1 call site

### Docker-backend (TypeScript) — NO CHANGES NEEDED

The TypeScript side already works around the SDK bug using exec + base64 in `daytona-client.ts` `uploadFileExec()`. The existing `daytona-file-ops.ts` + `daytona-client.ts` are already the unified file service. No new file needed.

---

## Layer 2: File Content Proxy API

### New endpoint: `GET /v1/sandboxes/{sandbox_id}/files/content`

**Query params:**
- `path` (required) — file path in sandbox

**Security — Path traversal protection:**
- Normalize path (resolve `..`, `//`, etc.)
- MUST start with `/home/daytona/` after normalization
- Reject paths containing `..`
- Restrict to allowed extensions: html, json, css, js, ts, tsx, png, jpg, jpeg, svg, gif, pdf, md, txt
- Auth: requires valid user session + sandbox ownership verification

**Response headers:**
- `Content-Type` — detected from file extension
- `Access-Control-Allow-Origin: https://agents.recoder.xyz`
- Remove `X-Frame-Options` for this endpoint (allow iframe embedding)
- `Cache-Control: no-cache` (files change during editing)

**Implementation:**
- In `backend/core/sandbox/api.py`
- Uses DaytonaFileService.read_file()

### Frontend changes (ALL 5 presentation files):
- `PresentationSlidePreview.tsx` — use API proxy URL
- `PresentationSlideCard.tsx` — use API proxy URL
- `PresentationViewer.tsx` — use API proxy URL
- `FullScreenPresentationViewer.tsx` — use API proxy URL
- `ExportToolView.tsx` — use API proxy URL

### URL construction:
- `constructHtmlPreviewUrl()` in `url.ts` — generate `https://api.recoder.xyz/v1/sandboxes/{sandboxId}/files/content?path={encodedPath}` instead of `https://8080-{id}.sandbox.recoder.xyz/{path}`
- Caller passes sandbox ID, function builds the API URL

### Remove dead code:
- `start_file_server()` in `sandbox.py` — no longer needed (was starting python HTTP server on port 8080)

---

## Layer 3: Frontend Error Resilience

### Fix each crashing API call individually.

**Pattern:**
```typescript
// Before (crashes):
if (response.error) throw new Error(response.error.message);
return response.data!;

// After (graceful):
try {
  const response = await backendApi.get(url, { showErrors: false });
  if (response.error) return fallbackValue;
  return response.data ?? fallbackValue;
} catch {
  return fallbackValue;
}
```

### Known crashing calls to fix:
1. `src/lib/api/agent-comparison.ts` — `compareAgents()`, `listSavedComparisons()`, `getComparison()`, `deleteComparison()`, `liveCompare()` (getAgentLeaderboard already fixed)
2. `src/lib/api/thread-analytics.ts` — verify deployed
3. `src/hooks/triggers/use-all-triggers.ts` — verify deployed

### Utility helper (optional but recommended):
```typescript
// src/lib/api/safe-api.ts
export async function safeApiGet<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await backendApi.get<T>(url, { showErrors: false });
    if (response.error) return fallback;
    return response.data ?? fallback;
  } catch {
    return fallback;
  }
}
```

---

## Layer 4: Image Generation via OpenRouter

### OpenRouter supports image generation models.

- Configure image generation to use OpenRouter API
- Models: use OpenRouter's image-capable models
- Integration point: `sb_image_edit_tool.py`, `sb_vision_tool.py`, or dedicated image gen tool
- Uses existing `OPENROUTER_API_KEY` — no new API keys needed

---

## Files to Create

1. `backend/core/sandbox/daytona_file_service.py` — new

## Files to Modify

### Backend (Python):
2. `backend/core/sandbox/sandbox.py` — remove monkey-patch + start_file_server, import DaytonaFileService
3. `backend/core/agents/runner/tool_manager.py` or `tool_base.py` — add file_service to SandboxToolsBase
4. `backend/core/sandbox/api.py` — add file content proxy endpoint

### Frontend (agents):
5. `recoder-agents/src/lib/api/agent-comparison.ts` — graceful error handling for remaining throwing functions
6. `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationSlidePreview.tsx`
7. `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationSlideCard.tsx`
8. `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationViewer.tsx`
9. `recoder-agents/src/components/thread/tool-views/presentation-tools/FullScreenPresentationViewer.tsx`
10. `recoder-agents/src/components/thread/tool-views/presentation-tools/ExportToolView.tsx`
11. `recoder-agents/src/lib/utils/url.ts` — update constructHtmlPreviewUrl for API proxy

---

## Deployment Steps

1. Deploy backend changes (Python) — `pm2 restart recoder-backend`
2. Deploy agents frontend — `NODE_OPTIONS='--max-old-space-size=8192' npx next build` + copy Prisma engine + `pm2 restart recoder-agents` (stop PM/Agency during build to free RAM)
3. Docker-backend — NO rebuild needed (TS side not broken)
4. Verify: create presentation, create code project, check dashboard loads without crash

---

## Out of Scope (separate phase)

- Web live preview (dev server management + sandbox URL debugging)
- Computer use / VNC (needs full Daytona snapshot `0.5.0` instead of `0.5.0-slim`)
- PM/Agency fixes (separate deployment)
- OpenClaw channels (needs external credentials)
