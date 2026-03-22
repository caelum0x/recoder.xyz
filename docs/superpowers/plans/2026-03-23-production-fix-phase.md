# Production Fix Phase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agents.recoder.xyz file tools work (slides, coding, data, docs, images) and stop dashboard crashes.

**Architecture:** Three layers — DaytonaFileService for reliable file I/O, File Content Proxy API for serving sandbox files through the backend, and frontend error resilience to stop crashes. Image generation via OpenRouter.

**Tech Stack:** Python/FastAPI (backend), httpx (HTTP client), Next.js/React (frontend), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-production-fix-phase-design.md`

---

### Task 1: Create DaytonaFileService

**Files:**
- Create: `backend/core/sandbox/daytona_file_service.py`

- [ ] **Step 1: Create DaytonaFileService class**

```python
# backend/core/sandbox/daytona_file_service.py
import httpx
import io
import os
import asyncio
from typing import Optional
from core.utils.logger import logger
from core.utils.config import config


class DaytonaFileService:
    """Direct HTTP integration with Daytona toolbox API.
    Bypasses the broken SDK upload_file() method.
    Uses bracket notation and explicit auth header."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        proxy_url: str = "http://localhost:4000",
        max_retries: int = 3,
        timeout: int = 30,
    ):
        self.api_key = api_key or config.DAYTONA_API_KEY
        self.proxy_url = proxy_url.rstrip("/")
        self.max_retries = max_retries
        self.timeout = timeout

    def _toolbox_url(self, sandbox_id: str, path: str) -> str:
        return f"{self.proxy_url}/toolbox/{sandbox_id}/{path.lstrip('/')}"

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> bool:
        """Write a single file to the sandbox. Returns True on success."""
        return await self.write_files(sandbox_id, [(path, content)])

    async def write_files(self, sandbox_id: str, files: list[tuple[str, bytes]]) -> bool:
        """Write multiple files to the sandbox in a single batch. Returns True on success."""
        url = self._toolbox_url(sandbox_id, "files/bulk-upload")

        data_fields = {}
        file_fields = {}
        for i, (path, content) in enumerate(files):
            data_fields[f"files[{i}][path]"] = path
            fname = os.path.basename(path) or "file"
            file_fields[f"files[{i}][file]"] = (fname, io.BytesIO(content))

        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        url,
                        data=data_fields,
                        files=file_fields,
                        headers=self._auth_headers(),
                    )
                    if response.status_code == 200:
                        return True
                    logger.warning(
                        f"[DaytonaFileService] write_files attempt {attempt+1} failed: "
                        f"{response.status_code} {response.text[:200]}"
                    )
            except Exception as e:
                logger.warning(f"[DaytonaFileService] write_files attempt {attempt+1} error: {e}")

            if attempt < self.max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                # Re-create BytesIO objects for retry
                for i, (path, content) in enumerate(files):
                    fname = os.path.basename(path) or "file"
                    file_fields[f"files[{i}][file]"] = (fname, io.BytesIO(content))

        logger.error(f"[DaytonaFileService] write_files failed after {self.max_retries} retries")
        return False

    async def read_file(self, sandbox_id: str, path: str) -> Optional[bytes]:
        """Read a file from the sandbox. Returns None on failure."""
        url = self._toolbox_url(sandbox_id, f"files?path={path}")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=self._auth_headers())
                if response.status_code == 200:
                    return response.content
                logger.warning(f"[DaytonaFileService] read_file failed: {response.status_code}")
                return None
        except Exception as e:
            logger.warning(f"[DaytonaFileService] read_file error: {e}")
            return None

    async def create_folder(self, sandbox_id: str, path: str) -> bool:
        """Create a folder in the sandbox."""
        url = self._toolbox_url(sandbox_id, "files/folder")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    json={"path": path, "mode": "755"},
                    headers=self._auth_headers(),
                )
                return response.status_code in (200, 201)
        except Exception as e:
            logger.warning(f"[DaytonaFileService] create_folder error: {e}")
            return False


# Singleton instance
_file_service: Optional[DaytonaFileService] = None

def get_file_service() -> DaytonaFileService:
    global _file_service
    if _file_service is None:
        _file_service = DaytonaFileService()
    return _file_service
```

- [ ] **Step 2: Verify the service works by testing on server**

SSH into server, run:
```bash
cd /root/recoder.xyz/backend
.venv/bin/python3 -c "
import asyncio
from core.sandbox.daytona_file_service import get_file_service

async def test():
    fs = get_file_service()
    # Use a known started sandbox ID
    result = await fs.write_file('SANDBOX_ID', '/home/daytona/test-service.txt', b'DaytonaFileService works')
    print('Write:', result)
    content = await fs.read_file('SANDBOX_ID', '/home/daytona/test-service.txt')
    print('Read:', content)

asyncio.run(test())
"
```

- [ ] **Step 3: Commit**

```bash
git add backend/core/sandbox/daytona_file_service.py
git commit -m "feat: add DaytonaFileService for direct toolbox API integration"
```

---

### Task 2: Integrate DaytonaFileService into SandboxToolsBase

**Files:**
- Modify: `backend/core/sandbox/tool_base.py:14-53`
- Modify: `backend/core/sandbox/sandbox.py:34-73` (remove monkey-patch)
- Modify: `backend/core/sandbox/sandbox.py:125-143` (remove start_file_server)

- [ ] **Step 1: Add file_service to SandboxToolsBase**

In `backend/core/sandbox/tool_base.py`, add to `__init__`:
```python
from core.sandbox.daytona_file_service import get_file_service

class SandboxToolsBase(Tool):
    def __init__(self, project_id: str, thread_manager=None):
        super().__init__()
        self.project_id = project_id
        self.thread_manager = thread_manager
        self.workspace_path = "/workspace"
        self._sandbox_info = None
        self.file_service = get_file_service()  # ADD THIS LINE
```

- [ ] **Step 2: Add helper method for sandbox-aware file writes**

Add to `SandboxToolsBase` class:
```python
    async def write_file(self, path: str, content: bytes) -> bool:
        """Write file to sandbox using DaytonaFileService."""
        await self._ensure_sandbox()
        return await self.file_service.write_file(self._sandbox_info.sandbox_id, path, content)

    async def read_file(self, path: str) -> Optional[bytes]:
        """Read file from sandbox using DaytonaFileService."""
        await self._ensure_sandbox()
        return await self.file_service.read_file(self._sandbox_info.sandbox_id, path)
```

- [ ] **Step 3: Remove monkey-patch from sandbox.py**

In `backend/core/sandbox/sandbox.py`:
- Delete `_patch_sandbox_upload_auth()` function (lines 34-73)
- Delete `start_file_server()` function (lines 125-143)
- Remove `_patch_sandbox_upload_auth(sandbox)` calls at lines 103 and 197
- Remove `await start_file_server(sandbox)` calls at lines 105 and 199

- [ ] **Step 4: Commit**

```bash
git add backend/core/sandbox/tool_base.py backend/core/sandbox/sandbox.py
git commit -m "feat: integrate DaytonaFileService into SandboxToolsBase, remove monkey-patch"
```

---

### Task 3: Migrate Tool upload_file Calls

**Files to modify (replace `self.sandbox.fs.upload_file(content, path)` with `await self.write_file(path, content)`):**

Note: parameter order changes — DaytonaFileService takes `(path, content)`, SDK took `(content, path)`.

- [ ] **Step 1: Migrate sb_presentation_tool.py**

File: `backend/core/tools/sb_presentation_tool.py`
Lines: 411, 475, 937, 1458

Replace pattern:
```python
# Before:
await self.sandbox.fs.upload_file(content.encode(), path)
# After:
await self.write_file(path, content.encode())
```

- [ ] **Step 2: Migrate sb_files_tool.py**

File: `backend/core/tools/sb_files_tool.py`
Lines: 201, 282, 330, 581, 668, 672

Same pattern replacement.

- [ ] **Step 3: Migrate sb_image_edit_tool.py**

File: `backend/core/tools/sb_image_edit_tool.py`
Lines: 611, 744, 811, 876, 979, 1003, 1159

Same pattern replacement.

- [ ] **Step 4: Migrate remaining tools**

Files:
- `backend/core/tools/sb_canvas_tool.py` — lines 203, 1183
- `backend/core/tools/sb_code_interpreter_tool.py` — lines 238, 253
- `backend/core/tools/sb_kb_tool.py` — line 453
- `backend/core/tools/sb_designer_tool.py` — line 384
- `backend/core/tools/sb_vision_tool.py` — line 413
- `backend/core/tools/apify_tool.py` — line 2044

Same pattern replacement.

- [ ] **Step 5: Migrate sandbox/api.py upload calls**

File: `backend/core/sandbox/api.py`
Replace `sandbox.fs.upload_file()` calls with `get_file_service().write_file()`.

- [ ] **Step 6: Migrate files/upload_handler.py**

File: `backend/core/files/upload_handler.py` — line 112
Replace `sandbox_info.sandbox.fs.upload_file()` with `get_file_service().write_file()`.

- [ ] **Step 7: Commit**

```bash
git add backend/core/tools/ backend/core/sandbox/api.py backend/core/files/upload_handler.py
git commit -m "feat: migrate all tools from SDK upload_file to DaytonaFileService"
```

---

### Task 4: File Content Proxy API

**Files:**
- Modify: `backend/core/sandbox/api.py` — add new endpoint

- [ ] **Step 1: Add file content proxy endpoint**

Add to `backend/core/sandbox/api.py`:
```python
import mimetypes
from pathlib import PurePosixPath

ALLOWED_EXTENSIONS = {'.html', '.json', '.css', '.js', '.ts', '.tsx', '.jsx',
                      '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp',
                      '.pdf', '.md', '.txt', '.xml', '.csv'}

@router.get("/sandboxes/{sandbox_id}/files/content")
async def get_sandbox_file_content(
    sandbox_id: str,
    path: str = Query(..., description="File path in sandbox"),
    request: Request = None,
):
    """Serve sandbox file content through the API. Used for presentation previews."""
    # Auth: verify user owns this sandbox
    user_id = await verify_and_get_user_id_from_jwt(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Path traversal protection
    normalized = str(PurePosixPath(path))
    if ".." in normalized:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not normalized.startswith("/home/daytona"):
        # Allow relative paths — prepend workspace root
        normalized = f"/home/daytona/{normalized.lstrip('/')}"

    # Extension check
    ext = PurePosixPath(normalized).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")

    # Read file
    from core.sandbox.daytona_file_service import get_file_service
    content = await get_file_service().read_file(sandbox_id, normalized)
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")

    # MIME type
    mime_type, _ = mimetypes.guess_type(normalized)
    if mime_type is None:
        mime_type = "application/octet-stream"

    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Access-Control-Allow-Origin": "https://agents.recoder.xyz",
            "Cache-Control": "no-cache",
        },
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/core/sandbox/api.py
git commit -m "feat: add file content proxy API for serving sandbox files"
```

---

### Task 5: Update Frontend Presentation Components

**Files:**
- Modify: `recoder-agents/src/lib/utils/url.ts`
- Modify: `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationSlidePreview.tsx`
- Modify: `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationSlideCard.tsx`
- Modify: `recoder-agents/src/components/thread/tool-views/presentation-tools/PresentationViewer.tsx`
- Modify: `recoder-agents/src/components/thread/tool-views/presentation-tools/FullScreenPresentationViewer.tsx`

- [ ] **Step 1: Add API proxy URL builder to url.ts**

Add new function to `recoder-agents/src/lib/utils/url.ts`:
```typescript
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.recoder.xyz/v1';

/**
 * Build a URL to serve sandbox file content through the backend API proxy.
 * Replaces direct sandbox URL access (which is unreachable from browser).
 */
export function buildSandboxFileUrl(
  sandboxId: string | undefined,
  filePath: string | undefined,
): string | undefined {
  if (!sandboxId || !filePath) return undefined;

  let processedPath = filePath;
  // Remove /workspace/ prefix
  processedPath = processedPath.replace(/^\/workspace\//, '');
  // Ensure path starts with /home/daytona/
  if (!processedPath.startsWith('/home/daytona/')) {
    processedPath = `/home/daytona/${processedPath}`;
  }

  return `${BACKEND_URL}/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(processedPath)}`;
}
```

- [ ] **Step 2: Update PresentationSlidePreview.tsx**

Line 66-69: Replace `constructHtmlPreviewUrl(project.sandbox.sandbox_url, ...)` with `buildSandboxFileUrl(project.sandbox.id, ...)`.

- [ ] **Step 3: Update PresentationSlideCard.tsx**

Line 38: Replace `constructHtmlPreviewUrl(project.sandbox.sandbox_url, slide.file_path)` with `buildSandboxFileUrl(project.sandbox.id, slide.file_path)`.

- [ ] **Step 4: Update PresentationViewer.tsx**

Lines 307-310, 484-487: Replace metadata URL construction with `buildSandboxFileUrl()`.

- [ ] **Step 5: Update FullScreenPresentationViewer.tsx**

Lines 115-118, 380: Replace with `buildSandboxFileUrl()`.

- [ ] **Step 6: Commit**

```bash
git add recoder-agents/src/lib/utils/url.ts recoder-agents/src/components/thread/tool-views/presentation-tools/
git commit -m "feat: route presentation previews through backend API proxy"
```

---

### Task 6: Frontend Error Resilience

**Files:**
- Modify: `recoder-agents/src/lib/api/agent-comparison.ts`

- [ ] **Step 1: Fix all throwing functions in agent-comparison.ts**

Replace the throw pattern in these functions (lines 74-183):
- `compareAgents()` (line 79)
- `createComparison()` (line 117)
- `listSavedComparisons()` (line 131)
- `getComparison()` (line 145)
- `deleteComparison()` (line 161)
- `liveCompare()` (line 179)

Pattern for each:
```typescript
// Before:
if (response.error) throw new Error(response.error.message);
return response.data!;

// After:
if (response.error) {
  console.warn('API error:', response.error.message);
  return fallbackValue; // [] for lists, null for single items
}
return response.data ?? fallbackValue;
```

Wrap each function body in try/catch returning the fallback.

- [ ] **Step 2: Commit**

```bash
git add recoder-agents/src/lib/api/agent-comparison.ts
git commit -m "fix: graceful error handling for agent comparison API calls"
```

---

### Task 7: Image Generation via OpenRouter

**Files:**
- Modify: `backend/core/tools/sb_image_edit_tool.py` (or relevant image tool)
- Modify: `backend/core/utils/config.py` (if needed)

- [ ] **Step 1: Research OpenRouter image generation models**

Check OpenRouter docs for image generation endpoints. Likely models:
- `openai/dall-e-3` via OpenRouter
- `stability/stable-diffusion-xl` via OpenRouter
- Other image-capable models

- [ ] **Step 2: Configure image generation to use OpenRouter**

Update the image generation tool to use the existing `OPENROUTER_API_KEY` for image generation requests. The exact implementation depends on which OpenRouter models support image generation.

- [ ] **Step 3: Commit**

```bash
git add backend/core/tools/
git commit -m "feat: configure image generation via OpenRouter"
```

---

### Task 8: Deploy to Production

- [ ] **Step 1: Push all changes to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Deploy backend (Python)**

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz
git pull origin main
pm2 restart recoder-backend
```

- [ ] **Step 3: Deploy agents frontend**

```bash
# Stop PM/Agency to free RAM for build
pm2 stop recoder-pm recoder-agency

cd /root/recoder.xyz/recoder-agents
NODE_OPTIONS='--max-old-space-size=8192' npx next build

# Copy Prisma engine
cp /root/recoder.xyz/packages/auth/prisma/auth-client/libquery_engine-debian-openssl-3.0.x.so.node prisma/auth-client/
cp /root/recoder.xyz/packages/auth/prisma/auth-client/libquery_engine-debian-openssl-3.0.x.so.node .next/server/

# Restart all
pm2 restart recoder-agents recoder-pm recoder-agency
```

- [ ] **Step 4: Verify on production**

Test these on agents.recoder.xyz:
1. Dashboard loads without crash
2. Create a presentation — slides should show content (not blank)
3. Ask agent to write code — files should be created
4. Web search still works
5. Image generation works (if OpenRouter supports it)

---

### Task 9: Verify and Fix Remaining Issues

- [ ] **Step 1: Check PM and Agency are running**

```bash
pm2 status
# If PM or Agency are down, check logs:
pm2 logs recoder-pm --lines 20 --nostream
pm2 logs recoder-agency --lines 20 --nostream
```

- [ ] **Step 2: Hard refresh browser**

After deployment, do Ctrl+Shift+R on agents.recoder.xyz to load new JS bundles.

- [ ] **Step 3: Document any remaining issues in plan.md**
