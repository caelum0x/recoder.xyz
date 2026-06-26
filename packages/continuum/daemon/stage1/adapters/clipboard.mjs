// Stage 1 adapter — clipboard watcher ("what you move between apps"). Polls the clipboard and
// emits a CaptureEvent on each CHANGE (copy/paste lineage). Dedups identical consecutive values,
// skips empty, skips secret-shaped values (api keys, jwts), caps text. Opt-in. Pure Node + pbpaste.
import { execFileSync } from 'node:child_process';

const MAX = 4000;

// Secret-shaped: obvious API keys / tokens / JWTs we must never capture.
const SECRET = [
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9]{16,}\b/,          // sk-..., pk_live_..., rk-...
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/, // JWT eyJ....eyJ....sig
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,                // GitHub tokens ghp_/gho_/...
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,              // Slack tokens
  /\bAKIA[0-9A-Z]{16}\b/,                          // AWS access key id
  /\bAIza[0-9A-Za-z_-]{20,}\b/,                    // Google API key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,           // PEM private key
];

const looksSecret = (s) => SECRET.some((re) => re.test(s));

// Default reader: macOS pbpaste. Returns '' on any failure (no clipboard, non-mac, etc.).
const pbpaste = () => {
  try { return execFileSync('pbpaste', { encoding: 'utf8', maxBuffer: 1 << 20 }); }
  catch { return ''; }
};

export function watchClipboard(onEvent, { read = pbpaste, intervalMs = 1500, now = Date.now } = {}) {
  let last = null;
  const poll = () => {
    let val;
    try { val = read(); } catch { return; }
    if (typeof val !== 'string') return;
    if (!val.trim()) return;            // skip empty
    if (val === last) return;          // dedup identical consecutive
    last = val;                        // remember even secrets so we don't re-check them
    if (looksSecret(val)) return;      // never capture obvious secrets
    onEvent({
      t: now(),
      source: 'clipboard',
      app: 'Clipboard',
      window_id: 'clipboard',
      title: 'clipboard',
      text: val.slice(0, MAX),
    });
  };
  const timer = setInterval(poll, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
