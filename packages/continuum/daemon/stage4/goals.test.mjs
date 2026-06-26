// goals — active-thread detection + STUCK signals (repeated errors, unresolved spanning days).
import { computeGoals, goalsMarkdown, SECTION } from './goals.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

console.log('\nStage 4 goals (active threads · stuck signals)\n');

const now = Date.parse('2026-06-26T12:00:00Z');
const at = (daysAgo, h = 0) => now - daysAgo * 864e5 - h * 36e5;

const eps = [
  // active project thread "Continuum": recurring, multi-day, recent, no error → a goal
  { content_hash: 'c1', app: 'Code', window_id: 'win-cont', title: 'Continuum daemon', text: 'working on Continuum retrieval index', start: at(2), end: at(2), salience: 0.8 },
  { content_hash: 'c2', app: 'Code', window_id: 'win-cont', title: 'Continuum daemon', text: 'Continuum dream consolidation sections', start: at(1), end: at(1), salience: 0.7 },
  { content_hash: 'c3', app: 'Code', window_id: 'win-cont', title: 'Continuum daemon', text: 'shipping Continuum goals module today', start: at(0, 2), end: at(0, 2), salience: 0.9 },
  // a recurring error on the SAME window across sessions, never resolved → stuck
  { content_hash: 'e1', app: 'Terminal', window_id: 'win-build', title: 'build', text: 'TypeError: undefined is not a function at parse()', source_mix: ['terminal'], start: at(2, 1), end: at(2, 1), salience: 0.6 },
  { content_hash: 'e2', app: 'Terminal', window_id: 'win-build', title: 'build', text: 'still failing: undefined is not a function', source_mix: ['terminal'], start: at(1, 1), end: at(1, 1), salience: 0.6 },
  { content_hash: 'e3', app: 'Terminal', window_id: 'win-build', title: 'build', text: 'cannot read property of undefined, build failed again', source_mix: ['terminal'], start: at(0, 3), end: at(0, 3), salience: 0.6 },
  // a one-off, must not become a goal
  { content_hash: 'o1', app: 'Mail', window_id: 'win-mail', title: 'Inbox', text: 'Lunch invite from a friend', start: at(0, 5), end: at(0, 5), salience: 0.2 },
];

const { goals, stuck } = computeGoals(eps, { now });

// --- active goal detection ---
ok('detects the active "Continuum" thread', goals.some((g) => g.title === 'Continuum'), JSON.stringify(goals.map((g) => g.title)));
ok('a one-off is NOT a goal', !goals.some((g) => g.title === 'Lunch' || g.title === 'Inbox'));
ok('error tokens are not mistaken for goals', !goals.some((g) => /error/i.test(g.title)));
{
  const cont = goals.find((g) => g.title === 'Continuum');
  ok('goal carries grounded ep evidence, recent-first', cont.evidence[0] === 'ep_c3' && cont.evidence.every((id) => id.startsWith('ep_')), JSON.stringify(cont.evidence));
  ok('goal lastSeen is the most recent touch (recency)', cont.lastSeen === at(0, 2));
}

// --- stuck detection ---
{
  const blocked = stuck.find((s) => s.count === 3 && /error/i.test(s.signal));
  ok('detects the recurring build error', !!blocked, JSON.stringify(stuck));
  ok('repeated error is counted (×3)', blocked && blocked.count === 3);
  ok('flags it as revisited across sessions', blocked && /across sessions/.test(blocked.signal), blocked && blocked.signal);
  ok('stuck lastSeen is recent (recency)', blocked && blocked.lastSeen === at(0, 3));
  ok('the active healthy thread is NOT stuck', !stuck.some((s) => s.topic === 'Continuum'));
}

// a resolved problem drops out of "stuck"
{
  const resolved = [...eps.slice(3), { content_hash: 'e4', app: 'Terminal', window_id: 'win-build', title: 'build', text: 'fixed it — build passing now, tests green', start: at(0, 1), end: at(0, 1) }];
  const r = computeGoals(resolved, { now });
  ok('a resolved thread is no longer stuck', !r.stuck.some((s) => /error/i.test(s.signal)), JSON.stringify(r.stuck));
}

// --- markdown rendering ---
{
  const md = goalsMarkdown(eps, { now });
  ok('markdown has the # Goals header', md.startsWith('# Goals'));
  ok('markdown has both sections', /## Active/.test(md) && /## Stuck \/ Blocked/.test(md));
  ok('markdown lists the active goal', /Continuum/.test(md));
  ok('markdown lists a stuck item under blocked', /Stuck \/ Blocked[\s\S]*×3/.test(md), md);
}

// --- empty case ---
{
  const empty = computeGoals([], { now });
  ok('empty store → no goals, no stuck', empty.goals.length === 0 && empty.stuck.length === 0);
  const md = goalsMarkdown([], { now });
  ok('empty markdown still has both sections with (nothing yet)', /## Active\n\(nothing yet\)/.test(md) && /## Stuck \/ Blocked\n\(nothing yet\)/.test(md), md);
}

// --- SECTION descriptor (Pro tier) ---
ok('SECTION descriptor is wired for the dream pass', SECTION.file === 'goals.md' && SECTION.title === 'Goals' && /stuck|blocked/i.test(SECTION.ask));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
