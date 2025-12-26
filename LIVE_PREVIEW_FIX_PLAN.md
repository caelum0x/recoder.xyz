# Live Preview Fix Plan - Comprehensive Diagnosis & Solution

## 🔴 Problem Summary

**Symptom**: Live preview shows blank white page after AI generates code
**User Impact**: Users cannot see their generated UI - CRITICAL for Bolt-like experience
**Status**: BROKEN - Must be fixed immediately

---

## 🔍 Root Cause Analysis

### The Complete Error Flow

1. ✅ **Files created successfully** (package.json, vite.config.js, src/App.jsx, etc.)
2. ✅ **Auto-install scheduled** (2 second debounce)
3. ✅ **npm install completes** ("added 60 packages")
4. ✅ **npm run dev starts** (Vite dev server)
5. ❌ **Process gets SIGTERM** (exit code 143)
6. ❌ **Dev server dies immediately**
7. ❌ **Preview proxy finds no server** (blank page)

### Technical Root Causes

#### **ROOT CAUSE #1: Shell Actions Don't Use Background Mode**

**Location**: `recoder-web/app/lib/runtime/action-runner.ts:333`

```typescript
// Current Code (BROKEN):
const output = await this.#dockerExec(action.content);
//                                                    ^^^^ No background parameter!
```

