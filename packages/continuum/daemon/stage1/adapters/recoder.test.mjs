// watchRecoder — tails Recoder (pi-coding-agent) JSONL session logs, emits ONE CaptureEvent per
// session per poll batching newly appended agent actions; dedups across polls; degrades silently
// when the source dir is absent. Uses REAL fixtures on disk (a temp sessions dir with sample JSONL),
// no mocks — the adapter's injected `read`/`readdir`/`exists` defaults hit the real fs like the
// other adapter tests' terminal.test.mjs would in production.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchRecoder } from './recoder.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nwatchRecoder (recoder agent-session tail)\n');

// Build a real on-disk fixture: a temp sessions dir with one per-cwd subdir containing one .jsonl
// session whose first line is the SessionHeader (type:"session", version, id, cwd) and subsequent
// lines are SessionEntry records (user/assistant turns, bashExecution, model_change, compaction).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recoder-test-'));
const sessionsDir = path.join(tmp, 'agent', 'sessions');
const cwdSlug = '--Users-arhansubasa-recoder-xyz--';
const sessionDir = path.join(sessionsDir, cwdSlug);
fs.mkdirSync(sessionDir, { recursive: true });
const sessionId = '01900123-4567-7890-abcd-ef0123456789'; // uuidv7-shaped
const sessionFile = path.join(sessionDir, `20260626120000_${sessionId}.jsonl`);

