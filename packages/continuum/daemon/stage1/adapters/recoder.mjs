// Stage 1 adapter — recoder agent-session watcher ("what your agent is doing"). Tails the
// Recoder (pi-coding-agent) JSONL session logs under ~/.recoder/agent/sessions and emits ONE
// CaptureEvent per session file per poll, batching the newly appended agent actions (user/assistant
// turns, bash executions, tool results, model switches). Opt-in, pure Node, IO injectable for tests.
//
// Source tag 'recoder' (NOT terminal/editor) so the segmenter labels these correctly. window_id is
// `recoder|<sessionId>` — stable per session so SimHash cross-episode dedup works. Fail-safe: if the
// sessions dir is absent or unreadable the adapter degrades to a no-op stop(), exactly like
// editor.mjs's probe returning null — it NEVER throws and never creates the dir.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// app name from pi-coding-agent/package.json piConfig.name; uppercased for the config-dir env
// override prefix (config.ts builds `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`).
const APP_NAME = 'Recoder';
const CONFIG_DIR_NAME = '.recoder';
const MAX_BYTES = 4000;

// Resolve the agent dir via the SAME precedence the agent uses (config.ts:489,495-496,559-561):
//   env `${APP_NAME}_CODING_AGENT_DIR` → else join(homedir, CONFIG_DIR_NAME, 'agent')
export function defaultAgentDir() {
  const envKey = `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`;
  if (process.env[envKey]) return process.env[envKey];
  return path.join(os.homedir(), CONFIG_DIR_NAME, 'agent');
}

// Resolve the sessions dir: env `${APP_NAME}_CODING_AGENT_SESSION_DIR` wins, else agentDir/sessions.
export function defaultSessionsDir(agentDir) {
  const envKey = `${APP_NAME.toUpperCase()}_CODING_AGENT_SESSION_DIR`;
  if (process.env[envKey]) return process.env[envKey];
  return path.join(agentDir, 'sessions');
}

// Extract the human text out of a single JSONL entry. Returns null for entries we don't surface
// (session header, compaction, label, custom data, malformed lines). Mirrors the event shapes in
// session-manager.ts (SessionMessageEntry, ModelChangeEntry) and messages.ts (bashExecutionToText).
export function entryToText(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const t = entry.type;
  if (t === 'session') return null; // header — not an action

  if (t === 'message' && entry.message) {
    const m = entry.message;
    const role = m.role;
    if (role === 'bashExecution') {
      // messages.ts:82 bashExecutionToText shape — command + output, truncated.
      let text = `Ran ${m.command || ''}`;
      if (m.output) text += `\n${m.output}`;
      if (typeof m.exitCode === 'number' && m.exitCode !== 0) text += `\n(exit ${m.exitCode})`;
      return text;
    }
    const content = Array.isArray(m.content)
      ? m.content.map((c) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : (typeof c === 'string' ? c : ''))).join('')
      : (typeof m.content === 'string' ? m.content : '');
    const body = String(content).trim();
    if (!body) return null;
    if (role === 'user') return `User: ${body}`;
    if (role === 'assistant') return `Assistant: ${body}`;
    if (role === 'toolResult' || role === 'tool_result') return `Tool result: ${body}`;
    return `${role}: ${body}`;
  }

  if (t === 'model_change') {
    if (!entry.provider && !entry.modelId) return null;
    return `Switched model → ${entry.provider || '?'}/${entry.modelId || '?'}`;
  }

  // compaction / branch_summary / thinking_level_change / label / session_info / custom —
  // intentionally not surfaced (low signal, large). Return null to skip.
  return null;
}

// Find every *.jsonl session file beneath sessionsDir (recursively — per-cwd subdirs). Returns
// absolute paths. readdir is injected; per-dir failures are swallowed (skip that subdir).
export function listSessionFiles(sessionsDir, readdir) {
  const out = [];
  const stack = [sessionsDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdir(dir); } catch { continue; }
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isDirectory()) stack.push(full);
        else if (name.endsWith('.jsonl')) out.push(full);
      } catch { /* stat failed — skip */ }
    }
  }
  return out;
}

// Read the committed lines of a JSONL file (up to the final newline, like terminal.mjs:42-43,
// avoiding the phantom trailing-line bug). Returns { header, lines } where lines excludes the header.
export function readSession(filePath, read) {
  const data = read(filePath);
  if (typeof data !== 'string') return { header: null, lines: [] };
  const lastNl = data.lastIndexOf('\n');
  const committed = lastNl === -1 ? '' : data.slice(0, lastNl);
  const allLines = committed.split('\n').filter((l) => l.length > 0);
  let header = null;
  const body = [];
  for (const line of allLines) {
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; } // malformed line — skip (session-manager.ts:456-464)
    if (parsed && parsed.type === 'session' && !header) header = parsed;
    else body.push(parsed);
  }
  return { header, lines: body };
}

export function watchRecoder(onEvent, {
  readdir = (d) => fs.readdirSync(d),
  read = (p) => fs.readFileSync(p, 'utf8'),
  exists = (p) => fs.existsSync(p),
  intervalMs = 3000,
  now = Date.now,
  agentDir = defaultAgentDir(),
  sessionsDir,
  maxBytes = MAX_BYTES,
} = {}) {
  const dir = sessionsDir || defaultSessionsDir(agentDir);
  // FAIL-SAFE: absent source → no-op stop(). Never create the dir, never throw, never log.
  if (!exists(dir)) return () => {};

  // Per-file line cursor (session file path → last emitted body-line count). Mirrors terminal.mjs's
  // `offset` and git.mjs's `last` Map. On file shrink (rotation/new file) the cursor resets below.
  const cursor = new Map();

  const poll = () => {
    let files;
    try { files = listSessionFiles(dir, readdir); } catch { return; } // unreadable dir → skip poll
    for (const file of files) {
      let parsed;
      try { parsed = readSession(file, read); } catch { continue; } // unreadable file → skip it
      const { header, lines } = parsed;
      const offset = cursor.get(file) || 0;
      // shrink/rotation rebaseline (terminal.mjs:45 pattern)
      if (lines.length < offset) { cursor.set(file, lines.length); continue; }
      if (lines.length <= offset) continue; // unchanged → no emit
      const newLines = lines.slice(offset);
      cursor.set(file, lines.length);

      // Session identity — load-bearing for SimHash dedup. Prefer the header id (uuidv7); fall back
      // to the filename stem so dedup stays stable even if the header is missing/legacy.
      const sessionId = (header && header.id) || path.basename(file).replace(/\.jsonl$/, '');
      const cwd = (header && header.cwd) || '';
      const shortCwd = cwd ? path.basename(cwd) : 'session';

      const parts = [];
      for (const entry of newLines) {
        const text = entryToText(entry);
        if (text) parts.push(text);
      }
      if (!parts.length) continue; // only noise appended — no emit

      onEvent({
        t: now(),
        source: 'recoder',
        app: APP_NAME,
        window_id: `recoder|${sessionId}`,
        title: `Recoder @ ${shortCwd}`,
        text: parts.join('\n---\n').slice(0, maxBytes),
        secure: false,
        source_mix: ['input'],
      });
    }
  };

  poll(); // immediate baseline
  const timer = setInterval(poll, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
