"use strict";
/**
 * Daytona File Operations Bridge
 *
 * Provides file I/O, exec, and workspace helpers that route through
 * the Daytona toolbox proxy instead of Docker.  Used by server.ts
 * whenever a container entry has `daytona: true`.
 *
 * All operations delegate to DaytonaClient (daytona-client.ts) which
 * already handles auth, base64 wrapping, and toolbox URL discovery.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDaytonaSandbox = isDaytonaSandbox;
exports.buildDaytonaDevServerSessionId = buildDaytonaDevServerSessionId;
exports.buildDaytonaDevServerCleanupCommand = buildDaytonaDevServerCleanupCommand;
exports.cleanupDaytonaDevServerProcesses = cleanupDaytonaDevServerProcesses;
exports.daytonaWriteFile = daytonaWriteFile;
exports.daytonaWriteFiles = daytonaWriteFiles;
exports.daytonaReadFile = daytonaReadFile;
exports.daytonaDeleteFile = daytonaDeleteFile;
exports.daytonaRenameFile = daytonaRenameFile;
exports.daytonaCreateFolder = daytonaCreateFolder;
exports.daytonaListFiles = daytonaListFiles;
exports.daytonaExec = daytonaExec;
exports.daytonaExecBackground = daytonaExecBackground;
exports.daytonaGetWorkspaceState = daytonaGetWorkspaceState;
exports.ensureDaytonaSandboxRunning = ensureDaytonaSandboxRunning;
exports.daytonaDeleteSandbox = daytonaDeleteSandbox;
exports.daytonaGetLogs = daytonaGetLogs;
const daytona_client_js_1 = require("./daytona-client.js");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('daytona-file-ops');
const DAYTONA_DEV_SERVER_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 3000, 3001, 4173, 4174, 8080, 8081];
function looksLikeDirectoryListing(body, contentType) {
    if (!contentType.includes('text/html')) {
        return false;
    }
    const normalized = body.toLowerCase();
    return (normalized.includes('<title>index of /') ||
        normalized.includes('<h1>index of /') ||
        normalized.includes('<title>directory listing for /') ||
        normalized.includes('<h1>directory listing for /') ||
        normalized.includes('<pre><a href="../">../</a>') ||
        normalized.includes('package.json</a>') ||
        normalized.includes('node_modules/</a>') ||
        normalized.includes('src/</a>') ||
        normalized.includes('public/</a>'));
}
/**
 * Check whether a container entry represents a Daytona sandbox.
 */
