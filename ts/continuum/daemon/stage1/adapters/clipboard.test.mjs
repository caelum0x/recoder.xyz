// clipboard adapter — emits on change, dedups identical, skips empty, skips secret-shaped, caps long.
import { watchClipboard } from './clipboard.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nclipboard adapter (copy/paste lineage capture)\n');

const long = 'x'.repeat(5000);
const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJ4f36POk6yJV_adQssw5c';
const seq = [
  'copy alpha',   // change      -> emit
  'copy alpha',   // identical   -> dedup
  '',             // empty       -> skip
  '   ',          // whitespace  -> skip
  'copy beta',    // change      -> emit
  'sk-ABCD1234567890abcdefXYZ',  // api key    -> skip (secret)
  jwt,            // jwt         -> skip (secret)
  long,           // change long -> emit, capped
];

let i = 0;
const read = () => { const v = seq[Math.min(i, seq.length - 1)]; if (i < seq.length) i++; return v; };

const events = [];
const stop = watchClipboard((ev) => events.push(ev), { read, intervalMs: 2, now: () => 12345 });

// drive polls until the fake sequence is fully consumed (deterministic, no real clipboard)
for (let g = 0; g < 200 && i < seq.length; g++) await sleep(4);
await sleep(10);
stop();

ok('emits exactly on changes (3: alpha, beta, long)', events.length === 3, events.length);
ok('first emit is the first copied value', events[0] && events[0].text === 'copy alpha');
ok('dedups identical consecutive values', events.filter((e) => e.text === 'copy alpha').length === 1);
ok('emits the second changed value', events[1] && events[1].text === 'copy beta');
ok('skips empty / whitespace-only values', !events.some((e) => !e.text.trim()));
ok('skips secret-shaped api key (sk-...)', !events.some((e) => /sk-ABCD/.test(e.text)));
ok('skips secret-shaped jwt (eyJ...)', !events.some((e) => e.text.startsWith('eyJ')));
ok('caps long text at ~4000 chars', events[2] && events[2].text.length === 4000);

// CaptureEvent contract: stable ids so the segmenter coalesces clipboard lineage
const ev = events[0];
ok('source is clipboard', ev.source === 'clipboard');
ok('app is Clipboard', ev.app === 'Clipboard');
ok('window_id is stable "clipboard"', events.every((e) => e.window_id === 'clipboard'));
ok('title is clipboard', ev.title === 'clipboard');
ok('t comes from injected now()', ev.t === 12345);

// stop() halts polling — no further emits after stop even as the sequence would repeat
const before = events.length;
await sleep(12);
ok('stop() halts the watcher', events.length === before, `${events.length} vs ${before}`);

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
