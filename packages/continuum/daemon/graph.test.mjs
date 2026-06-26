// graph — temporal KG client: pure local pre-extraction + injectable-fetch sidecar calls.
// Zero deps, zero real network — the fake fetchImpl records every request.
import { createGraph, entitiesFor } from './graph.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

// Fake fetch: records {url, body}, returns a canned JSON response.
function fakeFetch(reply = { results: [{ fact: 'Arhan built Continuum', uuid: 'u1' }] }) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { json: async () => reply };
  };
  fn.calls = calls;
  return fn;
}

console.log('\ngraph (temporal knowledge-graph client)\n');

// ---- entitiesFor: pure local pre-extractor ----
const ex = entitiesFor('Arhan built Continuum with Node. Continuum indexes Episodes.');
const names = ex.entities.map((e) => e.name);
ok('extracts proper-noun entities', names.includes('Arhan') && names.includes('Continuum') && names.includes('Node'));
ok('de-dupes repeated entities', names.filter((n) => n === 'Continuum').length === 1);
ok('drops sentence-leading filler caps', !names.includes('The') && !names.includes('With'));
const built = ex.relations.find((r) => r.subject === 'Arhan' && r.object === 'Continuum');
ok('extracts an SVO relation', !!built && built.predicate === 'built', JSON.stringify(ex.relations));
ok('skips pure-preposition gaps (no Continuum-with-Node)', !ex.relations.find((r) => r.predicate === 'with'));
ok('empty text → empty extraction', (() => { const e = entitiesFor(''); return e.entities.length === 0 && e.relations.length === 0; })());

// ---- add(): posts the correct structured shape ----
const f1 = fakeFetch({ ok: true });
const g1 = createGraph({ url: 'http://x', group: 'me', fetchImpl: f1 });
const addRes = await g1.add({ app: 'Code', title: 'work', text: 'Arhan shipped Continuum.', end: 1700000000000, source_mix: ['input'], salience: 0.7 });
const ab = f1.calls[0];
ok('add posts to /add', ab && ab.url === 'http://x/add');
ok('add sends text + group_id + name', ab.body.text === 'Arhan shipped Continuum.' && ab.body.group_id === 'me' && ab.body.name === 'work');
ok('add sends local entities + relations', Array.isArray(ab.body.entities) && ab.body.entities.some((e) => e.name === 'Continuum') && Array.isArray(ab.body.relations));
ok('add converts episode time to ISO date', ab.body.date === new Date(1700000000000).toISOString());
ok('add returns sidecar json', addRes && addRes.ok === true);
const f1b = fakeFetch(); const g1b = createGraph({ fetchImpl: f1b });
await g1b.add({ app: 'X' });
ok('add(empty) makes no network call', f1b.calls.length === 0);

// ---- search(): backward-compatible { results } ----
const f2 = fakeFetch({ results: [{ fact: 'F1' }, { fact: 'F2' }] });
const g2 = createGraph({ group: 'me', fetchImpl: f2 });
const sr = await g2.search('what did I build', 'me', 4);
ok('search posts query + group_id + k', f2.calls[0].url.endsWith('/search') && f2.calls[0].body.query === 'what did I build' && f2.calls[0].body.k === 4);
ok('search returns parsed results array', sr.results.length === 2 && sr.results[0].fact === 'F1');

// ---- temporalQuery(): builds since/until ISO window ----
const f3 = fakeFetch({ results: [{ fact: 'edge' }] });
const g3 = createGraph({ fetchImpl: f3 });
const since = 1700000000000, until = '2026-01-01T00:00:00.000Z';
const tq = await g3.temporalQuery({ entity: 'Continuum', since, until, k: 3 });
const tb = f3.calls[0].body;
ok('temporalQuery sends entity focus', tb.entity === 'Continuum' && tb.query === 'Continuum');
ok('temporalQuery sends ISO since', tb.since === new Date(since).toISOString());
ok('temporalQuery sends ISO until', tb.until === until);
const f3b = fakeFetch({ results: [] }); const g3b = createGraph({ fetchImpl: f3b });
await g3b.temporalQuery({ entity: 'X' });
ok('temporalQuery without bounds omits since/until', !('since' in f3b.calls[0].body) && !('until' in f3b.calls[0].body));
ok('temporalQuery returns results', tq.results.length === 1 && tq.results[0].fact === 'edge');

// ---- graceful failure: fetch throws → empty, never throws ----
const throwing = async () => { throw new Error('ECONNREFUSED'); };
const g4 = createGraph({ fetchImpl: throwing });
let threw = false; let s4, t4, a4;
try { s4 = await g4.search('q'); t4 = await g4.temporalQuery({ entity: 'E', since: 1 }); a4 = await g4.add({ text: 'Arhan built Continuum.' }); }
catch { threw = true; }
ok('search degrades to empty on fetch error', !threw && s4.results.length === 0);
ok('temporalQuery degrades to empty on fetch error', t4.results.length === 0);
ok('add degrades to {ok:false} on fetch error', a4 && a4.ok === false);

// ---- no fetch available → still no throw ----
const g5 = createGraph({ fetchImpl: null });
let s5; let threw5 = false;
try { s5 = await g5.search('q'); } catch { threw5 = true; }
ok('missing fetch → empty results, no throw', !threw5 && s5.results.length === 0);

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
