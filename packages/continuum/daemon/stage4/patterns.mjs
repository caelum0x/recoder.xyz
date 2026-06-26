// Patterns — model HOW and WHEN this user works, purely from episodes. No LLM, no clock reads:
// time is injected so the compute is deterministic and testable. Heuristic always (free tier);
// the SECTION descriptor lets dreaming enrich the same understanding with a model (Pro tier).

const durOf = (e) => Math.max(0, Number(e.active_duration) || 0);
const tOf = (e) => Number(e.start ?? e.end ?? 0);
const appOf = (e) => e.app || 'Unknown';
const fmtDur = (ms) => { const m = Math.round(ms / 60000); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`; };
const countBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (k != null) m.set(k, (m.get(k) || 0) + 1); } return m; };
const sumBy = (arr, key, val) => { const m = new Map(); for (const x of arr) { const k = key(x); if (k == null) continue; m.set(k, (m.get(k) || 0) + val(x)); } return m; };
const topEntries = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (x, total) => (total ? Math.round((x / total) * 100) : 0);

// Coarse day-parts so "busiest part of day" is human, not a 24-bucket dump.
const PARTS = [
  { name: 'early morning', lo: 5, hi: 9 },
  { name: 'late morning', lo: 9, hi: 12 },
  { name: 'afternoon', lo: 12, hi: 17 },
  { name: 'evening', lo: 17, hi: 21 },
  { name: 'night', lo: 21, hi: 24 },
  { name: 'late night', lo: 0, hi: 5 },
];
const partOf = (hour) => (PARTS.find((p) => hour >= p.lo && hour < p.hi) || PARTS[0]).name;

// computePatterns — the structured behavioral model. Pure over episodes; `now` only used to scope
// "recent" if a floor is later wired in (kept for parity with other heuristics — currently full set).
export function computePatterns(episodes = [], { now = Date.now() } = {}) {
  const eps = (episodes || []).filter((e) => e && tOf(e) > 0).slice().sort((a, b) => tOf(a) - tOf(b));
  const n = eps.length;
  if (!n) return { episodes: 0, hours: [], apps: [], transitions: [], focus: null, dayParts: [], streaks: [], now };

  // active hours-of-day histogram (count of episodes started in each hour 0..23)
  const hourCount = new Array(24).fill(0);
  for (const e of eps) hourCount[new Date(tOf(e)).getHours()]++;
  const hours = hourCount.map((count, hour) => ({ hour, count })).filter((h) => h.count > 0);
  const peakHour = hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0] || { hour: null, count: 0 });

  // app time-distribution by summed active_duration
  const appMs = sumBy(eps, appOf, durOf);
  const totalMs = [...appMs.values()].reduce((a, b) => a + b, 0);
  const apps = topEntries(appMs, 8).map(([app, ms]) => ({ app, ms, share: pct(ms, totalMs) }));

  // top context-switch transitions A->B from consecutive episodes (only when the app actually changes)
  const trans = new Map();
  let switches = 0;
  for (let i = 1; i < n; i++) {
    const a = appOf(eps[i - 1]), b = appOf(eps[i]);
    if (a === b) continue;
    switches++;
    const k = `${a}→${b}`;
    trans.set(k, (trans.get(k) || 0) + 1);
  }
  const transitions = topEntries(trans, 6).map(([k, count]) => { const [from, to] = k.split('→'); return { from, to, count }; });

  // focus vs fragmentation: avg active episode length + how often they switch apps
  const totalActive = eps.reduce((a, e) => a + durOf(e), 0);
  const avgEpisodeMs = Math.round(totalActive / n);
  const switchRate = n > 1 ? switches / (n - 1) : 0;          // 0 = laser focus, →1 = thrashing
  const focus = { avgEpisodeMs, switchRate: Math.round(switchRate * 100) / 100, switches, episodes: n, focused: switchRate < 0.5 };

  // busiest day-parts by summed active_duration
  const partMs = sumBy(eps, (e) => partOf(new Date(tOf(e)).getHours()), durOf);
  const dayParts = topEntries(partMs, 6).map(([part, ms]) => ({ part, ms, share: pct(ms, totalActive) }));

  // deep-work streaks: runs of consecutive same-app episodes (a sustained, un-switched stretch)
  const streaks = [];
  let run = { app: appOf(eps[0]), count: 1, ms: durOf(eps[0]), start: tOf(eps[0]) };
  const pushRun = () => { if (run.count >= 3 || run.ms >= 25 * 60000) streaks.push({ ...run }); };
  for (let i = 1; i < n; i++) {
    const app = appOf(eps[i]);
    if (app === run.app) { run.count++; run.ms += durOf(eps[i]); }
    else { pushRun(); run = { app, count: 1, ms: durOf(eps[i]), start: tOf(eps[i]) }; }
  }
  pushRun();
  streaks.sort((a, b) => b.ms - a.ms);

  return {
    episodes: n, totalActiveMs: totalActive, hours, peakHour,
    apps, transitions, focus, dayParts, streaks: streaks.slice(0, 5), now,
  };
}

const clock = (hour) => { const h = hour % 12 || 12; return `${h}${hour < 12 ? 'am' : 'pm'}`; };

// patternsMarkdown — grounded, concise rendering of the structured model. '(nothing yet)' when empty.
export function patternsMarkdown(episodes = [], { now = Date.now() } = {}) {
  const p = computePatterns(episodes, { now });
  if (!p.episodes) return '# Patterns\n(nothing yet)';
  const L = ['# Patterns'];

  if (p.peakHour && p.peakHour.hour != null) {
    const top = p.dayParts[0];
    L.push(`- Most active in the ${top ? top.part : partOf(p.peakHour.hour)}, peaking around ${clock(p.peakHour.hour)} (${p.peakHour.count} episodes).`);
  }
  if (p.apps.length) {
    L.push(`- Lives in ${p.apps.slice(0, 3).map((a) => `${a.app} (${a.share}%)`).join(', ')} by active time.`);
  }
  if (p.focus) {
    const f = p.focus;
    L.push(`- ${f.focused ? 'Focused' : 'Fragmented'} work style: avg ${fmtDur(f.avgEpisodeMs)} per stretch, switches apps ${Math.round(f.switchRate * 100)}% of the time (${f.switches}/${f.episodes - 1} hops).`);
  }
  if (p.transitions.length) {
    L.push(`- Common context switches: ${p.transitions.slice(0, 3).map((t) => `${t.from} → ${t.to} (${t.count}x)`).join(', ')}.`);
  }
  if (p.streaks.length) {
    L.push(`- Deep-work streaks: ${p.streaks.slice(0, 2).map((s) => `${fmtDur(s.ms)} in ${s.app}`).join(', ')}.`);
  }
  return L.join('\n');
}

// SECTION — the dream descriptor: same understanding, model-enriched, written to patterns.md.
export const SECTION = {
  file: 'patterns.md',
  title: 'Patterns',
  ask: 'Describe HOW and WHEN this user works — their rhythm, focus vs context-switching, the tools/apps they live in, peak hours. Ground every claim in the evidence.',
};
