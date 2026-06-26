// watchGit — polls repo dirs, emits a CaptureEvent per repo only when working-state changes.
import path from 'node:path';
import { watchGit } from './git.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

console.log('\nwatchGit (git working-state adapter)\n');

// Two fake repos + one non-repo. Mutable so we can change status between polls.
const repos = {
  alpha: {
    branch: 'main',
    status: ' M src/x.ts\nA  src/new.ts\n?? notes.md\n',           // 1 modified, 1 staged, 1 untracked
    diff: ' src/x.ts | 4 ++--\n 1 file changed',
    cached: ' src/new.ts | 10 ++++++++++',
    log: 'fix Y\nadd Z\ninit\n',
  },
  beta: {
    branch: 'dev',
    status: '',                                                     // clean
    diff: '',
    cached: '',
    log: 'wip parser\n',
  },
};

// Fake exec(args, cwd) — keyed on the repo basename and the git subcommand. Throws for unknown
// repos (simulates a non-repo dir), exactly like the real git CLI would.
const fakeExec = (args, cwd) => {
  const r = repos[path.basename(cwd)];
  if (!r) throw new Error('not a git repository');
  const sub = args.join(' ');
  if (sub.startsWith('rev-parse')) return r.branch + '\n';
  if (sub.startsWith('status')) return r.status;
  if (sub.startsWith('diff --cached')) return r.cached;
  if (sub.startsWith('diff')) return r.diff;
  if (sub.startsWith('log')) return r.log;
  return '';
};

const events = [];
const onEvent = (e) => events.push(e);

const dirs = ['/repos/alpha', '/repos/beta', '/repos/ghost'];
const stop = watchGit(dirs, onEvent, { exec: fakeExec, intervalMs: 15, now: () => 1000 });

// ---- first poll runs synchronously inside watchGit ----
ok('emits one event per real repo on first poll', events.length === 2, events.length);
ok('ignores the non-repo dir (exec throws) without crashing', !events.some((e) => e.window_id === 'git|ghost'));

const a = events.find((e) => e.window_id === 'git|alpha');
const b = events.find((e) => e.window_id === 'git|beta');
ok('emits valid CaptureEvent shape', !!a && a.source === 'git' && a.app === 'Git' && a.t === 1000 && typeof a.text === 'string');
ok('stable window_id per repo', a.window_id === 'git|alpha' && b.window_id === 'git|beta');
ok('title is "<repo> @ <branch>"', a.title === 'alpha @ main' && b.title === 'beta @ dev');
ok('text carries branch', a.text.startsWith('branch main'));
ok('text carries correct counts', /1 staged/.test(a.text) && /1 modified/.test(a.text) && /1 untracked/.test(a.text), a.text);
ok('text carries changed file paths', /src\/x\.ts/.test(a.text) && /src\/new\.ts/.test(a.text));
ok('text carries recent commit subjects', /recent: fix Y; add Z/.test(a.text));
ok('clean repo summarized as clean', /branch dev · clean/.test(b.text), b.text);

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- unchanged state across several polls → no re-emit ----
  await sleep(60);
  ok('does NOT re-emit when state is unchanged', events.length === 2, events.length);

  // ---- status changes → re-emit for that repo only ----
  repos.alpha.status = ' M src/x.ts\n M src/y.ts\nA  src/new.ts\n'; // now 2 modified, 1 staged
  await sleep(60);
  const reAlpha = events.filter((e) => e.window_id === 'git|alpha');
  ok('re-emits when status changes', reAlpha.length === 2, reAlpha.length);
  ok('re-emit reflects new counts', /2 modified/.test(reAlpha[1].text), reAlpha[1].text);
  ok('beta not re-emitted (its state held)', events.filter((e) => e.window_id === 'git|beta').length === 1);

  stop();
  console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
