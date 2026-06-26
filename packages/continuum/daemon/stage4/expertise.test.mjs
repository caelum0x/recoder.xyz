// expertise — infer the user's demonstrated skills (languages/tools/topics) from activity, heuristic.
import { computeExpertise, expertiseMarkdown, SECTION } from './expertise.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

console.log('\nexpertise (skills/expertise graph)\n');

const NOW = 1_700_000_000_000;                                         // fixed clock → deterministic scores
const DAY = 864e5;
const ep = (o) => ({ app: 'Code', source_mix: [], end: NOW, ...o });

// A user who codes TS/Python/Rust, leans hard on React, dabbles in Postgres once a month ago.
const eps = [
  ep({ app: 'Code', source_mix: ['editor'], end: NOW, text: 'editing app/components/Chat.tsx — wiring the React state' }),
  ep({ app: 'Terminal', source_mix: ['terminal'], end: NOW, text: 'npm run build then vite dev for the React app' }),
  ep({ app: 'Code', source_mix: ['editor'], end: NOW - DAY, text: 'refactor src/store.ts and src/index.ts, more React hooks' }),
  ep({ app: 'iTerm', source_mix: ['git'], end: NOW - DAY, text: 'git commit -m "react: fix render"; pushed' }),
  ep({ app: 'Code', source_mix: ['editor'], end: NOW - 2 * DAY, text: 'daemon/dream.py cleanup, ran pytest, all green' }),
  ep({ app: 'Terminal', source_mix: ['terminal'], end: NOW - 2 * DAY, text: 'cargo build && cargo test for the rust crate' }),
  ep({ app: 'Code', source_mix: ['editor'], end: NOW - 3 * DAY, text: 'wrote lib.rs and main.rs for the Rust sidecar' }),
  ep({ app: 'Code', source_mix: ['editor'], end: NOW - 3 * DAY, text: 'python pipeline.py — tuning the Hetzner ingest' }),
  ep({ app: 'Terminal', source_mix: ['terminal'], end: NOW - 30 * DAY, text: 'connected to postgres once to check a table' }),
];

const { languages, tools, topics } = computeExpertise(eps, { now: NOW });
const names = (xs) => xs.map((x) => x.name);

// languages: from extensions (.tsx/.ts, .py, .rs) AND keywords (python, cargo→Rust)
ok('detects TypeScript from .ts/.tsx', names(languages).includes('TypeScript'));
ok('detects Python from .py + keyword', names(languages).includes('Python'));
ok('detects Rust from .rs + cargo', names(languages).includes('Rust'));
ok('every language has a 0..1 score', languages.every((l) => l.score > 0 && l.score <= 1));
ok('languages ranked by score (desc)', languages.every((l, i) => i === 0 || languages[i - 1].score >= l.score));

// tools: React is everywhere & recent → must outrank PostgreSQL (one old mention)
ok('detects React (curated tool)', names(tools).includes('React'));
ok('detects Vite + Git too', names(tools).includes('Vite') && names(tools).includes('Git'));
ok('React outranks PostgreSQL (frequency+recency)', names(tools).indexOf('React') < names(tools).indexOf('PostgreSQL'));

// topics: capitalized entity not already a lang/tool, no stopword noise
ok('surfaces a real topic (Hetzner)', names(topics).includes('Hetzner'));
ok('topics exclude language/tool names', !names(topics).some((t) => /^(react|rust|python)$/i.test(t)));

// markdown rendering
const md = expertiseMarkdown(eps, { now: NOW });
ok('markdown starts with # Expertise', md.startsWith('# Expertise'));
ok('markdown has the section headers', /## Languages/.test(md) && /## Tools & frameworks/.test(md));
ok('markdown lists a detected skill', /React/.test(md) && /TypeScript/.test(md));

// recency matters: same skill seen recently scores higher than seen long ago
const recent = computeExpertise([ep({ source_mix: ['editor'], end: NOW, text: 'main.go build' })], { now: NOW });
const stale = computeExpertise([ep({ source_mix: ['editor'], end: NOW - 200 * DAY, text: 'main.go build' })], { now: NOW });
ok('recency lifts the score', recent.languages[0].score > stale.languages[0].score);

// empty case — no fabrication
const empty = computeExpertise([], { now: NOW });
ok('empty → empty arrays', !empty.languages.length && !empty.tools.length && !empty.topics.length);
ok('empty markdown says nothing yet', expertiseMarkdown([], { now: NOW }) === '# Expertise\n(nothing yet)');

// SECTION descriptor wiring
ok('SECTION targets expertise.md', SECTION.file === 'expertise.md' && SECTION.title === 'Expertise' && SECTION.ask.length > 20);

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
