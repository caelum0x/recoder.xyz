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
const daytona_runtime_js_1 = require("./daytona-runtime.js");
const logger = (0, logger_js_1.createLogger)('daytona-file-ops');
const DAYTONA_DEV_SERVER_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 3000, 3001, 4173, 4174, 8080, 8081];
const DAYTONA_STATE_CHECK_TIMEOUT_MS = 3000;
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
// ── State check helper ──
// Daytona file operations should fail fast when the sandbox is not already
// running. Do not auto-wake sandboxes as part of ordinary file traffic.
async function ensureRunningBeforeOp(sandboxId) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const sandbox = await Promise.race([
        dc.getSandbox(sandboxId),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out checking sandbox state for ${sandboxId}`)), DAYTONA_STATE_CHECK_TIMEOUT_MS)),
    ]).catch((error) => {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), error: error.message }, 'Daytona: sandbox state check timed out, proceeding with file operation');
        return null;
    });
    if (!sandbox) {
        return;
    }
    if (sandbox.state === 'started' || sandbox.state === 'running') {
        return;
    }
    throw new Error(`Sandbox ${sandboxId} is not running (state: ${sandbox.state})`);
}
async function resolveDaytonaWorkspaceRoot(sandboxId) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        return await dc.getWorkDir(sandboxId);
    }
    catch {
        return daytona_runtime_js_1.DAYTONA_WORKSPACE_ROOT;
    }
}
// ── File operations ──
// These operations use the native Toolbox filesystem API via DaytonaClient,
// which automatically falls back to exec-based commands if native endpoints fail.
// All operations call ensureRunningBeforeOp() first to fail fast on stopped sandboxes.
/**
 * Write a file into a Daytona sandbox.
 * The file path should be relative to /workspace (e.g. "src/App.tsx").
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaWriteFile(sandboxId, relativePath, content) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
    const fullPath = `${workspaceRoot}/${relativePath}`;
    logger.info({ sandboxId: sandboxId.slice(0, 12), path: relativePath }, 'Daytona: writing file');
    await dc.uploadFile(sandboxId, fullPath, content);
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
        const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
        const results = await Promise.allSettled(batch.map(f => dc.uploadFile(sandboxId, `${workspaceRoot}/${f.path}`, f.content)));
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
    const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
    const fullPath = `${workspaceRoot}/${relativePath}`;
    return dc.downloadFile(sandboxId, fullPath);
}
/**
 * Delete a file or directory from a Daytona sandbox.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaDeleteFile(sandboxId, relativePath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
    const fullPath = `${workspaceRoot}/${relativePath}`;
    try {
        await dc.deleteFileNative(sandboxId, fullPath);
    }
    catch (nativeErr) {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), path: relativePath, error: nativeErr.message }, 'Native filesystem delete failed, falling back to exec-based delete');
        await dc.execCommand(sandboxId, `rm -rf '${workspaceRoot}/${relativePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
    }
}
/**
 * Rename/move a file inside a Daytona sandbox.
 * Uses native mkdir for the target directory, then exec for the mv operation.
 */
