# Production Fix Phase — Design Spec

**Date:** 2026-03-23
**Goal:** Make agents.recoder.xyz file tools work (slides, coding, data, docs) and stop dashboard crashes.

---

## Layer 1: DaytonaFileService

### Python (`backend/core/sandbox/daytona_file_service.py`)

```
class DaytonaFileService:
    def __init__(self, api_key: str, proxy_url: str = "http://localhost:4000")

    async def write_file(sandbox_id: str, path: str, content: bytes) -> bool
    async def write_files(sandbox_id: str, files: list[tuple[str, bytes]]) -> bool
    async def read_file(sandbox_id: str, path: str) -> bytes
    async def list_files(sandbox_id: str, path: str) -> list[FileInfo]
    async def create_folder(sandbox_id: str, path: str) -> bool
    async def file_exists(sandbox_id: str, path: str) -> bool
```

**Implementation:**
- Direct HTTP via httpx to `http://localhost:4000/toolbox/{sandboxId}/files/bulk-upload`
- Bracket notation: `files[0][path]`, `files[0][file]`
- Auth header: `Authorization: Bearer {DAYTONA_API_KEY}`
- 3 retries with exponential backoff
- Timeout: 30 seconds per request
- Logs errors, never throws — returns False on failure

**Integration points:**
- `backend/core/sandbox/sandbox.py` — remove monkey-patch, use DaytonaFileService
- `backend/core/tools/sb_presentation_tool.py` — replace `sandbox.fs.upload_file()` with `file_service.write_file()`
- `backend/core/tools/sb_files_tool.py` — same replacement
- `backend/core/sandbox/api.py` — same replacement
- All other tools that call `sandbox.fs.upload_file()`

### TypeScript (`docker-backend/src/daytona-file-service.ts`)

Same interface, used by docker-backend for web.recoder.xyz file operations.
- Replace scattered `daytonaWriteFile()`, `toolboxRequest()` calls
- Single source of truth for Daytona file I/O

---

## Layer 2: File Content Proxy API

### New endpoint: `GET /v1/sandboxes/{sandbox_id}/files/content`

**Query params:**
- `path` (required) — file path in sandbox (e.g., `/home/daytona/presentations/test/slide_01.html`)

**Response:**
- File content with correct `Content-Type` header (text/html, application/json, etc.)
- CORS headers for cross-origin iframe embedding

**Implementation:**
- In `backend/core/sandbox/api.py`
- Uses DaytonaFileService.read_file()
- MIME type detection from file extension
- Auth: requires valid user session (same as other sandbox endpoints)

**Frontend changes:**
- `PresentationSlidePreview.tsx` — change `constructHtmlPreviewUrl()` to use `/v1/sandboxes/{id}/files/content?path=...` instead of `https://8080-{id}.sandbox.recoder.xyz/...`
- Slides render in iframe with `srcdoc` or direct URL to the API endpoint

---

## Layer 3: Frontend Error Resilience

### Files to fix (each API call that throws on error):

1. **`src/lib/api/agent-comparison.ts`** — `getAgentLeaderboard()` throws on 500 → return `[]`
2. **`src/lib/api/thread-analytics.ts`** — already fixed but verify deployed
3. **`src/hooks/triggers/use-all-triggers.ts`** — already fixed but verify deployed
4. **`src/lib/api/threads.ts`** — `getArchivedThreads()` if it exists, handle 404

### Pattern for each fix:
```typescript
// Before (crashes):
if (response.error) throw new Error(response.error.message);
return response.data!;

// After (graceful):
try {
  const response = await backendApi.get(url, { showErrors: false });
  if (response.error) return [];
  return response.data ?? [];
} catch {
  return [];
}
```

---

## Files to Create

1. `backend/core/sandbox/daytona_file_service.py` — new
2. `docker-backend/src/daytona-file-service.ts` — new (or refactor existing)

## Files to Modify

### Backend (Python):
3. `backend/core/sandbox/sandbox.py` — remove monkey-patch, import DaytonaFileService
4. `backend/core/tools/sb_presentation_tool.py` — use DaytonaFileService
5. `backend/core/tools/sb_files_tool.py` — use DaytonaFileService
6. `backend/core/sandbox/api.py` — add file content proxy endpoint, use DaytonaFileService
7. `backend/core/files/upload_handler.py` — use DaytonaFileService

### Frontend (agents):
8. `recoder-agents/src/lib/api/agent-comparison.ts` — graceful error handling
9. `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationSlidePreview.tsx` — use API proxy for slides
10. `recoder-agents/src/lib/utils/url.ts` — update constructHtmlPreviewUrl for API proxy

### Docker-backend (web):
11. `docker-backend/src/daytona-file-service.ts` — new or refactored
12. `docker-backend/src/server.ts` — use new file service

---

## Deployment Steps

1. Deploy backend changes (Python) — `pm2 restart recoder-backend`
2. Deploy agents frontend — rebuild Next.js + `pm2 restart recoder-agents`
3. Deploy docker-backend — rebuild Docker image + recreate container
4. Verify on production: create presentation, create code project, check dashboard

---

## Out of Scope

- Web live preview (dev server management + sandbox URL debugging)
- Computer use / VNC (needs full Daytona snapshot)
- Image generation (needs provider configuration)
- PM/Agency fixes (separate deployment)
- OpenClaw channels (needs external credentials)