function isDaytonaSandbox(entry) {
    return !!(entry && entry.daytona === true);
}
function buildDaytonaDevServerSessionId(projectId) {
    return `dev-server-${projectId}`;
}
function buildDaytonaDevServerCleanupCommand() {
    const ports = DAYTONA_DEV_SERVER_PORTS.join(' ');
    return `
kill -9 $(cat /tmp/dev.pid 2>/dev/null) 2>/dev/null || true
for p in ${ports}; do
  {
    if command -v lsof >/dev/null 2>&1; then
      lsof -tiTCP:$p -sTCP:LISTEN 2>/dev/null || true
    elif command -v ss >/dev/null 2>&1; then
      ss -ltnp "( sport = :$p )" 2>/dev/null | sed -n 's/.*pid=\\([0-9]\\+\\).*/\\1/p' || true
    elif command -v netstat >/dev/null 2>&1; then
      netstat -ltnp 2>/dev/null | awk '$4 ~ /:'"$p"'$/ {print $7}' | cut -d/ -f1 || true
    elif command -v fuser >/dev/null 2>&1; then
      fuser -n tcp $p 2>/dev/null || true
    fi
  } | tr ' ' '\\n' | awk '/^[0-9]+$/' | while read -r pid; do
    kill -9 "$pid" 2>/dev/null || true
  done
done
pkill -9 -f 'node|npm|vite|next|react-scripts|expo|metro' 2>/dev/null || true
rm -f /tmp/dev.pid
: > /tmp/dev.log
sleep 1
true`.trim();
}
async function cleanupDaytonaDevServerProcesses(sandboxId, projectId) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    if (projectId) {
        await dc.deleteSession(sandboxId, buildDaytonaDevServerSessionId(projectId));
    }
    await dc.execCommand(sandboxId, buildDaytonaDevServerCleanupCommand(), { timeoutSecs: 15 });
}
// ── Auto-wake helper ──
// All file operations must wake stopped sandboxes before proceeding.
// Without this, file reads/writes fail silently after Daytona's auto-stop
// timer expires (30 min for Python sandboxes, 12h for docker-backend ones).
async function ensureRunningBeforeOp(sandboxId) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        const sandbox = await dc.getSandbox(sandboxId);
        if (sandbox.state === 'started' || sandbox.state === 'running')
            return;
        logger.info({ sandboxId: sandboxId.slice(0, 12), state: sandbox.state }, 'Daytona: sandbox stopped, auto-waking for file op');
        const result = await ensureDaytonaSandboxRunning(sandboxId);
        if (!result.running) {
            throw new Error(`Sandbox ${sandboxId} could not be woken: ${result.error ?? 'unknown'}`);
        }
    }
    catch (err) {
        // If getSandbox itself fails (network issue), let the caller retry
        if (err.message?.includes('could not be woken'))
            throw err;
        logger.debug({ sandboxId: sandboxId.slice(0, 12), err: err.message }, 'Daytona: pre-op sandbox check failed (will retry in op)');
    }
}
// ── File operations ──
// These operations use the native Toolbox filesystem API via DaytonaClient,
// which automatically falls back to exec-based commands if native endpoints fail.
// All operations call ensureRunningBeforeOp() first to auto-wake stopped sandboxes.
/**
 * Write a file into a Daytona sandbox.
 * The file path should be relative to /home/daytona (e.g. "src/App.tsx").
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaWriteFile(sandboxId, relativePath, content) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const fullPath = `/home/daytona/${relativePath}`;
    logger.info({ sandboxId: sandboxId.slice(0, 12), path: relativePath }, 'Daytona: writing file');
    // Retry up to 3 times with backoff for transient Daytona API failures
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await dc.uploadFile(sandboxId, fullPath, content);
            return;
        }
        catch (err) {
            lastError = err;
            logger.warn({ sandboxId: sandboxId.slice(0, 12), path: relativePath, attempt, error: err.message }, 'Daytona: file write attempt failed');
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, attempt * 500));
            }
        }
    }
    throw lastError;
}
/**
 * Write multiple files into a Daytona sandbox in parallel batches.
 * Uses the native Toolbox filesystem API with exec-based fallback per file.
 */
async function daytonaWriteFiles(sandboxId, files) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const failed = [];
    const BATCH = 10;
    for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map(f => dc.uploadFile(sandboxId, `/home/daytona/${f.path}`, f.content)));
        results.forEach((r, idx) => {
            if (r.status === 'rejected') {
                failed.push({ path: batch[idx].path, error: r.reason?.message || 'write failed' });
            }
        });
    }
    return { failed };
}
/**
 * Read a file from a Daytona sandbox.
 * Returns the file content as a string.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaReadFile(sandboxId, relativePath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const fullPath = `/home/daytona/${relativePath}`;
    return dc.downloadFile(sandboxId, fullPath);
}
/**
 * Delete a file or directory from a Daytona sandbox.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaDeleteFile(sandboxId, relativePath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const fullPath = `/home/daytona/${relativePath}`;
    try {
        await dc.deleteFileNative(sandboxId, fullPath);
    }
    catch (nativeErr) {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), path: relativePath, error: nativeErr.message }, 'Native filesystem delete failed, falling back to exec-based delete');
        await dc.execCommand(sandboxId, `rm -rf '/home/daytona/${relativePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
    }
}
/**
 * Rename/move a file inside a Daytona sandbox.
 * Uses native mkdir for the target directory, then exec for the mv operation.
 */
