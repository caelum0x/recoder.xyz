// watchEditor — emits an 'editor' CaptureEvent when the frontmost editor's active file changes.
// Injected fake probe drives a sequence (A, A, B, null); never touches the real system.
import { watchEditor, languageFor } from './editor.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nwatchEditor (active editor file capture)\n');

// pure extension -> language mapping
ok('maps .ts -> TypeScript', languageFor('/x/app.ts') === 'TypeScript');
ok('maps .py -> Python', languageFor('/x/main.py') === 'Python');
ok('maps .rs -> Rust', languageFor('/x/lib.rs') === 'Rust');
ok('maps .go -> Go', languageFor('/x/m.go') === 'Go');
ok('maps .mjs -> JavaScript', languageFor('/x/a.mjs') === 'JavaScript');
ok('maps .md -> Markdown', languageFor('/x/r.md') === 'Markdown');
ok('unknown ext falls back', languageFor('/x/file') === 'Plain text');

await (async () => {
  const A = '/Users/me/proj/app.ts';
  const B = '/Users/me/proj/main.py';
  const seq = [{ file: A, app: 'Code' }, { file: A, app: 'Code' }, { file: B, app: 'Cursor' }, null];
  const probe = () => (seq.length ? seq.shift() : null); // drains, then null forever
  const events = [];
  let t = 1000;

  const stop = watchEditor((ev) => events.push(ev), { probe, intervalMs: 5, now: () => (t += 1) });
  await wait(80); // ~16 ticks: consumes A, A, B, null, null...
  stop();

  const forA = events.filter((e) => e.text.includes('app.ts'));
  const forB = events.filter((e) => e.text.includes('main.py'));

  ok('emits for A exactly once', forA.length === 1, forA.length);
  ok('does not re-emit for repeated A', events.filter((e) => e.window_id === `editor|${A}`).length === 1);
  ok('emits for B after A changes', forB.length === 1, forB.length);
  ok('total events == 2 (null emits nothing)', events.length === 2, events.length);

  const a = forA[0];
  ok('source is editor', a.source === 'editor');
  ok('app carried through', a.app === 'Code' && forB[0].app === 'Cursor');
  ok('window_id is stable + file-keyed', a.window_id === `editor|${A}`);
  ok('title is basename', a.title === 'app.ts');
  ok('text maps A -> TypeScript', /Editing app\.ts \(TypeScript\) — \/Users\/me\/proj\/app\.ts/.test(a.text));
  ok('text maps B -> Python', /\(Python\)/.test(forB[0].text));
  ok('timestamp from injected now()', typeof a.t === 'number' && a.t >= 1000);
})();

await (async () => {
  // probe that only ever returns null -> adapter is completely silent
  const events = [];
  const stop = watchEditor((ev) => events.push(ev), { probe: () => null, intervalMs: 5 });
  await wait(40);
  stop();
  ok('null-only probe emits nothing', events.length === 0, events.length);
})();

await (async () => {
  // probe.language override beats extension inference
  const events = [];
  const stop = watchEditor((ev) => events.push(ev), {
    probe: () => ({ file: '/x/weird.xyz', app: 'Code', language: 'Brainfuck' }), intervalMs: 5,
  });
  await wait(30);
  stop();
  ok('explicit language overrides extension', events.length >= 1 && /\(Brainfuck\)/.test(events[0].text));
})();

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
