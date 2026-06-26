// Expertise — infer the user's demonstrated SKILLS from activity: the languages they actually code
// in, the tools/frameworks they reach for, and the topics they work in. Pure heuristic (free tier):
// no model, deterministic, time injected — ranks each skill by how much it ACTUALLY appears
// (frequency × recency × breadth) so daily work outranks a one-off mention. The dream SECTION below
// enriches the same shape with a model (Pro). Zero deps; mirrors mcp.profile()'s countBy/topN style.

const DAY = 864e5;
const tOf = (e) => e.end || e.start || 0;
const CODE = new Set(['editor', 'git', 'terminal']);                  // source_mix that proves real coding

// file extension → language. The strongest, least-ambiguous language signal (a .rs on screen is Rust).
const EXT = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript',
  py: 'Python', rs: 'Rust', go: 'Go', rb: 'Ruby', java: 'Java', kt: 'Kotlin', swift: 'Swift',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', cs: 'C#', php: 'PHP',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'CSS',
  lua: 'Lua', ex: 'Elixir', exs: 'Elixir', scala: 'Scala', dart: 'Dart', pl: 'Perl',
};
// language keyword fallbacks (text mentions when no file is visible). \bjava\b won't fire on javascript.
const LANG_KW = [
  ['Python', /\bpython\b|\bpytest\b|\bpip install\b|\bvirtualenv\b/],
  ['Rust', /\brust\b|\bcargo (build|run|test|add|check)\b|\brustc\b/],
  ['Go', /\bgolang\b|\bgo (build|run|mod|test)\b/],
  ['TypeScript', /\btypescript\b/],
  ['JavaScript', /\bjavascript\b|\bnode\.?js\b|\bnodejs\b/],
  ['Ruby', /\bruby\b|\bbundle (exec|install)\b/],
  ['Java', /\bjava\b/],
  ['Swift', /\bswift\b/],
  ['Kotlin', /\bkotlin\b/],
  ['C++', /\bc\+\+\b/],
  ['Shell', /\bbash\b|\bzsh\b|#!\/bin\/(ba)?sh\b/],
  ['SQL', /\bselect .+ from \b/],
];
// curated tools/frameworks — a closed set so on-screen noise can't invent skills (like region labels).
const TOOLS = [
  ['React', /\breact\b/], ['Vue', /\bvue(\.js)?\b/], ['Svelte', /\bsvelte(kit)?\b/], ['Angular', /\bangular\b/],
  ['Next.js', /\bnext\.?js\b/], ['Remix', /\bremix\b/], ['Express', /\bexpress\b/],
  ['Django', /\bdjango\b/], ['Flask', /\bflask\b/], ['FastAPI', /\bfastapi\b/], ['Rails', /\brails\b/], ['Spring', /\bspring boot\b/],
  ['PostgreSQL', /\bpostgres(ql)?\b/], ['MySQL', /\bmysql\b/], ['SQLite', /\bsqlite\b/], ['MongoDB', /\bmongo(db)?\b/], ['Redis', /\bredis\b/],
  ['Docker', /\bdocker\b/], ['Kubernetes', /\bkubernetes\b|\bkubectl\b|\bk8s\b/], ['Nginx', /\bnginx\b/],
  ['Tailwind', /\btailwind\b/], ['GraphQL', /\bgraphql\b/], ['Vite', /\bvite\b/], ['Webpack', /\bwebpack\b/],
  ['Prisma', /\bprisma\b/], ['Drizzle', /\bdrizzle\b/], ['AWS', /\baws\b/], ['GCP', /\bgcp\b|\bgoogle cloud\b/],
  ['Terraform', /\bterraform\b/], ['Kafka', /\bkafka\b/], ['GitHub', /\bgithub\b/],
  ['Git', /\bgit (commit|push|pull|merge|rebase|status|clone|checkout|diff)\b/],
];
// common Capitalized words that are NOT topics — keeps the topic extractor from surfacing noise.
const STOP = new Set('the this that with from have your you our about into over more most just like will your what when then they them code file files line page user using used app the and for'.split(' '));

// per-skill accumulator: weighted count + last-seen time + distinct contexts (apps) = breadth.
const bump = (m, name, e, w) => {
  const c = m.get(name) || { name, count: 0, lastSeen: 0, apps: new Set() };
  c.count += w; const t = tOf(e); if (t > c.lastSeen) c.lastSeen = t;
  if (e.app) c.apps.add(e.app);
  m.set(name, c);
};

// proficiency signal in 0..1: saturating frequency, ~monthly recency decay, context breadth. Pure,
// deterministic given `now` — no normalization across the set so a skill's score is stable on its own.
const score = (c, now) => {
  const freq = 1 - 1 / (1 + c.count);
  const recency = c.lastSeen ? Math.exp(-Math.max(0, now - c.lastSeen) / (30 * DAY)) : 0;
  const breadth = 1 - 1 / (1 + c.apps.size);
  return +(0.5 * freq + 0.3 * recency + 0.2 * breadth).toFixed(4);
};
const rank = (m, now, n) => [...m.values()]
  .map((c) => ({ name: c.name, score: score(c, now) }))
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  .slice(0, n);

// computeExpertise — the whole heuristic. Returns { languages, tools, topics }, each ranked by score.
export function computeExpertise(episodes = [], { now = Date.now() } = {}) {
  const langs = new Map(), tools = new Map(), topics = new Map();
  const claimed = new Set();                                          // lowercased names already a lang/tool
  for (const e of episodes) {
    const text = String(e.text || '');
    if (!text) continue;
    const lower = text.toLowerCase();
    const w = (e.source_mix || []).some((s) => CODE.has(s)) ? 2 : 1;  // real editor/git/terminal weighs double
    // languages — file extensions first, then keyword fallbacks
    for (const m of text.matchAll(/\.([a-z0-9]{1,6})\b/gi)) { const l = EXT[m[1].toLowerCase()]; if (l) bump(langs, l, e, w); }
    for (const [l, re] of LANG_KW) if (re.test(lower)) bump(langs, l, e, w);
    // tools/frameworks — curated closed set
    for (const [name, re] of TOOLS) if (re.test(lower)) bump(tools, name, e, w);
  }
  for (const n of [...langs.keys(), ...tools.keys()]) claimed.add(n.toLowerCase());
  // topics — recurring Capitalized entities not already a language/tool and not stopwords
  for (const e of episodes) {
    for (const word of String(e.text || '').match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g) || []) {
      const k = word.toLowerCase();
      if (STOP.has(k) || claimed.has(k)) continue;
      bump(topics, word, e, 1);
    }
  }
  return { languages: rank(langs, now, 8), tools: rank(tools, now, 12), topics: rank(topics, now, 8) };
}

// expertiseMarkdown — the free-tier durable rendering (what dream writes when there's no model).
export function expertiseMarkdown(episodes = [], { now = Date.now() } = {}) {
  const { languages, tools, topics } = computeExpertise(episodes, { now });
  if (!languages.length && !tools.length && !topics.length) return '# Expertise\n(nothing yet)';
  const line = (xs) => xs.map((x) => `${x.name} (${x.score.toFixed(2)})`).join(', ');
  const out = ['# Expertise'];
  if (languages.length) out.push('', '## Languages', line(languages));
  if (tools.length) out.push('', '## Tools & frameworks', line(tools));
  if (topics.length) out.push('', '## Topics', line(topics));
  return out.join('\n');
}

// SECTION — the LLM-enriched (Pro) descriptor dream() merges evidence into. Same file the heuristic
// renders, so free tier and Pro tier write one coherent expertise.md.
export const SECTION = {
  file: 'expertise.md',
  title: 'Expertise',
  ask: 'The user\'s demonstrated skills — languages, frameworks, tools, domains they clearly work in (not dabble). Ground in evidence; rank by how much they actually appear.',
};
