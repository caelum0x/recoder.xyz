# Continuum — Own & Grow (Recoder Activity Subsystem)

> **Doctrine:** fuse OSS into owned subsystems. No thin adapters, no HTTP shims, no
> mocks, no stubs. Continuum is the Brain's **activity** source (desktop + agent
> context). Like `@recoder/recodergit`, it becomes a **real owned workspace package**
> whose engines are called **in-process** — never shelled out.

---

## 1. Current state (honest)

> **Update (post-fusion):** the baseline below described the *pre-fusion* state. F1–F3
> are now **done** (`756cb7232`): continuum was promoted from `ts/continuum` to
> **`packages/continuum`** (`@recoder/continuum`), the `ts/continuum` dir is gone, and
> Brain calls the engine **in-process** — the `execFile` shell-out is deleted. See §6
> for the current per-item status. The text in this section is retained as the
> motivating baseline.

Continuum (originally `ts/continuum`, upstream `continuum-core` v0.7.1, Nikhil Kagita) is a mature,
local-first desktop-context memory. It is **not** a stub:

- **Stage 1 — capture:** clipboard, editor, git, terminal, chrome, screen-vision (OCR), audio
- **Stage 2 — segment:** PII redaction, novelty, typing, cap, fusion
- **Stage 3 — index:** hybrid (lexical + embedding) search index
- **Stage 4 — distill:** patterns, expertise, goals, labels, temporal knowledge graph
- **Stage 5 — dream:** consolidate episodes → durable memory
- **MCP / retrieval:** `recall`, `catch_up`, `profile`, `snapshot`, `answerQuery` — pure
  functions over `(index, episodes)`, transport-free
- **extras:** preferences, team (shared memory), sync, clean, dashboard (localhost:3939)

**Two problems (the work):**

1. **Not owned / not fused.** It lives in `ts/` (outside the pnpm workspace), keeps upstream
   branding, and Brain talks to it via a **subprocess shell-out** (`ContinuumActivity` runs
   `continuum recall --json` through `execFile`). That is the thin-adapter pattern we reject.
   Compare `@recoder/recodergit`, which Brain imports in-process: `createContextPack(...)`.
2. **Under-surfaced.** Brain only uses `recall` + `profile`. The richer engines
   (`catch_up`, `snapshot`, `answerQuery`) exist but are unreachable.

---

## 2. Target architecture

```
packages/continuum/                    @recoder/continuum  (owned workspace pkg)
├── package.json                       name @recoder/continuum; exports map; bin: recoder-continuum
├── README.md                          Recoder-owned; rebranded; real engine
├── daemon/                            REAL engine (the .mjs pipeline — source of truth)
│   ├── store.mjs                      loadEpisodes / loadIndex  (fail-safe: [] if absent)
│   ├── mcp.mjs                        recall / catchUp / profile / snapshot  (pure)
│   ├── retrieval.mjs                  answerQuery (grounded)
│   ├── stage1..4/                     capture → segment → index → distill
│   ├── *.mjs + *.test.mjs             the full real engine + its tests
│   └── config.mjs                     DATA_DIR = CONTINUUM_DATA || ~/.continuum
├── src/                               TypeScript surface for in-process consumers
│   ├── index.ts                       typed re-export of the consumed engines
│   ├── engines.ts                     loadEpisodes/loadIndex/recall/profile/catchUp/snapshot
│   └── types.ts                       Episode / ActivityRow / Profile types
└── dist/                              built CJS+ESM+types (consumed via exports)

packages/brain/src/activity/
└── continuum-activity-adapter.ts      IMPORTS @recoder/continuum; calls engines IN-PROCESS
                                       (mirrors repo/repo-intel-adapter.ts → createContextPack)
```

**The fusion seam (real, in-process):**

```ts
import { loadEpisodes, loadIndex, recall, profile } from "@recoder/continuum";

async recallActivity(query: string, limit: number) {
  const episodes = loadEpisodes();            // [] if no store — fail-safe
  const index = await loadIndex(embed);       // lexical-only if no model configured
  return recall(index, episodes, { query, k: limit });   // REAL engine call
}
```

No `execFile`. No subprocess. No JSON-over-stdout. The engine runs in Brain's process.

---

## 3. New functionality roadmap (the "more directories / functionality")

