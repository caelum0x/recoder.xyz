// watchShellHistory — tails shell history, emits only newly appended commands; zsh prefix
// stripped, bash raw kept, blanks ignored, no re-emit on unchanged. IO injected, no real fs.
import { watchShellHistory } from './terminal.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nwatchShellHistory (shell history tail)\n');

// Growing zsh history across polls: v1 is the baseline, v2 appends a zsh cmd, a blank, and a
// raw bash line. After v2 the file stays put — so any number of extra polls must not re-emit.
const v1 = ': 1700000000:0;git status\n: 1700000001:0;ls -la\n';
const v2 = v1 + ': 1700000002:0;git push\n\necho hi\n';

let calls = 0;
const read = () => { calls++; return calls === 1 ? v1 : v2; };

const events = [];
const stop = watchShellHistory((e) => events.push(e), { read, histFile: 'fake', intervalMs: 5, now: () => 111 });
await sleep(60);
stop();

ok('emits exactly two batches (baseline + appended, no re-emit)', events.length === 2, `len=${events.length}`);

const [a, b] = events;
ok('first batch parses zsh ": ts:dur;cmd" prefix', a && a.text === 'git status\nls -la', a && JSON.stringify(a.text));
ok('second batch emits only NEW commands', b && /git push/.test(b.text) && !/git status|ls -la/.test(b.text), b && JSON.stringify(b.text));
ok('handles bash raw lines (no prefix)', b && b.text === 'git push\necho hi', b && JSON.stringify(b.text));
ok('ignores blank lines', b && !/\n\n/.test(b.text) && b.text.split('\n').length === 2);
ok('polled multiple times but did not re-emit unchanged content', calls > 2 && events.length === 2, `calls=${calls}`);

// CaptureEvent contract
const valid = (e) => e.source === 'terminal' && e.app === 'Terminal' && e.window_id === 'terminal|shell'
  && e.title === 'shell' && e.secure === false && e.t === 111 && typeof e.text === 'string';
ok('every event is a valid CaptureEvent with stable window_id', events.every(valid));

// Unreadable file (read throws) must not crash and must not emit.
const safe = [];
const stop2 = watchShellHistory((e) => safe.push(e), {
  read: () => { throw new Error('ENOENT'); }, histFile: 'missing', intervalMs: 5, now: () => 1,
});
await sleep(20);
stop2();
ok('missing/unreadable history is skipped silently', safe.length === 0);

// Text cap (~4000 chars).
const big = Array.from({ length: 500 }, (_, i) => `echo line${i}-padding-padding-padding`).join('\n') + '\n';
const cap = [];
const stop3 = watchShellHistory((e) => cap.push(e), { read: () => big, histFile: 'big', intervalMs: 1000, now: () => 2 });
await sleep(10);
stop3();
ok('caps text length to maxBytes', cap.length === 1 && cap[0].text.length <= 4000, cap[0] && cap[0].text.length);

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
