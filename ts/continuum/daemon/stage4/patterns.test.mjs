// patterns — temporal + behavioral model over episodes (deterministic, injected clock).
import { computePatterns, patternsMarkdown, SECTION } from './patterns.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

console.log('\npatterns (how/when the user works)\n');

// Fixed clock so hour buckets are deterministic regardless of the runner's timezone... we build
// timestamps from local Date parts so getHours() in the module round-trips exactly.
const at = (h, m = 0, day = 15) => new Date(2026, 5, day, h, m, 0).getTime();   // June 2026
const MIN = 60000;
const ep = (app, hour, durMin, opts = {}) => ({ app, start: at(hour, opts.min || 0, opts.day), end: at(hour, (opts.min || 0) + durMin, opts.day), active_duration: durMin * MIN, ...opts });

// A morning Code-heavy session, a couple of browser detours, then an afternoon meeting block.
const eps = [
  ep('Code', 9, 30, { min: 0 }),
  ep('Code', 9, 30, { min: 30 }),
  ep('Code', 10, 20, { min: 0 }),     // 3-in-a-row Code streak
  ep('Chrome', 10, 5, { min: 20 }),   // switch Code->Chrome
  ep('Code', 10, 25, { min: 30 }),    // switch Chrome->Code
  ep('Slack', 14, 10),                // switch Code->Slack
  ep('Slack', 14, 10, { min: 10 }),
  ep('Zoom', 14, 40, { min: 20 }),    // switch Slack->Zoom (long meeting)
];

const now = at(18);
const p = computePatterns(eps, { now });

// hours-of-day histogram
ok('hour histogram only lists active hours', p.hours.every((h) => h.count > 0));
const h9 = p.hours.find((h) => h.hour === 9);
ok('hour 9 has the two morning Code episodes', h9 && h9.count === 2, JSON.stringify(h9));
const h10 = p.hours.find((h) => h.hour === 10);
ok('hour 10 buckets three episodes', h10 && h10.count === 3, JSON.stringify(h10));
ok('peak hour is 10 (3 episodes)', p.peakHour.hour === 10, JSON.stringify(p.peakHour));

// app time-distribution by active_duration — Code (100m) leads
ok('apps ranked by summed active time', p.apps[0].app === 'Code', JSON.stringify(p.apps[0]));
ok('Code active minutes sum to 105m', p.apps[0].ms === 105 * MIN, p.apps[0].ms);
ok('app shares are percentages that include Code', p.apps[0].share > 0 && p.apps[0].share <= 100, p.apps[0].share);

// transitions: detect Code->Chrome and Chrome->Code, ignore same-app runs
const cc = p.transitions.find((t) => t.from === 'Code' && t.to === 'Chrome');
ok('detects Code -> Chrome transition', cc && cc.count === 1, JSON.stringify(cc));
ok('no self-transition for repeated Code episodes', !p.transitions.find((t) => t.from === t.to));
ok('counts only real app switches (4 hops)', p.focus.switches === 4, p.focus.switches);

// focus vs fragmentation
ok('avg episode length computed', p.focus.avgEpisodeMs > 0);
ok('switch rate between 0 and 1', p.focus.switchRate >= 0 && p.focus.switchRate <= 1, p.focus.switchRate);

// day-parts: late morning (9-12) should outweigh afternoon here
ok('busiest day-part is late morning', p.dayParts[0].part === 'late morning', JSON.stringify(p.dayParts[0]));

// deep-work streaks: the 3 consecutive Code episodes form a streak
ok('detects a Code deep-work streak', p.streaks.some((s) => s.app === 'Code' && s.count >= 3), JSON.stringify(p.streaks));

// markdown shape
const md = patternsMarkdown(eps, { now });
ok('markdown starts with # Patterns', md.startsWith('# Patterns'));
ok('markdown mentions the dominant app', /Code/.test(md), md);
ok('markdown is multi-line and grounded', md.split('\n').length >= 3);

// empty case
ok('empty episodes -> (nothing yet)', patternsMarkdown([], { now }) === '# Patterns\n(nothing yet)');
ok('compute on empty is safe', computePatterns([], { now }).episodes === 0);
ok('compute ignores undated episodes', computePatterns([{ app: 'X', active_duration: 1000 }], { now }).episodes === 0);

// SECTION descriptor
ok('SECTION targets patterns.md', SECTION.file === 'patterns.md' && SECTION.title === 'Patterns');
ok('SECTION has an LLM ask', typeof SECTION.ask === 'string' && SECTION.ask.length > 20);

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