async function daytonaRenameFile(sandboxId, oldRelPath, newRelPath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const dir = newRelPath.substring(0, newRelPath.lastIndexOf('/'));
    // Create target directory via native API with exec fallback
    if (dir) {
        try {
            await dc.createDirectoryNative(sandboxId, `/home/daytona/${dir}`);
        }
        catch {
            await dc.execCommand(sandboxId, `mkdir -p '/home/daytona/${dir.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
        }
    }
    // mv still requires exec — no native rename/move endpoint
    await dc.execCommand(sandboxId, `mv '/home/daytona/${oldRelPath.replace(/'/g, "'\\''")}' '/home/daytona/${newRelPath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
}
/**
 * Create a directory inside a Daytona sandbox.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaCreateFolder(sandboxId, relativePath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        await dc.createDirectoryNative(sandboxId, `/home/daytona/${relativePath}`);
    }
    catch (nativeErr) {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), path: relativePath, error: nativeErr.message }, 'Native filesystem mkdir failed, falling back to exec-based mkdir');
        await dc.execCommand(sandboxId, `mkdir -p '/home/daytona/${relativePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
    }
}
/**
 * List files in a Daytona sandbox directory.
 * Uses the native Toolbox filesystem API, falling back to exec-based find.
 * Returns a list of absolute paths (matching the Docker find-based output).
 */
async function daytonaListFiles(sandboxId, dirPath = '/home/daytona') {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    // Try native filesystem list first
    try {
        const entries = await dc.listFilesNative(sandboxId, dirPath);
        // Convert DaytonaFileInfo entries to absolute paths matching the find-based format
        const absDir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
        return entries.map(e => `${absDir}/${e.name}`);
    }
    catch (nativeErr) {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), dirPath, error: nativeErr.message }, 'Native filesystem list failed, falling back to exec-based find');
        // Fallback to exec-based find — POSIX sh compatible (no grouping parens
        // that break in dash/sh). Two separate finds produce the same result.
        const result = await dc.execCommand(sandboxId, `find '${dirPath}' -maxdepth 2 -type f 2>/dev/null; find '${dirPath}' -maxdepth 2 -type d 2>/dev/null`, { timeoutSecs: 15 });
        return result.output.split('\n').filter(Boolean);
    }
}
// ── Exec operations ──
/**
 * Execute a command in a Daytona sandbox.
 * Returns { output, exitCode }.
 */
async function daytonaExec(sandboxId, command, options) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    return dc.execCommand(sandboxId, command, {
        cwd: options?.cwd,
        timeoutSecs: options?.timeoutSecs ?? 30,
    });
}
/**
 * Execute a background command (like a dev server) in a Daytona sandbox.
 * The process is daemonized with nohup/setsid so it outlives the request.
 */
async function daytonaExecBackground(sandboxId, command, cwd = '/home/daytona', options) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    // Don't escape $ — it breaks $PATH which npm/node need.
    // Only escape backticks to prevent command injection.
    const safeCmd = command.replace(/`/g, '\\`');
    const safeCwd = cwd.replace(/'/g, "'\\''");
    if (!options?.skipCleanup) {
        try {
            await cleanupDaytonaDevServerProcesses(sandboxId, options?.projectId);
        }
        catch {
            // Non-fatal — proceed with starting the new process
        }
    }
    // Use nohup + setsid + disown to keep process alive after exec returns.
    // Write PID to file so we can track it later.
    const wrappedCmd = JSON.stringify(safeCmd);
    const script = [
        `cd '${safeCwd}'`,
        `NODE_BIN="$(command -v node 2>/dev/null || true)"`,
        `if [ -z "$NODE_BIN" ]; then for candidate in /usr/local/nvm/versions/node/*/bin/node /usr/local/bin/node /usr/bin/node; do if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi; done; fi`,
        `if [ -n "$NODE_BIN" ]; then export PATH="$(dirname "$NODE_BIN"):$PATH"; fi`,
        `BROWSER=none nohup setsid sh -lc ${wrappedCmd} > /tmp/dev.log 2>&1 & echo $! > /tmp/dev.pid`,
    ].join(' && ');
    await dc.execCommand(sandboxId, script, { timeoutSecs: 10 });
}
// ── Workspace state ──
/**
 * Get workspace state from a Daytona sandbox (fileCount, hasPackageJson, devServerRunning).
 */
async function daytonaGetWorkspaceState(sandboxId, previewUrl) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    // File count
    let fileCount = 0;
    try {
        const countResult = await dc.execCommand(sandboxId, 'find /home/daytona -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l', { timeoutSecs: 15 });
        fileCount = parseInt(countResult.output.trim(), 10) || 0;
    }
    catch (err) {
        logger.warn({ sandboxId, err }, 'Daytona: file count failed');
    }
    // package.json
    let hasPackageJson = false;
    try {
        const pkgResult = await dc.execCommand(sandboxId, 'test -f /home/daytona/package.json && echo "yes" || echo "no"', { timeoutSecs: 5 });
        hasPackageJson = pkgResult.output.includes('yes');
    }
    catch { }
    // Dev server check — probe the preview URL if available
    let devServerRunning = false;
    if (previewUrl) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const resp = await fetch(previewUrl, { signal: controller.signal, redirect: 'follow' });
            clearTimeout(timeout);
            const contentType = resp.headers.get('content-type') || '';
            const body = await resp.text();
            devServerRunning = resp.status >= 200 && resp.status < 400 && !looksLikeDirectoryListing(body, contentType);
        }
        catch {
            // not running
        }
    }
    // Also try checking via exec (curl localhost inside the sandbox)
    if (!devServerRunning) {
        try {
            const curlResult = await dc.execCommand(sandboxId, 'for p in 5173 5174 5175 5176 5177 5178 3000 3001 8080 8081; do curl -sf http://localhost:$p > /dev/null 2>&1 && echo "200" && exit 0; done; echo "000"', { timeoutSecs: 5 });
            const code = parseInt(curlResult.output.trim(), 10);
            devServerRunning = code > 0 && code < 500;
        }
        catch { }
    }
    return { hasFiles: fileCount > 0, fileCount, hasPackageJson, devServerRunning };
}
// ── Container lifecycle ──
/**
 * Ensure a Daytona sandbox is in a running state.
 * Equivalent to ensureContainerRunning for Docker containers.
 */