**The Problem**:
- When AI generates a shell action: `npm install && npm run dev`
- ActionRunner executes it WITHOUT `background: true`
- Docker exec runs the full command: `npm install && npm run dev`
- npm install completes ✅
- `npm run dev` starts Vite ✅
- But exec is waiting for the command to "finish"
- Vite never finishes (it's a server that runs forever)
- Docker exec times out and sends SIGTERM
- Vite dies with exit code 143 ❌

**Why Auto-Install Works (Partially)**:
- Auto-install runs `npm run dev` with `background: true` (line 693)
- But if AI generates a shell action FIRST, it breaks
- The error log shows a shell action: `npm install && npm run dev`

#### **ROOT CAUSE #2: Exit Code 143 Treated as Failure**

**Location**: `docker-backend/src/server.ts:495-499`

```typescript
// Check exit code
const inspection = await exec.inspect();
if (inspection.ExitCode !== 0 && inspection.ExitCode !== null) {
  throw new Error(`Command failed with exit code ${inspection.ExitCode}: ${output}`);
}
```

**The Problem**:
- Exit code 143 = SIGTERM (process was terminated)
- This is NORMAL for background processes that get killed/replaced
- But the code treats it as an error
- Frontend sees 500 error: `/api/exec/1766686993867:1 Failed to load resource: 500`

#### **ROOT CAUSE #3: No Dev Server Health Verification**

**Location**: `docker-backend/src/server.ts:316-324`

```typescript
// Wait a bit for server to start
await new Promise(resolve => setTimeout(resolve, 3000));

// Check if dev server is actually running
const psOutput = await execCommand(container, `ps aux | grep -E "vite|next|node" | grep -v grep || echo "No processes found"`);
console.log(`📊 Dev server processes:\n${psOutput}`);

return res.json({ output: 'Started in background', background: true, processes: psOutput });
```

**The Problem**:
- Code waits 3 seconds and checks `ps aux` (process list)
- But doesn't verify if the HTTP server is actually RESPONDING
- Process might be starting but not ready yet
- Preview proxy will fail if it checks too early

#### **ROOT CAUSE #4: Preview Proxy No Retry Logic**

**Location**: `docker-backend/src/preview.ts:38-55`

```typescript
// Check ports in order: Vite (5173), Next.js (3000), Other (8080)
const basePorts = [entry.port + 1, entry.port, entry.port + 2];
let targetPort = 0;

for (const port of basePorts) {
  if (await checkPort(port)) {
    targetPort = port;
    break;
  }
}

if (!targetPort) {
  console.log(`❌ No dev server found on any port for ${projectId}`);
  return res.status(204).end(); // ❌ Gives up immediately!
}
```

**The Problem**:
- Single attempt to detect port
- If dev server is still starting up, returns 204 (No Content)
- Frontend shows blank white page
- No retry mechanism

---

## 🔧 Solution Architecture

### Fix #1: Auto-Detect Dev Servers in Shell Actions

**File**: `recoder-web/app/lib/runtime/action-runner.ts`

**Changes**:

```typescript
async #runShellAction(action: ActionState) {
  // ... existing code ...

  const normalizedContent = action.content.replace(/\n/g, ' ').toLowerCase();

  // 🔧 FIX: Detect if this command includes a dev server
  const hasDevServer = /npm (run )?dev|yarn dev|pnpm dev|vite|next dev|remix dev|npm start/.test(normalizedContent);
  const hasInstallAndDev = /npm\s+(install|i)\b.*&&.*dev/.test(normalizedContent);

  // If command has "npm install && npm run dev", split it
  if (hasInstallAndDev) {
    logger.info('🔀 Detected install+dev combo, splitting into separate commands');

    // Extract install part
    const installMatch = action.content.match(/(npm|yarn|pnpm)\s+(install|i)(\s+[^&]*)?/);
    if (installMatch) {
      const installCmd = installMatch[0];
      logger.info('📦 Running install first:', installCmd);
      await this.#dockerExec(installCmd); // Synchronous install
    }

    // Extract dev part
    const devMatch = action.content.match(/(npm|yarn|pnpm)\s+(run\s+)?dev/);
    if (devMatch) {
      const devCmd = devMatch[0];
      logger.info('🚀 Starting dev server in background:', devCmd);
      await this.#dockerExec(devCmd, '/workspace', true); // ✅ Background mode!
      logger.info('Dev server started in background');
      return;
    }
  }

  // If just a dev server command, run in background
  if (hasDevServer && !action.content.includes('&&')) {
    logger.info('🚀 Running dev server in background mode');
    await this.#dockerExec(action.content, '/workspace', true);
    logger.info('Dev server started in background');
    return;
  }

  // Otherwise run normally
  const output = await this.#dockerExec(action.content);
  // ... rest of code ...
}
```

### Fix #2: Graceful Exit Code Handling

**File**: `docker-backend/src/server.ts`

**Changes**:

```typescript
async function execCommand(container: Docker.Container, cmd: string, allowTermination = false): Promise<string> {
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const output = await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk: Buffer) => {
      out += chunk.slice(8).toString();
    });
    stream.on('end', () => resolve(out.trim()));
    stream.on('error', reject);
  });

  // Check exit code
  const inspection = await exec.inspect();

  // 🔧 FIX: Exit code 143 (SIGTERM) is OK if explicitly allowed
  if (inspection.ExitCode === 143 && allowTermination) {
    return output; // ✅ Normal for background processes
  }

  if (inspection.ExitCode !== 0 && inspection.ExitCode !== null) {
    throw new Error(`Command failed with exit code ${inspection.ExitCode}: ${output}`);
  }

  return output;
}

// Update callers that kill processes:
app.post('/api/exec/:projectId', async (req, res) => {
  // ...
  if (background) {
    // Kill existing - exit code 143 is expected here
    await execCommand(container, `pkill -f "npm run dev|vite|next dev" || true`, true).catch(() => {});
    // ... rest ...
  }
});
```

### Fix #3: Dev Server Health Check

**File**: `docker-backend/src/server.ts`

**Add New Function**:

```typescript
async function waitForDevServer(port: number, maxWaitMs = 30000): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await new Promise<boolean>((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}`, { timeout: 1000 }, (res) => {
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });

      if (res) {
        console.log(`✅ Dev server responding on port ${port}`);
        return true;
      }
    } catch {}

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  return false;
}
```

**Update Background Execution**:

```typescript
if (background) {
  // Kill existing
  await execCommand(container, `pkill -f "npm run dev|vite|next dev" || true`, true).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start new process
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', `cd "${cwd}" && nohup ${command} > /tmp/dev.log 2>&1 &`],
    AttachStdout: true,
    AttachStderr: true,
  });
  await exec.start({});

  // 🔧 FIX: Wait for dev server to actually respond
  const portsToCheck = [port + 1, port, port + 2]; // Vite, Next, Other
  let serverReady = false;

  for (const checkPort of portsToCheck) {
    if (await waitForDevServer(checkPort, 15000)) { // 15 second timeout
      serverReady = true;
      console.log(`✅ Dev server verified on port ${checkPort}`);
      break;
    }
  }

  if (!serverReady) {
    console.warn('⚠️ Dev server started but not responding yet. May need more time to build.');
  }

  return res.json({
    output: 'Started in background',
    background: true,
    ready: serverReady
  });
}
```

### Fix #4: Preview Retry with Exponential Backoff

**File**: `recoder-web/app/components/workbench/Preview.tsx`

**Add Retry Logic**:

```typescript
const PreviewComponent = () => {
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const maxRetries = 12; // 12 retries = ~30 seconds total

  const handleIframeLoad = () => {
    setIsLoading(false);
    setRetryCount(0);
  };

  const handleIframeError = () => {
    if (retryCount < maxRetries) {
      // Exponential backoff: 1s, 2s, 4s, 8s, then 5s repeatedly
      const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        // Force iframe reload by updating key
      }, delay);
    } else {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isLoading && (
        <div className="preview-loading">
          <div className="spinner" />
          <p>Starting dev server... ({retryCount}/{maxRetries})</p>
        </div>
      )}
      <iframe
        key={retryCount} // Force reload on retry
        src={previewUrl}
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
    </>
  );
};
```

### Fix #5: Better Error Messaging

**File**: `recoder-web/app/lib/stores/previews.ts`

**Add Preview Status**:

```typescript
export interface PreviewInfo {
  url: string;
  status: 'initializing' | 'starting' | 'building' | 'ready' | 'error';
  port?: number;
  lastCheck?: number;
  error?: string;
}

