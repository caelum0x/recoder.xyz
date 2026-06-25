// Graph tier client — the temporal knowledge-graph (Pro). Talks to the graphiti sidecar
// (backend/graphiti/sidecar.py) but does a zero-dep LOCAL entity/relation pre-extraction first,
// so the graph gets structured input (entities + SVO-ish relations) instead of raw text. Pure +
// deterministic: every network call goes through an injectable fetchImpl (default global fetch),
// time comes from the episode / caller, and a thrown fetch degrades to empty — it never throws.
//
// Contract kept backward-compatible with daemon/adapters.mjs graphClient + retrieval.mjs:
//   search(query, group, k) -> { results: [{ fact, ... }] }
// New surface:
//   add(episode)                               — episode -> structured graph episode
//   temporalQuery({ entity?, since?, until?, k }) — time-scoped relationship query
//   entitiesFor(text)                          — pure local entity/relation pre-extractor

// ---- pure, zero-dep pre-extractor ----------------------------------------------------------

// Sentence-leading / filler capitalized words that are NOT entities.
const STOP_CAP = new Set(['The', 'A', 'An', 'I', 'It', 'He', 'She', 'They', 'We', 'You', 'This',
  'That', 'These', 'Those', 'My', 'His', 'Her', 'Their', 'Our', 'Your', 'And', 'But', 'So', 'Then',
  'When', 'While', 'After', 'Before', 'If', 'As', 'At', 'In', 'On', 'For', 'To', 'Of', 'With', 'Today',
  'Now', 'Just', 'Also', 'Here', 'There', 'Why', 'How', 'What', 'Who']);
// Edge words stripped off a predicate (articles / prepositions / conjunctions).
const STOP_EDGE = new Set(['a', 'an', 'the', 'to', 'of', 'with', 'for', 'on', 'in', 'at', 'by',
  'into', 'from', 'and', 'or', 'as', 'that', 'this', 'it', 'its', 'their', 'our', 'my', 'his', 'her']);

const ENTITY_RE = /\b([A-Z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*(?:\s+[A-Z][A-Za-z0-9]+)*)\b|\b([a-z][a-z0-9]*(?:[-.][a-z0-9]+)+)\b/g;

// One sentence -> ordered, de-duped entity matches with positions.
function entitiesIn(sentence) {
  const out = []; const seen = new Set();
  let m; ENTITY_RE.lastIndex = 0;
  while ((m = ENTITY_RE.exec(sentence))) {
    const name = (m[1] || m[2] || '').trim();
    if (!name) continue;
    if (m[1] && name.split(/\s+/).every((w) => STOP_CAP.has(w))) continue;  // pure filler-caps
    out.push({ name, at: m.index, end: m.index + m[0].length });
  }
  // dedup by name keeping first position (for the entity list), but keep order for relations
  for (const e of out) { if (!seen.has(e.name)) seen.add(e.name); }
  return out;
}

// Clean a gap between two entities into a short predicate (drop edge stopwords, cap 3 words).
function predicateOf(gap) {
  let w = (gap || '').toLowerCase().match(/[a-z][a-z0-9']*/g) || [];
  while (w.length && STOP_EDGE.has(w[0])) w = w.slice(1);
  while (w.length && STOP_EDGE.has(w[w.length - 1])) w = w.slice(0, -1);
  return w.slice(0, 3).join(' ');
}

// entitiesFor — pure local pre-extraction. Returns { entities:[{name}], relations:[{subject,predicate,object}] }.
// Deterministic; no model, no network. Simple SVO-ish: adjacent entities in a sentence joined by their gap verb.
export function entitiesFor(text) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) return { entities: [], relations: [] };
  const names = new Set(); const relations = []; const relSeen = new Set();
  for (const sentence of src.split(/(?<=[.!?])\s+|\n+/)) {
    const ents = entitiesIn(sentence);
    for (const e of ents) names.add(e.name);
    for (let i = 0; i + 1 < ents.length; i++) {
      const a = ents[i], b = ents[i + 1];
      if (a.name === b.name) continue;
      const predicate = predicateOf(sentence.slice(a.end, b.at));
      if (!predicate) continue;                                  // pure preposition gap → no relation
      const key = a.name + '|' + predicate + '|' + b.name;
      if (relSeen.has(key)) continue; relSeen.add(key);
      relations.push({ subject: a.name, predicate, object: b.name });
    }
  }
  return { entities: [...names].map((name) => ({ name })), relations };
}

// ---- time helpers (no system clock — caller/episode supplies time) -------------------------

const toISO = (v) => {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  const s = String(v);
  const d = new Date(/^\d+$/.test(s) ? Number(s) : s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

const epText = (e) => (e && ((e.structured && (e.structured.summary || e.structured.authored)) || e.text)) || '';

// ---- client --------------------------------------------------------------------------------

// createGraph — richer graph client. All I/O via fetchImpl so tests use a fake (no real network).
export function createGraph({ url = 'http://localhost:8000', group = 'default', fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const post = async (p, body) => {
    if (!doFetch) return null;
    try {
      const r = await doFetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return await r.json();
    } catch { return null; }                                     // network/JSON failure → null, never throw
  };

  return {
    url, group,

    // add — map an episode to a structured graph episode (text + local entities/relations + temporal).
    async add(episode = {}, g = group) {
      const text = epText(episode);
      if (!text) return { ok: false, skipped: 'empty' };
      const { entities, relations } = entitiesFor(text);
      const body = {
        text,
        name: episode.title || episode.app || 'episode',
        group_id: g,
        date: toISO(episode.end != null ? episode.end : episode.start),
        app: episode.app || null,
        title: episode.title || null,
        source_mix: episode.source_mix || [],
        salience: typeof episode.salience === 'number' ? episode.salience : null,
        entities,
        relations,
      };
      const j = await post('/add', body);
      return j || { ok: false };
    },

    // search — backward-compatible with retrieval.mjs: returns { results: [...] }.
    async search(query, g = group, k = 6) {
      const j = await post('/search', { query: String(query || ''), group_id: g, k });
      return { results: (j && Array.isArray(j.results)) ? j.results : [] };
    },

    // temporalQuery — time-scoped relationship query. Builds ISO since/until + an optional entity
    // focus, then asks the sidecar to constrain edges to that window. Same { results } shape.
    async temporalQuery({ entity, since, until, k = 6, group: g = group } = {}) {
      const sinceISO = toISO(since), untilISO = toISO(until);
      const body = {
        query: entity ? String(entity) : '*',
        entity: entity || null,
        group_id: g,
        k,
        ...(sinceISO ? { since: sinceISO } : {}),
        ...(untilISO ? { until: untilISO } : {}),
      };
      const j = await post('/search', body);
      return { results: (j && Array.isArray(j.results)) ? j.results : [], since: sinceISO, until: untilISO };
    },
  };
}
