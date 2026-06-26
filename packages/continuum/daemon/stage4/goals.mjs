// Stage 4 — goals & blockers. Pure, model-free detection of the user's ACTIVE threads
// (recurring work with sustained recent activity) and where they're STUCK: errors that
// recur on the same window/topic, the same problem revisited across sessions, and long
// threads that span days without a "resolved" signal. Heuristic tier always; the SECTION
// lets a model enrich the same understanding on Pro. Deterministic over (episodes, now).

const DAY = 864e5;
const ENTITY = /\b[A-Z][a-zA-Z0-9]{2,}\b/g;                  // proper-noun-ish project/topic tokens
const STOP = new Set('The This That And But For With From Code None True False New Get Set Add Run All My Me You Your'.split(' '));
// error-shaped signals (free-text or stack-trace shape) — what "stuck" looks like on screen.
const ERROR_RE = /\b(error|exception|traceback|stack ?trace|cannot|can'?t|undefined|null|segfault|panic|crash(ed)?|fail(ed|ing|ure|s)?|not found|refused|denied|timed? ?out|timeout|reject(ed)?|unresolved|nan|broken)\b/i;
const STACK_RE = /^\s*(at\s+\w|File ".*", line \d|Traceback|\w+Error:|\w+Exception)/m;
// a real resolution — when present on a topic, it is no longer "stuck".
const RESOLVED_RE = /\b(fixed|resolved|works now|working now|solved|passing|tests? pass|green|merged|shipped|deployed|got it working)\b/i;

const tOf = (e) => e.end || e.start || 0;
const epId = (e) => 'ep_' + (e.content_hash || tOf(e) || 0);
const dayOf = (t) => Math.floor(t / DAY);
const blob = (e) => `${e.title || ''} ${e.text || ''}`;
const isError = (txt) => ERROR_RE.test(txt) || STACK_RE.test(txt);

// proper-noun-ish entities in an episode (the candidate project/topic names) — dedup per episode,
// drop stop-words, the host app name, and anything that is itself an error token (TypeError, …).
const entitiesIn = (e) => {
  const app = (e.app || '').toLowerCase(), out = new Set();
  for (const w of blob(e).match(ENTITY) || []) {
    if (STOP.has(w) || w.toLowerCase() === app) continue;
    if (/error|exception|traceback|warn|fail/i.test(w)) continue;
    out.add(w);
  }
  return [...out];
};

const ago = (t, now) => {
  if (!t) return 'unknown';
  const s = Math.max(0, (now - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

// computeGoals — pure. Active goals = recurring entities with sustained recent activity;
// stuck = error/problem signals on a window/topic that haven't been resolved.
export function computeGoals(episodes = [], { now = Date.now(), recentDays = 7, minActivity = 3 } = {}) {
  const eps = (episodes || []).filter((e) => tOf(e));
  const recentMs = now - recentDays * DAY;

  // --- active goals: recurring entity threads, still warm ---
  const threads = new Map();                                 // entity -> rollup
  for (const e of eps) for (const ent of entitiesIn(e)) {
    const t = threads.get(ent) || { title: ent, count: 0, days: new Set(), lastSeen: 0, eps: [] };
    t.count++; t.days.add(dayOf(tOf(e))); t.lastSeen = Math.max(t.lastSeen, tOf(e)); t.eps.push(e);
    threads.set(ent, t);
  }
  const goals = [...threads.values()]
    .filter((t) => t.lastSeen >= recentMs && (t.count >= minActivity || t.days.size >= 2))  // sustained, not a one-off
    .sort((a, b) => b.lastSeen - a.lastSeen || b.count - a.count)
    .map((t) => ({
      title: t.title,
      lastSeen: t.lastSeen,
      evidence: t.eps.slice().sort((a, b) => tOf(b) - tOf(a)).slice(0, 3).map(epId),
    }));

  // --- stuck: bucket episodes by window/topic, look for unresolved error signal ---
  const groups = new Map();
  const gkey = (e) => e.window_id || e.title || e.app || 'unknown';
  for (const e of eps) {
    const key = gkey(e), txt = blob(e);
    const g = groups.get(key) || { eps: [], errs: [], errDays: new Set(), span: new Set(), firstSeen: Infinity, lastSeen: 0, resolved: false };
    g.eps.push(e); g.span.add(dayOf(tOf(e)));
    g.firstSeen = Math.min(g.firstSeen, tOf(e)); g.lastSeen = Math.max(g.lastSeen, tOf(e));
    if (RESOLVED_RE.test(txt)) g.resolved = true;
    if (isError(txt)) { g.errs.push(e); g.errDays.add(dayOf(tOf(e))); }
    groups.set(key, g);
  }

  // a readable topic label for a bucket: its dominant recurring entity, else latest title, else app.
  const labelFor = (g) => {
    const c = new Map();
    for (const e of g.eps) for (const ent of entitiesIn(e)) c.set(ent, (c.get(ent) || 0) + 1);
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) return top[0];
    const titled = g.eps.filter((e) => e.title).sort((a, b) => tOf(b) - tOf(a))[0];
    return (titled && titled.title) || (g.eps[g.eps.length - 1] || {}).app || 'unknown';
  };

  const stuck = [];
  for (const g of groups.values()) {
    if (g.resolved || !g.errs.length) continue;
    if (g.errs.length >= 2) {
      // repeated error on the same window/topic — counted; spanning days == revisited across sessions.
      const signal = g.errDays.size >= 2 ? 'recurring error across sessions' : 'repeated error';
      stuck.push({ topic: labelFor(g), signal, count: g.errs.length, lastSeen: g.lastSeen });
    } else if (g.span.size >= 2 || g.lastSeen - g.firstSeen >= 2 * DAY) {
      // a lone open problem still alive on the topic days later, never resolved.
      stuck.push({ topic: labelFor(g), signal: 'unresolved thread spanning days', count: g.eps.length, lastSeen: g.lastSeen });
    }
  }
  stuck.sort((a, b) => b.lastSeen - a.lastSeen || b.count - a.count);

  return { goals, stuck };
}

// goalsMarkdown — the durable free-tier rendering (model-free), same shape the dream SECTION fills.
export function goalsMarkdown(episodes = [], { now = Date.now() } = {}) {
  const { goals, stuck } = computeGoals(episodes, { now });
  const active = goals.length
    ? goals.map((g) => `- **${g.title}** — active, last touched ${ago(g.lastSeen, now)} (${g.evidence.join(', ')})`).join('\n')
    : '(nothing yet)';
  const blocked = stuck.length
    ? stuck.map((s) => `- **${s.topic}** — ${s.signal} ×${s.count}, last ${ago(s.lastSeen, now)}`).join('\n')
    : '(nothing yet)';
  return `# Goals\n## Active\n${active}\n## Stuck / Blocked\n${blocked}`;
}

// Pro tier: a model re-grounds the same section over the evidence digest (wired in by the integrator).
export const SECTION = {
  file: 'goals.md',
  title: 'Goals',
  ask: 'The user\'s active goals and what they appear STUCK or blocked on right now (repeated errors, unresolved threads). Ground in evidence; be specific and current.',
};