// Poll preview health
async function pollPreviewHealth(projectId: string) {
  try {
    const res = await fetch(`${DOCKER_URL}/api/preview/${projectId}/health`);
    const data = await res.json();

    const respondingPort = data.ports.find(p => p.responding);

    if (respondingPort) {
      return { status: 'ready', port: respondingPort.port };
    } else {
      return { status: 'building', message: 'Dev server starting...' };
    }
  } catch {
    return { status: 'error', message: 'Preview service unavailable' };
  }
}
```

---

## 📋 Implementation Checklist

### Phase 1: Critical Fixes (Must-Have)
- [ ] **Fix #1**: Auto-detect dev servers in shell actions → Run in background
- [ ] **Fix #2**: Handle exit code 143 gracefully for background processes
- [ ] **Fix #3**: Add dev server health check (verify HTTP response)
- [ ] Test: Generate simple Vite React app, verify preview works

### Phase 2: Reliability Improvements (Should-Have)
- [ ] **Fix #4**: Add preview retry logic with exponential backoff
- [ ] **Fix #5**: Better preview status messaging
- [ ] Test: Multiple projects, verify no port conflicts
- [ ] Test: Kill and restart dev server, verify recovery

### Phase 3: Edge Cases (Nice-to-Have)
- [ ] Handle different frameworks (Next.js, Remix, etc.)
- [ ] Add preview timeout for projects that never respond
- [ ] Implement preview caching to remember last good port
- [ ] Add manual "Restart Preview" button in UI

---

## 🧪 Test Plan

### Test Case 1: Simple Vite React App
```
User Prompt: "Create a simple React counter app with Vite"

Expected Flow:
1. AI generates files (package.json, vite.config.js, src/App.jsx)
2. AI includes shell action: `npm install && npm run dev`
3. ActionRunner splits into: `npm install` (sync) + `npm run dev` (background)
4. Preview waits for port 5173 to respond (max 15s)
5. Preview iframe loads successfully
6. User sees counter app ✅

Success Criteria:
- No exit code 143 errors
- Preview visible within 20 seconds
- Dev server keeps running (check after 60s)
```

### Test Case 2: Next.js App
```
User Prompt: "Build a Next.js landing page with Tailwind"

Expected Flow:
1. Files generated
2. `npm install && npm run dev` executed
3. Preview detects port 3000 (Next.js default)
4. Preview shows landing page ✅

Success Criteria:
- Correct port detection (3000, not 5173)
- Hot reload works when editing files
```

### Test Case 3: Port Conflict Recovery
```
Scenario: User stops and restarts dev server manually

Steps:
1. Generate app successfully
2. User runs `pkill -f vite` in terminal
3. User runs `npm run dev` again
4. Preview should recover automatically

Success Criteria:
- Preview reconnects after restart
- No manual refresh needed
```

---

## 🚨 Risks & Mitigations

### Risk 1: Background Processes Leak
**Mitigation**: Existing cleanup logic kills old dev servers before starting new ones

### Risk 2: Health Check Takes Too Long
**Mitigation**: 15 second timeout, non-blocking, returns "building" status

### Risk 3: Multiple Dev Server Starts
**Mitigation**: Auto-install flag prevents duplicate runs

### Risk 4: Preview Retry Hammers Server
**Mitigation**: Exponential backoff (max 5 second intervals)

---

## 📊 Success Metrics

### Before Fix
- ❌ Preview success rate: ~0% (blank white page)
- ❌ User satisfaction: CRITICAL issue

### After Fix (Target)
- ✅ Preview success rate: >95%
- ✅ Average time to preview: <20 seconds
- ✅ Exit code 143 errors: 0 (treated as normal)
- ✅ User sees loading indicators instead of blank page

---

## 🎯 Priority Level: **P0 - CRITICAL**

This fix is CRITICAL because:
1. Live preview is the #1 feature for Bolt-like experience
2. Without working preview, users cannot verify generated code
3. Current state: 100% broken for all projects
4. Impacts: User trust, demo success, product viability

**Recommendation**: Implement Phase 1 fixes IMMEDIATELY, then iterate on Phase 2/3.