| # | Capability | Real engine | Status | Track |
|---|---|---|---|---|
| **F** | **In-process fusion** — kill the shell-out; `@recoder/continuum` workspace pkg | promotion + brain adapter | 🔄 next | F1–F3 |
| **R1** | **Richer activity surface** — expose `catch_up` + `snapshot` to Brain (engines exist, unsurfaced) | `mcp.mjs` already | 📋 | R1 |
| **R2** | **Grounded recall** — `answerQuery` (KG facts + recall + optional LLM) as a Brain recall mode | `retrieval.mjs` already | 📋 | R2 |
| **A1** | **Recoder agent-session adapter (Stage 1)** — capture recoder-code/pi agent actions (commands run, files edited, tool calls) as activity, so the agent is **self-aware** of its own work | new `daemon/stage1/adapters/recoder.mjs` | 📋 | A1 |
| **E1** | **On-box embedding tier** — Qdrant-backed embeddings for privacy/local-first (replace cloud-only embed) | new `daemon/stage3/qdrant-embed.mjs` | 📋 | E1 |
| **T1** | **Team/shared activity** — wire continuum `team/` as the multi-agent shared activity surface over A2A | `daemon/team/` exists | 📋 | T1 |

Sequencing: **F → R1 → R2** are the foundation (own + fuse + surface). **A1** is the highest-value
new capability (self-aware agent activity). **E1/T1** are deeper extensions.

---

## 4. Fusion steps (F) — concrete

- **F1 — Promote.** `ts/continuum` → `packages/continuum`; rename pkg → `@recoder/continuum`;
  keep the real `.mjs` engine as source of truth; add `src/` typed surface + `exports` map
  exposing `store`/`mcp`/`retrieval` engines + `.d.ts`; keep `bin` (`recoder-continuum`).
  No duplication left behind (unlike the recodergit ts/+packages/ split).
- **F2 — Fuse.** `packages/brain` gains `"@recoder/continuum": "workspace:*"`.
  `continuum-activity-adapter.ts` rewritten to import + call engines in-process
  (mirrors `repo/repo-intel-adapter.ts`). The `execFile` shell-out is **deleted**, not left
  as dead code.
- **F3 — Verify.** brain `tsc --noEmit` 0 errors; activity-adapter tests run the **real**
  engine against a temp `CONTINUUM_DATA` store (no mock exec); fail-safe when store absent
  (`recall → []`, `profile → null`); grep proves no `execFile`/subprocess remains.

---

## 5. Non-goals (deliberate)

- **No porting the `.mjs` engine to TypeScript wholesale.** It is mature, tested (large suite),
  and the doctrine is *fuse*, not *rewrite*. A typed surface (`src/`) wraps the real engine.
- **No cloud dependency added.** Continuum is local-first; embedding tiers stay optional +
  degrade-safe.
- **No capture in Brain.** Brain only **reads** activity (recall/profile/catch_up). The daemon
  owns capture; Brain never writes the episode store.

---

## 6. Tracking

| Item | Area | Status | Note |
|---|---|---|---|
| Plan (this doc) | continuum | ✅ | written |
| F1 promote → @recoder/continuum | continuum | ✅ | `756cb7232` — ts/→packages/; real .mjs engine; engines.mjs + engines.d.ts; exports ./engines(·)/store/mcp |
| F2 in-process fusion (kill shell-out) | brain+continuum | ✅ | `756cb7232` — adapter dynamic-imports engines; execFile/subprocess gone (grep-proven); mirrors recodergit |
| F3 real-engine tests + verify | brain+continuum | ✅ | `756cb7232` — 90/90 brain tests (real temp store, no mocks); tsc 0; tsup build; dist runtime smoke |
| R1 surface catch_up + snapshot | brain | ✅ | `756cb7232` — ActivityPort recent()+snapshot(); adapter implements both on the real engine |
| R2 grounded recall (answerQuery) | brain | ✅ | `f4c96aec0` — ActivityPort.answer() composes recall (sources) + answerQuery (answer); null answer w/o LLM |
| Surface activity to agents (brain_activity MCP) | brain | ✅ | `479610a4f` — read-only brain_activity tool: no-query→recent+snapshot, query→grounded answer; makes R1/R2 + A1 usable; 94/94 tests |
| A1 recoder agent-session adapter | continuum | ✅ | `913ab01be` — watchRecoder tails ~/.recoder/agent/sessions/*.jsonl; emits agent turns/bash/tool-results/model-switches as activity; wired first-class; opt-in/off; recoder.test 22/22, index.test 15/15, pipeline 7/7 |
| E1 on-box Qdrant embed tier | continuum | 📋 | privacy-first |
| T1 team/shared activity over A2A | continuum | 📋 | multi-agent |
