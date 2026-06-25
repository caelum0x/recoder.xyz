// Stage 1 adapter — git working-state watcher ("what you're building"). Polls configured repo
// dirs and emits ONE CaptureEvent per repo when its state changes (branch / status / diffstat /
// recent commits). Opt-in via config. Pure Node + the `git` CLI. No network, no credential stores.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Default exec: run a git subcommand in `cwd`, return stdout. Throws on non-repo / git error,
// which the watcher catches and treats as "skip this repo this poll".
const realExec = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });

// Cheap non-crypto string hash — dedup key so we only emit when the composed summary changes.
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; };

// Parse `git status --porcelain` → counts + changed paths. Staged = index col set, modified =
// worktree col set, untracked = '??'. A path can be both staged and modified.
function parseStatus(porcelain) {
  const files = [];
  let staged = 0, modified = 0, untracked = 0;
  for (const line of porcelain.split('\n')) {
    if (!line) continue;
    const x = line[0], y = line[1], file = line.slice(3);
    if (x === '?' && y === '?') untracked++;
    else { if (x !== ' ' && x !== '?') staged++; if (y !== ' ' && y !== '?') modified++; }
    files.push(file);
  }
  return { staged, modified, untracked, files };
}

// Compose the per-repo summary text from canned git output. Pure → easy to test.
function summarize(repo, branch, status, diffstat, commits, maxChars = 4000) {
  const { staged, modified, untracked, files } = parseStatus(status);
  const parts = [];
  if (staged) parts.push(`${staged} staged`);
  if (modified) parts.push(`${modified} modified`);
  if (untracked) parts.push(`${untracked} untracked`);
  const counts = parts.length ? parts.join(', ') : 'clean';
  const fileList = files.slice(0, 12).join(', ');
  const recent = commits.split('\n').filter(Boolean).map((s) => s.trim()).slice(0, 5).join('; ');
  const diff = diffstat.trim();
  let text = `branch ${branch} · ${counts}`;
  if (fileList) text += ` · ${fileList}`;
  if (diff) text += `\n${diff}`;
  if (recent) text += `\nrecent: ${recent}`;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export function watchGit(dirs, onEvent, { exec = realExec, intervalMs = 5000, now = Date.now } = {}) {
  const last = new Map(); // repoDir -> last emitted hash

  const poll = () => {
    for (const dir of dirs) {
      const cwd = path.resolve(dir.replace(/^~/, process.env.HOME || ''));
      const repo = path.basename(cwd);
      let branch, status, unstaged, staged, commits;
      try {
        branch = exec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim();
        status = exec(['status', '--porcelain'], cwd);
        unstaged = exec(['diff', '--stat'], cwd);
        staged = exec(['diff', '--cached', '--stat'], cwd);
        commits = exec(['log', '-5', '--pretty=%s'], cwd);
      } catch {
        continue; // not a repo / git failed — skip gracefully
      }
      const diffstat = [unstaged.trim(), staged.trim()].filter(Boolean).join('\n').slice(0, 1500);
      const text = summarize(repo, branch, status, diffstat, commits);
      const h = hash(text);
      if (last.get(cwd) === h) continue; // unchanged since last poll — don't re-emit
      last.set(cwd, h);
      onEvent({
        t: now(),
        source: 'git',
        app: 'Git',
        window_id: `git|${repo}`,
        title: `${repo} @ ${branch}`,
        text,
      });
    }
  };

  poll();
  const timer = setInterval(poll, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
