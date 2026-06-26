// startAdapters — starts only ENABLED adapters, passes onEvent through, stop() halts them all,
// and everything is off by default. Fake watchers injected; never touches the real system.
import { startAdapters } from './index.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

console.log('\nstartAdapters (Stage 1 adapter registry)\n');

// A fake watcher factory: records that it started (and the args it got), returns a stop spy.
const make = (name, log) => (...args) => { log.started.push({ name, args }); return () => { log.stopped.push(name); }; };
const fakes = (log) => ({
  git: make('git', log), terminal: make('terminal', log),
  clipboard: make('clipboard', log), editor: make('editor', log),
  recoder: make('recoder', log),
});

// disabled-by-default: empty/absent adapters config starts nothing
{
  const log = { started: [], stopped: [] };
  const stop = startAdapters({}, () => {}, fakes(log));
  ok('no adapters config → starts nothing', log.started.length === 0, log.started.length);
  stop();
  ok('stop() is safe with nothing started', log.stopped.length === 0);
}

// all explicitly false → starts nothing
{
  const log = { started: [], stopped: [] };
  startAdapters({ adapters: { git: false, terminal: false, clipboard: false, editor: false, recoder: false, gitDirs: [] } }, () => {}, fakes(log));
  ok('all adapters false → starts nothing', log.started.length === 0, log.started.length);
}

// recoder branch: onEvent passed as 1st arg (terminal shape), and disabled by default
{
  const log = { started: [], stopped: [] };
  const sink = () => {};
  startAdapters({ adapters: { recoder: true } }, sink, fakes(log));
  ok('recoder starts when enabled', log.started.some((s) => s.name === 'recoder'), JSON.stringify(log.started));
  ok('recoder receives onEvent as 1st arg', log.started.find((s) => s.name === 'recoder').args[0] === sink);
}

// only enabled adapters start
{
  const log = { started: [], stopped: [] };
  startAdapters({ adapters: { git: true, terminal: false, clipboard: true, editor: false, gitDirs: ['~/code'] } }, () => {}, fakes(log));
  const names = log.started.map((s) => s.name).sort();
  ok('starts exactly the enabled adapters', JSON.stringify(names) === JSON.stringify(['clipboard', 'git']), JSON.stringify(names));
  ok('git receives gitDirs as first arg', log.started.find((s) => s.name === 'git').args[0][0] === '~/code');
}

// onEvent is passed through to each adapter
{
  const log = { started: [], stopped: [] };
  const sink = () => {};
  startAdapters({ adapters: { git: true, terminal: true, clipboard: true, editor: true } }, sink, fakes(log));
  ok('all four start when all enabled', log.started.length === 4, log.started.length);
  ok('git passes onEvent as 2nd arg', log.started.find((s) => s.name === 'git').args[1] === sink);
  ok('terminal passes onEvent as 1st arg', log.started.find((s) => s.name === 'terminal').args[0] === sink);
  ok('clipboard passes onEvent as 1st arg', log.started.find((s) => s.name === 'clipboard').args[0] === sink);
  ok('editor passes onEvent as 1st arg', log.started.find((s) => s.name === 'editor').args[0] === sink);
}

// stop() stops all started adapters
{
  const log = { started: [], stopped: [] };
  const stop = startAdapters({ adapters: { git: true, terminal: true, clipboard: false, editor: true } }, () => {}, fakes(log));
  stop();
  ok('stop() halts every started adapter', JSON.stringify(log.stopped.sort()) === JSON.stringify(['editor', 'git', 'terminal']), JSON.stringify(log.stopped));
  ok('stop() does not touch disabled adapters', !log.stopped.includes('clipboard'));
}

// a throwing stop must not break the others
{
  const log = { started: [], stopped: [] };
  const boom = () => { log.started.push({ name: 'git', args: [] }); return () => { throw new Error('stop failed'); }; };
  const stop = startAdapters({ adapters: { git: true, terminal: true } }, () => {}, { ...fakes(log), git: boom });
  let threw = false;
  try { stop(); } catch { threw = true; }
  ok('stop() swallows a throwing adapter stop', !threw && log.stopped.includes('terminal'));
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
