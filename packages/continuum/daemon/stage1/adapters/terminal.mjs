// Stage 1 adapter — terminal ("what you run"). Tails shell history (~/.zsh_history, fallback
// ~/.bash_history) and emits a CaptureEvent for each batch of newly appended commands. Opt-in,
// pure Node, IO injectable for tests. zsh lines look like ': 1700000000:0;git push' — the
// ': <ts>:<dur>;' prefix is stripped; bash lines are raw. Source 'terminal' marks these as you.
import fs from 'node:fs';
import path from 'node:path';

const ZSH_PREFIX = /^:\s\d+:\d+;/; // extended zsh history: ": <epoch>:<elapsed>;<cmd>"

function expandHome(p) {
  return p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p;
}

function defaultHistFile() {
  const home = process.env.HOME || '';
  const zsh = path.join(home, '.zsh_history');
  const bash = path.join(home, '.bash_history');
  try { return fs.existsSync(zsh) ? zsh : bash; } catch { return bash; }
}

function parseCmd(line) {
  const m = line.match(ZSH_PREFIX);
  return (m ? line.slice(m[0].length) : line).trim();
}

export function watchShellHistory(onEvent, {
  read = (p) => fs.readFileSync(p, 'utf8'),
  histFile = defaultHistFile(),
  intervalMs = 2000,
  now = () => Date.now(),
  maxBytes = 4000,
} = {}) {
  const file = expandHome(histFile);
  let offset = 0; // last seen line count; offset 0 means whole file is "new" on first poll

  const poll = () => {
    let data;
    try { data = read(file); } catch { return; } // file missing / unreadable — skip
    if (typeof data !== 'string') return;
    // Only count lines up to the final newline as "committed". A trailing newline otherwise
    // yields a phantom empty element that the next append overwrites — which would skip a command.
    const lastNl = data.lastIndexOf('\n');
    const lines = lastNl === -1 ? [] : data.slice(0, lastNl).split('\n');
    if (lines.length <= offset) {
      if (lines.length < offset) offset = lines.length; // truncated/rewritten — rebaseline
      return;
    }
    const cmds = lines.slice(offset).map(parseCmd).filter(Boolean);
    offset = lines.length;
    if (!cmds.length) return; // only blanks appended
    onEvent({
      t: now(),
      source: 'terminal',
      app: 'Terminal',
      window_id: 'terminal|shell',
      title: 'shell',
      text: cmds.join('\n').slice(0, maxBytes),
      secure: false,
    });
  };

  poll(); // immediate baseline + first emit
  const timer = setInterval(poll, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