async function daytonaRenameFile(sandboxId, oldRelPath, newRelPath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
    const dir = newRelPath.substring(0, newRelPath.lastIndexOf('/'));
    // Create target directory via native API with exec fallback
    if (dir) {
        try {
            await dc.createDirectoryNative(sandboxId, `${workspaceRoot}/${dir}`);
        }
        catch {
            await dc.execCommand(sandboxId, `mkdir -p '${workspaceRoot}/${dir.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
        }
    }
    // mv still requires exec — no native rename/move endpoint
    await dc.execCommand(sandboxId, `mv '${workspaceRoot}/${oldRelPath.replace(/'/g, "'\\''")}' '${workspaceRoot}/${newRelPath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
}
/**
 * Create a directory inside a Daytona sandbox.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
async function daytonaCreateFolder(sandboxId, relativePath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
    try {
        await dc.createDirectoryNative(sandboxId, `${workspaceRoot}/${relativePath}`);
    }
    catch (nativeErr) {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), path: relativePath, error: nativeErr.message }, 'Native filesystem mkdir failed, falling back to exec-based mkdir');
        await dc.execCommand(sandboxId, `mkdir -p '${workspaceRoot}/${relativePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
    }
}
/**
 * List files in a Daytona sandbox directory.
 * Uses the native Toolbox filesystem API, falling back to exec-based find.
 * Returns a list of absolute paths (matching the Docker find-based output).
 */
async function daytonaListFiles(sandboxId, dirPath) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const effectiveDirPath = dirPath || await resolveDaytonaWorkspaceRoot(sandboxId);
    // Try native filesystem list first
    try {
        const entries = await dc.listFilesNative(sandboxId, effectiveDirPath);
        // Convert DaytonaFileInfo entries to absolute paths matching the find-based format
        const absDir = effectiveDirPath.endsWith('/') ? effectiveDirPath.slice(0, -1) : effectiveDirPath;
        return entries.map(e => `${absDir}/${e.name}`);
    }
    catch (nativeErr) {
        logger.warn({ sandboxId: sandboxId.slice(0, 12), dirPath: effectiveDirPath, error: nativeErr.message }, 'Native filesystem list failed, falling back to exec-based find');
        // Fallback to exec-based find — POSIX sh compatible (no grouping parens
        // that break in dash/sh). Two separate finds produce the same result.
        const result = await dc.execCommand(sandboxId, `find '${effectiveDirPath}' -maxdepth 2 -type f 2>/dev/null; find '${effectiveDirPath}' -maxdepth 2 -type d 2>/dev/null`, { timeoutSecs: 15 });
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
 * The process is daemonized with nohup so it outlives the request.
 * This intentionally uses the same direct exec pattern that was verified
 * working in the live sandbox, instead of the Daytona session-based path.
 */
async function daytonaExecBackground(sandboxId, command, cwd, options) {
    await ensureRunningBeforeOp(sandboxId);
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const effectiveCwd = cwd || await resolveDaytonaWorkspaceRoot(sandboxId);
    if (!options?.skipCleanup) {
        try {
            await cleanupDaytonaDevServerProcesses(sandboxId, options?.projectId);
        }
        catch {
            // Non-fatal — proceed with starting the new process
        }
    }
    if (options?.projectId) {
        const sessionId = buildDaytonaDevServerSessionId(options.projectId);
        const tmpScript = `/tmp/${sessionId}.sh`;
        const b64 = Buffer.from(command, 'utf-8').toString('base64');
        await dc.createSession(sandboxId, sessionId);
        await dc.execInSession(sandboxId, sessionId, `printf '%s' '${b64}' | base64 -d > '${tmpScript}' && chmod +x '${tmpScript}' && cd '${effectiveCwd.replace(/'/g, "'\\''")}' && sh '${tmpScript}'`, { runAsync: true });
        return;
    }
    await dc.execCommand(sandboxId, `sh -lc ${JSON.stringify(command)}`, { cwd: effectiveCwd, timeoutSecs: 15 });
}
// ── Workspace state ──
/**
 * Get workspace state from a Daytona sandbox (fileCount, hasPackageJson, devServerRunning).
 */
async function daytonaGetWorkspaceState(sandboxId, previewUrl) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const workspaceRoot = await resolveDaytonaWorkspaceRoot(sandboxId);
    // File count
    let fileCount = 0;
    try {
        const countResult = await dc.execCommand(sandboxId, `find ${workspaceRoot} -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l`, { timeoutSecs: 15 });
        fileCount = parseInt(countResult.output.trim(), 10) || 0;
    }
    catch (err) {
        logger.warn({ sandboxId, err }, 'Daytona: file count failed');
    }
    // package.json
    let hasPackageJson = false;
    try {
        const pkgResult = await dc.execCommand(sandboxId, `test -f ${workspaceRoot}/package.json && echo "yes" || echo "no"`, { timeoutSecs: 5 });
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
async function daytonaGetLogs(sandboxId, tail = 100, projectId) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    try {
        const result = await dc.execCommand(sandboxId, `tail -n ${tail} /tmp/dev.log 2>/dev/null || echo "(no dev server logs)"`, { timeoutSecs: 10 });
        if (result.output.trim() && !result.output.includes('(no dev server logs)')) {
            return result.output;
        }
        const sessionId = projectId ? buildDaytonaDevServerSessionId(projectId) : null;
        if (sessionId) {
            try {
                const logs = await dc.getSessionLogs(sandboxId, sessionId);
                if (logs.trim()) {
                    return logs;
                }
            }
            catch {
                // ignore
            }
        }
        return result.output;
    }
    catch (err) {
        return `(failed to fetch logs: ${err.message})`;
    }
}
