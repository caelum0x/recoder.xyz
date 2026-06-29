# Continuum — `@recoder/continuum`

> Recoder-owned vendor of [continuum](https://github.com/nikhilkagita04/continuum) (Apache-2.0).
> The **Brain's activity source**: whole-desktop context — everything you've seen, read, typed,
> and heard — fused **in-process** (not wrapped, not shelled out) so the Brain recalls who you
> are and how you work. Local-first, on-device, read-only to agents.

Every agent starts blank, so *you* become the courier — re-pasting and re-explaining across a
dozen apps a day. Continuum remembers what happens across your apps, on-device and private, and
the Recoder Brain fuses it into one `BrainContext` every agent reads once and reuses. Ask
*"what was I just doing in X?"* and it already knows.

## Why this is a Recoder package (fusion, not a wrapper)

Continuum is merged into Recoder as a **real owned workspace package** (`@recoder/continuum`),
not a thin CLI adapter. Its engines (`recall`, `catch_up`, `profile`, `snapshot`, `answerQuery`,
`loadEpisodes`, `loadIndex`) are called **in-process** by the Brain — no subprocess, no
JSON-over-stdout. This mirrors how the Brain consumes `@recoder/recodergit` (`createContextPack`).

```ts
// packages/brain/src/activity/continuum-activity-adapter.ts
import { loadEpisodes, loadIndex, recall, profile } from "@recoder/continuum/engines";

const episodes = loadEpisodes();          // [] if store absent — fail-safe
const index = await loadIndex(null);      // lexical-only when no embed model configured
const rows = await recall(index, episodes, { query, k: limit });   // REAL engine, in-process
```

## What it does

- **Captures your desktop** — clipboard, editor, git, terminal, browser (on-device OCR of the
  focused window, deduped to content), plus optional meeting transcription (mic + system audio,
  speaker-tagged, transcribe-then-delete).
- **Captures your agent** — the **recoder** Stage-1 adapter (A1) tails `~/.recoder/agent/sessions`
  and turns the agent's own actions (turns, bash executions, tool results, model switches) into
  activity. The agent becomes **self-aware** of its own work.
- **Understands who you are** — an out-of-band *dreaming* pass consolidates the raw firehose into
  small, cited memory files (`continuum dream` · `continuum memory`).
- **Learns how you work** — standing preferences apply to every agent automatically
  (`continuum preferences`).
- **Local-first & read-only to agents** — everything lives in `~/.continuum`; PII redacted,
  credential managers excluded; the agent only *reads* memory, so a prompt-injected agent can't
  poison it. Nothing leaves your machine.

## Run it standalone (the daemon + MCP)

Needs **Node 18+**. Capture is **off by default** (privacy-first opt-in).

```bash
continuum verify       # prove it works in 30s — no keys, no setup
continuum start        # live capture (grant Screen Recording once; enable adapters in config)
continuum dashboard    # your timeline + search at localhost:3939
continuum mcp-install  # connect it to Claude Desktop, then restart Claude
```

Then ask *"what was I doing in X?"*. The MCP tools are `recall`, `catch_up`, `profile`.

## How it works

**Two tiers over one episode store.** Stage-1 adapters capture and group activity into
**episodes**. The **live tier** (Stage 2-3: segment → hybrid index) lets any agent answer
*"what was I doing?"* — local and free. An out-of-band **dreaming** pass (Stage 4-5) reads the
same episodes and consolidates them into the durable memory an agent reads to *understand* you
(`profile`). The LLM never touches the capture path. Deep dive:
[`docs/architecture/ingestion-pipeline.md`](docs/architecture/ingestion-pipeline.md).

## Develop

From the Recoder monorepo:

```bash
pnpm test                                    # full continuum suite, no network
swiftc daemon/stage1/screen.swift -o daemon/stage1/screen   # build the capture helper
```

`continuum eval` reports capture-quality metrics over local fixtures.

---

Originally [continuum](https://github.com/nikhilkagita04/continuum) by Nikhil Kagita
(Apache-2.0). Recoder owns and extends this fork — see `NOTICE` and `LICENSE`. Upstream
contributions follow the [DCO](https://developercertificate.org/) (`git commit -s`).