async function ensureDaytonaSandboxRunning(sandboxId) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        const initialSandbox = await dc.getSandbox(sandboxId);
        const initialState = initialSandbox.state;
        const sandbox = await dc.getOrStartSandbox(sandboxId, 30000);
        const isRunning = sandbox.state === 'started' || sandbox.state === 'running';
        const wasRestarted = ['stopped', 'archived', 'archiving'].includes(initialState);
        // After restarting a stopped sandbox, all processes (including dev server) are gone.
        // Auto-restart the dev server if package.json exists and has a dev script.
        if (isRunning && wasRestarted) {
            logger.info({ sandboxId }, 'Daytona: sandbox was restarted, checking if dev server needs restart');
            try {
                await dc.execCommand(sandboxId, 'test -L /workspace || ln -sf /home/daytona /workspace', { timeoutSecs: 10 });
                const checkResult = await dc.execCommand(sandboxId, 'test -f /home/daytona/package.json && grep -q \'"dev"\' /home/daytona/package.json && echo HAS_DEV || echo NO_DEV', { timeoutSecs: 5 });
                if (checkResult.output?.includes('HAS_DEV')) {
                    // Check if dev server is already running on any common port
                    const portCheck = await dc.execCommand(sandboxId, 'for p in 5173 5174 5175 5176 5177 5178 3000 3001; do curl -sf http://localhost:$p > /dev/null 2>&1 && echo "FOUND:$p" && exit 0; done; echo "NONE"', { timeoutSecs: 5 });
                    if (portCheck.output?.includes('NONE')) {
                        logger.info({ sandboxId }, 'Daytona: dev server not running after restart, auto-starting');
                        await daytonaExecBackground(sandboxId, 'npm run dev -- --host 0.0.0.0', '/home/daytona');
                    }
                }
            }
            catch (devErr) {
                logger.warn({ sandboxId, err: devErr.message }, 'Daytona: dev server auto-restart failed (non-fatal)');
            }
        }
        return { running: isRunning, restarted: wasRestarted };
    }
    catch (err) {
        logger.error({ sandboxId, err: err.message }, 'Daytona: failed to ensure sandbox running');
        return { running: false, restarted: false, error: err.message };
    }
}
/**
 * Stop and delete a Daytona sandbox.
 */
async function daytonaDeleteSandbox(sandboxId) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        await dc.stopSandbox(sandboxId);
    }
    catch {
        // May already be stopped
    }
    await dc.deleteSandbox(sandboxId);
}
/**
 * Get logs from a Daytona sandbox (dev server logs).
 */
async function daytonaGetLogs(sandboxId, tail = 100) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        const result = await dc.execCommand(sandboxId, `tail -n ${tail} /tmp/dev.log 2>/dev/null || echo "(no dev server logs)"`, { timeoutSecs: 10 });
        return result.output;
    }
    catch (err) {
        return `(failed to fetch logs: ${err.message})`;
    }
}
