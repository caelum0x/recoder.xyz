// Stage 1 adapter registry — starts every adapter the user has explicitly ENABLED and fans all
// their CaptureEvents into the same onEvent sink as screen capture. Privacy-first: every adapter
// defaults off in config (opt-in). Pure + unit-testable — the concrete watchers are injectable.
import { watchGit } from './git.mjs';
import { watchShellHistory } from './terminal.mjs';
import { watchClipboard } from './clipboard.mjs';
import { watchEditor } from './editor.mjs';
import { watchRecoder } from './recoder.mjs';

// startAdapters(config, onEvent) → stop(). Reads config.adapters (per-adapter booleans + gitDirs),
// starts only the enabled ones, and returns a combined stop() that halts them all.
export function startAdapters(config = {}, onEvent, {
  git = watchGit, terminal = watchShellHistory, clipboard = watchClipboard, editor = watchEditor,
  recoder = watchRecoder,
} = {}) {
  const a = (config && config.adapters) || {};
  const stops = [];
  if (a.git) stops.push(git(a.gitDirs || [], onEvent));
  if (a.terminal) stops.push(terminal(onEvent));
  if (a.clipboard) stops.push(clipboard(onEvent));
  if (a.editor) stops.push(editor(onEvent));
  if (a.recoder) stops.push(recoder(onEvent));
  return () => { for (const s of stops) { try { if (s) s(); } catch { /* already gone */ } } };
}
