// Shared TEAM memory over the same CAS primitives daemon/memory.mjs already exposes:
// content-hash preconditions (optimistic concurrency), immutable versions, and attribution.
//
// Model: each MEMBER owns a versioned memory record — a map of section -> text. The team VIEW
// merges members per-section, attributed by member (who said what). Concurrent updates are
// optimistic-concurrency guarded: a write carries `expectSha` and is REJECTED (returns
// {conflict:true}) on a stale precondition — it NEVER clobbers. Because every change is
// attributed and either applied cleanly or surfaced as a reviewable conflict, a prompt-injected
// agent still can't silently poison the shared view: poison shows up as an attributed,
// conflicting edit, not an overwrite.
//
// ALL storage is INJECTABLE — readMember/writeMember/listMembers/now — so tests use in-memory
// fakes and never touch the real fs/clock. The default storage MIRRORS memory.mjs: per-member
// versioned files under DATA_DIR/team with an append-only versions log (audit trail). The CAS
// precondition check lives in THIS layer (not the store) so injected stores stay dumb.
//
// Native binaries required: NONE (Node built-ins only).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.mjs';
import { contentHash } from '../stage2/segmenter.mjs';

export const TEAM_DIR = path.join(DATA_DIR, 'team');
const sha = (s) => contentHash(s || '');
// Canonical bytes for a section map so CAS hashing is deterministic regardless of key order.
const serialize = (sections) => JSON.stringify(sections || {}, Object.keys(sections || {}).sort());

// ---- default storage: per-member versioned files (mirrors memory.mjs CAS + versions) ----
function defaultStorage(dir = TEAM_DIR) {
  const vlog = path.join(dir, '.versions.jsonl');
  const fileOf = (id) => path.join(dir, `${encodeURIComponent(id)}.json`);
  return {
    readMember(id) {
      try {
        const obj = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
        const sections = obj.sections || {};
        return { sha: sha(serialize(sections)), sections, t: obj.t || 0 };
      } catch { return { sha: sha(serialize({})), sections: {}, t: 0 }; }
    },
    writeMember(id, sections, { reason = '', source = 'agent', t = Date.now() } = {}) {
      fs.mkdirSync(dir, { recursive: true });
      const s = sha(serialize(sections));
      fs.writeFileSync(fileOf(id), JSON.stringify({ member: id, sections, t }, null, 2) + '\n');
      fs.appendFileSync(vlog, JSON.stringify({ member: id, sha: s, source, reason, t }) + '\n');
      return { ok: true, sha: s };
    },
    listMembers() {
      try {
        return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
          .map((f) => decodeURIComponent(f.replace(/\.json$/, ''))).sort();
      } catch { return []; }
    },
  };
}

export function createTeamMemory(opts = {}) {
  const hasStore = opts.readMember && opts.writeMember && opts.listMembers;
  const base = hasStore ? opts : { ...defaultStorage(), ...opts };
  const { readMember, writeMember, listMembers } = base;
  const now = opts.now || (() => Date.now());
  const audit = []; // in-process who-wrote-what (default store also persists to .versions.jsonl)

  // Current member state + sha. Callers use `.sha` as the next write's `expectSha`.
  function read(memberId) {
    const m = readMember(memberId) || {};
    const sections = m.sections || {};
    return { sha: m.sha != null ? m.sha : sha(serialize(sections)), sections };
  }

  // CAS-guarded section write. If `expectSha` is given and doesn't match the member's current sha,
  // the write is REJECTED ({ok:false, conflict:true}) without clobbering. Immutable: builds a new
  // section map, never mutates the existing one.
  function write(memberId, section, text, { expectSha = null, reason = '', source = 'agent' } = {}) {
    const cur = read(memberId);
    if (expectSha != null && cur.sha !== expectSha) return { ok: false, conflict: true, sha: cur.sha };
    const sections = { ...cur.sections, [section]: text };
    const res = writeMember(memberId, sections, { reason, source, t: now() }) || {};
    const newSha = res.sha != null ? res.sha : sha(serialize(sections));
    audit.push({ member: memberId, section, sha: newSha, prevSha: cur.sha, t: now(), source, reason });
    return { ok: true, sha: newSha, section };
  }

  // Merge every member's sections into a per-section team view, attributed by member.
  // { members:[...], sections: { [name]: [ {member, text, sha} ] (sorted by member) } }
  function teamView() {
    const members = listMembers();
    const sections = {};
    for (const id of members) {
      for (const [name, text] of Object.entries(read(id).sections)) {
        (sections[name] ||= []).push({ member: id, text, sha: sha(text || '') });
      }
    }
    for (const k of Object.keys(sections)) sections[k].sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0));
    return { members, sections };
  }

  // Surface sections where >1 member contributes differing text — the reviewable conflicts.
  function conflicts() {
    const { sections } = teamView();
    const out = [];
    for (const [section, contribs] of Object.entries(sections)) {
      const distinct = new Set(contribs.map((c) => c.sha));
      if (contribs.length > 1 && distinct.size > 1) {
        out.push({ section, members: contribs.map((c) => c.member), shas: contribs.map((c) => c.sha) });
      }
    }
    return out;
  }

  const auditLog = () => audit.slice();
  const writers = () => [...new Set(audit.map((a) => a.member))].sort();

  return { read, write, teamView, conflicts, audit: auditLog, writers, TEAM_DIR };
}
