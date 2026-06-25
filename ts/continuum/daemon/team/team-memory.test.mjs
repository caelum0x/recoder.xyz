// team-memory — merge/attribution, CAS no-clobber, latest-per-member, audit. Injected in-memory
// stores: zero real fs/clock. Style mirrors stage1/chrome.test.mjs.
import { createTeamMemory } from './team-memory.mjs';
import { contentHash } from '../stage2/segmenter.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

const sha = (s) => contentHash(s || '');
const serialize = (sections) => JSON.stringify(sections || {}, Object.keys(sections || {}).sort());

// in-memory member store (the injectable fake) — dumb storage, CAS lives in the team layer.
function memStore() {
  const data = new Map(); // id -> sections map
  return {
    readMember: (id) => { const sections = data.get(id) || {}; return { sha: sha(serialize(sections)), sections }; },
    writeMember: (id, sections) => { data.set(id, sections); return { ok: true, sha: sha(serialize(sections)) }; },
    listMembers: () => [...data.keys()].sort(),
  };
}

console.log('\nteam-memory (shared CAS-guarded team view)\n');

let clock = 1000;
const tm = createTeamMemory({ ...memStore(), now: () => ++clock });

// --- CAS write succeeds with correct expectSha ---
const a0 = tm.read('alice').sha;
const r1 = tm.write('alice', 'projects', 'recoder migration', { expectSha: a0 });
ok('CAS write succeeds with correct expectSha', r1.ok === true && !r1.conflict);

// --- stale expectSha conflicts and does NOT clobber ---
const r2 = tm.write('alice', 'projects', 'POISONED by injected agent', { expectSha: a0 });
ok('stale expectSha returns conflict', r2.conflict === true && r2.ok === false);
ok('conflict did not clobber existing value', tm.read('alice').sections.projects === 'recoder migration');

// --- second member writes a different section ---
const b0 = tm.read('bob').sha;
tm.write('bob', 'people', 'arhan = platform lead', { expectSha: b0 });

// --- merge with attribution ---
const view = tm.teamView();
ok('view lists both members', view.members.includes('alice') && view.members.includes('bob'));
ok('projects attributed to alice', view.sections.projects.some((c) => c.member === 'alice' && /recoder/.test(c.text)));
ok('people attributed to bob', view.sections.people.some((c) => c.member === 'bob' && /platform lead/.test(c.text)));

// --- team view reflects LATEST per member (re-read sha, write again) ---
const a1 = tm.read('alice').sha;
const r3 = tm.write('alice', 'projects', 'recoder migration shipped', { expectSha: a1 });
ok('fresh-sha update succeeds', r3.ok === true);
ok('view reflects latest per member', tm.teamView().sections.projects.some((c) => c.member === 'alice' && /shipped/.test(c.text)));

// --- conflict surfacing: both members write the same section differently ---
const ax = tm.read('alice').sha; tm.write('alice', 'taste', 'dark mode, dense', { expectSha: ax });
const bx = tm.read('bob').sha; tm.write('bob', 'taste', 'light mode, airy', { expectSha: bx });
const cf = tm.conflicts();
ok('conflict surfaced for divergent section', cf.some((c) => c.section === 'taste' && c.members.includes('alice') && c.members.includes('bob')));

// --- audit lists writers / who-wrote-what ---
ok('audit lists writers', tm.writers().includes('alice') && tm.writers().includes('bob'));
ok('audit records each write (attributed)', tm.audit().length >= 4 && tm.audit().every((e) => e.member && e.section && e.sha));

// --- no-precondition write always applies (expectSha omitted) ---
const r4 = tm.write('carol', 'about', 'new teammate');
ok('write without expectSha applies', r4.ok === true && tm.read('carol').sections.about === 'new teammate');

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
