// Stage 1 adapter — editor context ("what you're coding"). Polls a best-effort probe for the
// frontmost editor's active file and emits a CaptureEvent when the file changes. Opt-in, pure
// Node + macOS CLIs (lsof). Default probe returns null when it can't tell — adapter stays silent.
import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const MAX = 4000;

// extension -> human language label
const LANG = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', swift: 'Swift', rb: 'Ruby',
  java: 'Java', kt: 'Kotlin', c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++',
  cs: 'C#', php: 'PHP', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  md: 'Markdown', markdown: 'Markdown', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  toml: 'TOML', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', vue: 'Vue',
};

export function languageFor(file) {
  const ext = path.extname(String(file || '')).slice(1).toLowerCase();
  return LANG[ext] || (ext ? ext.toUpperCase() : 'Plain text');
}

// Default probe: best-effort, never throws. Inspects lsof for the frontmost editor's open file
// under $HOME. If detection is unreliable, returns null and the adapter emits nothing.
function defaultProbe(deps) {
  return new Promise((resolve) => {
    const home = deps.home();
    const editors = ['Code Helper', 'Cursor Helper', 'Code', 'Cursor'];
    let i = 0;
    const tryNext = () => {
      if (i >= editors.length) return resolve(null);
      const proc = editors[i++];
      deps.execFile('lsof', ['-c', proc, '-Fn'], { maxBuffer: 4 << 20 }, (err, stdout) => {
        if (err || !stdout) return tryNext();
        const files = String(stdout).split('\n')
          .filter((l) => l[0] === 'n').map((l) => l.slice(1))
          .filter((f) => f.startsWith(home) && /\.[a-z0-9]+$/i.test(f) && !f.includes('/Library/') && !f.includes('node_modules'));
        if (!files.length) return tryNext();
        const app = proc.replace(/ Helper$/, '');
        resolve({ file: files[files.length - 1], app });
      });
    };
    tryNext();
  });
}

export function watchEditor(onEvent, { probe, intervalMs = 4000, now = Date.now, execFile: ef = execFile, home } = {}) {
  const homeFn = home || (() => os.homedir());
  const realProbe = probe || (() => defaultProbe({ execFile: ef, home: homeFn }));
  let last = null;
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await realProbe();
      if (!r || !r.file) return;            // nothing detected — stay silent
      if (r.file === last) return;          // unchanged — no re-emit
      last = r.file;
      const base = path.basename(r.file);
      const lang = r.language || languageFor(r.file);
      const text = `Editing ${base} (${lang}) — ${r.file}`.slice(0, MAX);
      onEvent({
        t: now(), source: 'editor', app: r.app || 'Editor',
        window_id: `editor|${r.file}`, title: base, text,
      });
    } catch { /* probe failure — ignore */ } finally {
      busy = false;
    }
  };

  tick();
  const id = setInterval(tick, intervalMs);
  if (id.unref) id.unref();
  return () => clearInterval(id);
}
