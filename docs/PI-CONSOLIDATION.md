# Recoder Code on pi — Consolidation Plan (Phase 2)

> **Decision (yours):** make **pi the IDE foundation**. Recoder's terminal IDE becomes
> **full pi** (agent loop + AI providers + coding-agent + pi-tui), Recoder-owned, with
> `recoder-code` reduced to a **thin Recoder shell** over it. One coding agent, one TUI —
> killing the duplicate (recoder-code's separate Ink/React fork).
>
> Phase 1 (full pi vendored @ 0.80.2, rebranded `@recoder`, all green) is **done** (`4ef18d248`).
> This doc plans Phase 2: the consolidation. It's the flagship, so it's **staged + verified**,
> never a from-scratch rewrite.

---

## 1. The two halves

**pi provides (the engine — now full @ 0.80.2):**
- `@recoder/pi-agent-core` — agent loop, harness, compaction, sessions
- `@recoder/pi-ai` — 40+ LLM providers, auth, streaming (`src/api/*`)
- `@recoder/pi-coding-agent` — the coding agent: modes (`interactive`/`print`/`rpc`), tools, **extension system** (`src/core/extensions`), settings/config (`configDir`, `PI_*` env, `.pi` dir), CLI (`src/cli/*`), `main.ts`
- `@recoder/pi-tui` — the TUI

**recoder-code keeps (the shell — the Recoder layer to preserve):**
- **Auth** to `recoder.xyz` (device-flow) — ~45 files in `core/src` + `cli/src`
- **Default MCP servers**: recodergit code-graph + brain (`withDefaultCodeGraphServer` / `withDefaultBrainServer` in `cli/src/config/config.ts`)
- **code-graph** integration (`core/src/code-graph`, `core/src/memory`, the recodergit/brain resolvers)
- **Branding / config identity**: `recoder` name, theme, config dir (`.recoder` vs `.pi`), env (`RECODER_*` vs `PI_*`)
- **recoder-cli verbs** (e.g. `code-graph connect/...`) where they belong on the CLI

**The bet:** Recoder's layer maps onto pi's **extension + config** surfaces, so recoder-code becomes a *launcher + extensions*, not a fork. pi's `.pi`/`configDir`/`PI_*` → Recoder's `.recoder`/`RECODER_*`; pi `mcpServers` config already carries the recodergit/brain defaults (Phase-5 work); pi `extensions` host the Recoder-specific tools.

---

## 2. Staged migration (each stage ships green; recoder-code keeps working throughout)

| Stage | What | Risk | Exit check |
|---|---|---|---|
| **A — Launch pi with Recoder config** | recoder-code depends on `@recoder/pi-coding-agent`; a thin `recoder` launcher runs pi's **interactive mode** with Recoder `configDir`/branding + the recodergit/brain **MCP servers injected via pi's `mcpServers` config**. Old Ink path stays as fallback behind a flag. | low | `recoder` launches pi; agent has recodergit+brain tools; old path still works |
| **B — Port the Recoder layer into pi** | Move recoder-code's Recoder bits onto pi's surfaces: MCP defaults → pi `mcpServers`; auth/device-flow → a pre-launch step or a pi extension; code-graph/memory helpers → pi extensions or kept as MCP (already are). Map `RECODER_*` env + `.recoder` configDir. | med | Recoder features available *through pi* (extensions/config), tested |
| **C — TUI on pi-tui** | Default the interactive UI to **pi-tui** (pi's own TUI). recoder-code's Ink/React UI becomes legacy (flag), then removed once parity (prompt UX, status, slash commands). | **high** (UX parity) | pi-tui is the default UI; key flows match; Ink removed |
| **D — Delete the duplicate** | Remove recoder-code's own agent loop + tools + Ink TUI now superseded by pi. recoder-code = launcher + Recoder extensions + CLI verbs only. Update `recoder-code/packages/{cli,core}` to the slim shape. | med | recoder-code is thin; one agent, one TUI; full suite green |

> Reversibility: A–B are additive (old path behind a flag). C–D are the destructive
> steps — only after A/B prove pi+Recoder-extensions reach feature parity.

---

## 3. Known risks (carry into each stage)

- **pi-ai API surface change (0.80.2):** `api-registry.ts` + `stream.ts` were **removed** (compat covered by `compat.ts` / `legacy-api-aliases.ts`). recoder-code or its providers may import them — **audit + repoint to pi's compat shims** in Stage A.
- **Ink → pi-tui** is a UX migration, not a swap: recoder-code's spinners/gradients/links/slash-command UI must map to pi-tui or be added. This is the highest-risk stage (C).
- **Feature parity:** recoder-code's bespoke tools/prompts/subagents must port to pi **extensions** or be dropped deliberately (list them; decide each).
- **Desktop terminal:** the Electron app spawns a terminal → it just runs `recoder` (the new pi-based launcher). **pi-tui then serves both** the desktop terminal and standalone CLI (the "pi-tui for both" goal — achieved by Stage C).
- **Flagship blast radius:** recoder-code ships (npm + Homebrew). Every stage lands green with its tests; nothing breaks the published CLI until D, which is gated on parity.

---

## 4. First concrete step (Stage A)

1. Add `@recoder/pi-coding-agent` (+ pi-tui/agent-core/ai) as deps of recoder-code.
2. Audit recoder-code for removed pi-ai symbols (`api-registry`/`stream`) → repoint to compat.
3. Thin launcher: a `recoder` entry that invokes pi's interactive mode with `configDir` = Recoder's, branding, and `mcpServers` seeded by the existing `withDefaultCodeGraphServer`/`withDefaultBrainServer`.
4. Behind a flag (`RECODER_PI_SHELL`) so the current Ink path stays default until parity.
5. Verify: `recoder` (flag on) launches pi, agent lists recodergit + brain tools, builds green; old path unaffected.

Stage A is additive and reversible — the safe place to start. B→D follow once A proves the shell.

---

## 5. Stage B — the Recoder layer ported onto pi (shipped, flag-gated)

Stage B turns the Stage A launcher into a real **Recoder-branded, authenticated** agent.
Still opt-in behind `RECODER_PI_SHELL`; the default Ink path is untouched and
byte-identical (the `recoder-pi-shell/*` modules are only imported when the flag is set,
guarded in `gemini.tsx`).

### 5.1 Branding (the pi TUI shows "Recoder")

pi reads its identity from its **own** `package.json` `piConfig` at module load
(`pi-coding-agent/src/config.ts`). The vendored package now sets:

```jsonc
"piConfig": { "name": "Recoder", "configDir": ".recoder" }
```

Consequences pi derives from `piConfig.name`:

| pi symbol | value | effect |
|---|---|---|
| `APP_NAME` | `Recoder` | welcome banner ("Welcome to Recoder…"), CLI help, `User-Agent` |
| `APP_TITLE` | `Recoder` | TUI title |
| `CONFIG_DIR_NAME` | `.recoder` | default config root `~/.recoder/agent` |
| `ENV_AGENT_DIR` | `RECODER_CODING_AGENT_DIR` | `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR` |
| `ENV_SESSION_DIR` | `RECODER_CODING_AGENT_SESSION_DIR` | session dir override |

Because `appName !== "pi"`, pi's `isOfficialDistribution()` is false, so the upstream
first-time-setup wizard stays disabled for the rebrand.

**Remaining hardcoded pi identity refs (not piConfig-driven), noted for later:** the
banner tagline "the minimal coding agent" and the share-viewer URL `https://pi.dev/session/`
(`PI_SHARE_VIEWER_URL`-overridable). These are cosmetic and out of Stage B scope.

### 5.2 Config identity + RECODER_* → pi env mapping

| Recoder input | Resolves to | pi env applied (`envOverrides`) | pi reads |
|---|---|---|---|
| `RECODER_CONFIG_DIR` / `RECODER_PI_CONFIG_DIR` (override) | Recoder config root | `RECODER_CODING_AGENT_DIR=<root>/agent` | `getAgentDir()` |
| (unset) | `~/.recoder` (via `$HOME`/`piConfig.configDir`) | `RECODER_CODING_AGENT_DIR=~/.recoder/agent` | `getAgentDir()` |

The launcher derives `RECODER_PI_AGENT_DIR_ENV` from `RECODER_PI_APP_NAME` exactly as pi
derives `ENV_AGENT_DIR` from `piConfig.name`, so the two stay in lockstep (`launch-plan.ts`).
Even if the env override is dropped, pi's default `CONFIG_DIR_NAME = .recoder` already lands
config under `~/.recoder/agent`, matching `RecoderAuthService`'s `~/.recoder/auth.json`.

### 5.3 Pre-launch auth gate

`runRecoderPiShell` runs a **pre-launch auth gate** before any env mutation or pi launch.
The default check reuses recoder-code's existing `RecoderAuthService.isAuthenticated()`
(device-flow / token loader, persisted at `~/.recoder/auth.json`) — **not reimplemented**,
lazily imported so it only loads on the flag-on path. If unauthenticated, it prints the
existing `recoder auth login` hint and exits non-zero **without launching pi**. The check,
the unauthenticated handler, and `exit` are all injectable (`RunPiShellDeps`) for testing.

### 5.4 MCP bridge robustness

The recodergit + brain bridge already fails safe per server (a server that can't start is
skipped, never crashing the TUI). Stage B adds a `RecoderToolGroupSummary` (`loaded` /
`degraded`) reported via `onGroupsResolved`, which the launcher surfaces on stderr — so the
operator sees exactly which Recoder tool groups came up and which degraded.

### 5.5 Tests

`recoder-pi-shell/recoder-stage-b.test.ts` (force-added past the `*.test.ts` gitignore)
covers: branding (`piConfig` set in the vendored package.json), the auth gate both ways
(authed → pi launches; unauthed → prompt + exit, pi never launched, env untouched), and the
MCP bridge degrading + surfacing loaded/degraded groups. Existing Stage A tests stay green;
the flag-off default path is unchanged.