const header = { type: 'session', version: 3, id: sessionId, timestamp: '2026-06-26T12:00:00.000Z', cwd: '/Users/arhansubasa/recoder.xyz' };
const userTurn = { type: 'message', id: 'e1', parentId: null, timestamp: '2026-06-26T12:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'fix the login bug' }] } };
const assistantTurn = { type: 'message', id: 'e2', parentId: 'e1', timestamp: '2026-06-26T12:00:05.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'I will edit auth.ts' }] } };

// v1: header + a user + assistant turn. Trailing newline present so both lines are "committed".
const v1 = `${JSON.stringify(header)}\n${JSON.stringify(userTurn)}\n${JSON.stringify(assistantTurn)}\n`;
fs.writeFileSync(sessionFile, v1);

const events = [];
const stop = watchRecoder((e) => events.push(e), {
  sessionsDir, intervalMs: 15, now: () => 5000,
});

// ---- first poll runs synchronously inside watchRecoder (immediate baseline) ----
ok('emits exactly one event on first poll (one session, one batch)', events.length === 1, `len=${events.length}`);

const a = events[0];
ok('emits valid CaptureEvent shape', !!a && a.source === 'recoder' && a.app === 'Recoder' && a.t === 5000 && typeof a.text === 'string', a && JSON.stringify(a));
ok('window_id is stable recoder|<sessionId>', a && a.window_id === `recoder|${sessionId}`, a && a.window_id);
ok('title is "Recoder @ <cwd basename>"', a && a.title === 'Recoder @ recoder.xyz', a && a.title);
ok('marks as user-authored (secure:false, source_mix:["input"])', a && a.secure === false && Array.isArray(a.source_mix) && a.source_mix[0] === 'input');
ok('text carries the user turn', a && /User: fix the login bug/.test(a.text), a && a.text);
ok('text carries the assistant turn', a && /Assistant: I will edit auth\.ts/.test(a.text), a && a.text);
ok('batches turns separated by \\n---\\n', a && a.text.includes('\n---\n'), a && a.text);

(async () => {
  // ---- unchanged across several polls → no re-emit ----
  await sleep(60);
  ok('does NOT re-emit when the session is unchanged', events.length === 1, `len=${events.length}`);

  // ---- append a bashExecution + model_change + a compaction (noise) → re-emit only the new actions ----
  const bash = { type: 'message', id: 'e3', parentId: 'e2', timestamp: '2026-06-26T12:00:10.000Z', message: { role: 'bashExecution', command: 'pnpm test', output: 'all passed', exitCode: 0, cancelled: false, truncated: false } };
  const modelChange = { type: 'model_change', id: 'e4', parentId: 'e3', timestamp: '2026-06-26T12:00:11.000Z', provider: 'anthropic', modelId: 'claude-sonnet-4-6' };
  const compaction = { type: 'compaction', id: 'e5', parentId: 'e4', timestamp: '2026-06-26T12:00:12.000Z', summary: 'compacted', firstKeptEntryId: 'e3', tokensBefore: 9999 }; // must be skipped
  const append = `${JSON.stringify(bash)}\n${JSON.stringify(modelChange)}\n${JSON.stringify(compaction)}\n`;
  fs.appendFileSync(sessionFile, append);
  await sleep(60);
  ok('re-emits exactly once when new actions are appended', events.length === 2, `len=${events.length}`);

  const b = events[1];
  ok('re-emit batches only NEW actions (not the old turns)', b && /Ran pnpm test/.test(b.text) && !/fix the login bug/.test(b.text), b && b.text);
  ok('re-emit carries the model_change', b && /Switched model → anthropic\/claude-sonnet-4-6/.test(b.text), b && b.text);
  ok('re-emit skips the compaction (noise)', b && !/compacted/.test(b.text), b && b.text);
  ok('re-emit bash shows output + non-zero exit omitted (exit 0)', b && /all passed/.test(b.text) && !/exit/.test(b.text), b && b.text);

  // ---- rotation: shrink the file (new session, fewer lines) → cursor rebaselines, no crash ----
  fs.writeFileSync(sessionFile, `${JSON.stringify(header)}\n${JSON.stringify(userTurn)}\n`);
  await sleep(60);
  ok('survives file shrink (rotation) without crashing', events.length >= 2, `len=${events.length}`);

  stop();

  // ---- second session file appears → emits for it independently ----
  const session2Id = '01900999-aaaa-bbbb-cccc-ddddddddeeee';
  const session2File = path.join(sessionDir, `20260626130000_${session2Id}.jsonl`);
  const header2 = { type: 'session', version: 3, id: session2Id, timestamp: '2026-06-26T13:00:00.000Z', cwd: '/Users/arhansubasa/recoder.xyz' };
  fs.writeFileSync(session2File, `${JSON.stringify(header2)}\n${JSON.stringify(userTurn)}\n`);
  const events2 = [];
  const stop2 = watchRecoder((e) => events2.push(e), { sessionsDir, intervalMs: 15, now: () => 7000 });
  await sleep(20);
  stop2();
  ok('discovers a second session file and emits for it', events2.length >= 1, `len=${events2.length}`);
  const ids = new Set(events2.map((e) => e.window_id));
  ok('each session has its own stable window_id', ids.has(`recoder|${sessionId}`) && ids.has(`recoder|${session2Id}`), [...ids].join(','));

  // ---- FAIL-SAFE: absent sessions dir → no-op stop(), never throws, never emits ----
  const gone = [];
  let threwMissing = false;
  let stopMissing;
  try {
    stopMissing = watchRecoder((e) => gone.push(e), { sessionsDir: path.join(tmp, 'does-not-exist'), intervalMs: 10, now: () => 9 });
  } catch (e) { threwMissing = true; }
  await sleep(25);
  if (stopMissing) try { stopMissing(); } catch {}
  ok('absent sessions dir does not throw at start', !threwMissing);
  ok('absent sessions dir emits nothing', gone.length === 0, `len=${gone.length}`);

  // ---- FAIL-SAFE: unreadable dir inside poll (readdir throws) → skip poll, no throw ----
  const unreadable = [];
  const stopUnreadable = watchRecoder((e) => unreadable.push(e), {
    sessionsDir, intervalMs: 10, now: () => 11,
    readdir: () => { throw new Error('EACCES'); },
  });
  await sleep(25);
  stopUnreadable();
  ok('readdir failure inside poll is swallowed (no emit, no throw)', unreadable.length === 0);

  // ---- FAIL-SAFE: malformed JSONL line is skipped, valid lines still emit ----
  const malformedFile = path.join(sessionDir, '20260626140000_malformed.jsonl');
  const malformedHeader = { type: 'session', version: 3, id: 'malformed', timestamp: '2026-06-26T14:00:00.000Z', cwd: '/m' };
  fs.writeFileSync(malformedFile, `${JSON.stringify(malformedHeader)}\n{this is not valid json\n${JSON.stringify(userTurn)}\n`);
  const malEvents = [];
  const stopMal = watchRecoder((e) => malEvents.push(e), { sessionsDir, intervalMs: 1000, now: () => 13 });
  await sleep(10);
  stopMal();
  const malformedEvt = malEvents.find((e) => e.window_id === 'recoder|malformed');
  ok('skips malformed JSONL lines, still emits valid ones', !!malformedEvt && /fix the login bug/.test(malformedEvt.text), malformedEvt && malformedEvt.text);

  // ---- text cap (~4000 chars) ----
  const bigFile = path.join(sessionDir, '20260626150000_big.jsonl');
  const bigHeader = { type: 'session', version: 3, id: 'big', timestamp: '2026-06-26T15:00:00.000Z', cwd: '/x' };
  const bigAssistant = { type: 'message', id: 'b1', parentId: null, timestamp: '2026-06-26T15:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'X'.repeat(10000) }] } };
  fs.writeFileSync(bigFile, `${JSON.stringify(bigHeader)}\n${JSON.stringify(bigAssistant)}\n`);
  const bigEvents = [];
  const stopBig = watchRecoder((e) => bigEvents.push(e), { sessionsDir, intervalMs: 1000, now: () => 17 });
  await sleep(10);
  stopBig();
  const bigEvt = bigEvents.find((e) => e.window_id === 'recoder|big');
  ok('caps text length to maxBytes', !!bigEvt && bigEvt.text.length <= 4000, bigEvt && bigEvt.text.length);

  // cleanup the real temp fixtures
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

  console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
