# Desktop Packaging Truth

> **Status: Bucket A SHIPPED.** The arch-aware fail-loud gate this doc designed is now in code —
> `app/build/assert-extra-resources.cjs` exports `readBinaryArch` + the three-outcome
> `assertExtraResourcesExist(…, {targetArch, optional, archSensitive})`, and
> `app/electron-builder.config.cjs` declares `OPTIONAL_EXTRA_RESOURCES` + `ARCH_SENSITIVE_EXTRA_RESOURCES`
> and wires them through an arch-aware `beforePack(context)`. Lance is classified optional (loud
> degrade, not abort) and the mac target is arm64-only until x64 native exists. The sections below are
> kept as the design record; **Bucket B** (cargo release builds, cross-arch, signing, the actual
> `electron-builder` run) remains the **Owner Runbook** in §8.

**Scope:** `apps/desktop`. Goal: a packaged `.dmg` ships the native engines **alive**, and any missing/wrong artifact **fails the build loud at package time** (or is an *explicitly logged* degrade), never a silently-dead engine.

**Mandate:** truthful health. The desktop embeds the ONE Node backend (`process.execPath` + `ELECTRON_RUN_AS_NODE=1` running `backend/dist/server.js`) and spawns the OSS engines. Absence is reported, never faked; an intentional degrade (Lance/Qdrant, un-packaged Python sidecars) is *visible*, not hidden. The frontend is the Wave-native `recoder-*` views built into the shell (the separate Preact "cockpit" SPA was deleted, recoder-flgn — there is no `cockpit/dist` artifact).

Autonomous Bucket A commits are fully verifiable on this machine with `node --test` / `tsc` — none of them build a `.node`, invoke `cargo`, or run `electron-builder`.

---

## 0. Current state (verified against the tree)

- **Gate is arch-aware + degrade-aware (SHIPPED).** `app/build/assert-extra-resources.cjs` exports the three-outcome `assertExtraResourcesExist(extraResources, appRoot, {targetArch, optional, archSensitive})` + `readBinaryArch` (Mach-O header parse); `app/electron-builder.config.cjs` declares `OPTIONAL_EXTRA_RESOURCES` + `ARCH_SENSITIVE_EXTRA_RESOURCES` and passes `context.arch` through `beforePack`. It distinguishes *required* (throw) from *deliberately-degraded* (loud non-fatal) and validates Mach-O CPU arch against the dmg target. *(The pre-ship state was existence-only; the design below is what shipped.)*
- **`lance_npm_bindings.node` no longer blocks the build.** It is classified in `OPTIONAL_EXTRA_RESOURCES` → its absence prints a loud degrade line, not an abort. (Verified: **`crates/` does not exist at the repo root** — only inside stale `.claude/worktrees/...` copies — and no runtime resolver injects a `LANCE_*` path yet; Lance stays a truthful no-op → Qdrant. Vendoring the crate is §8-A.)
- **beads / recodergit / dmux / tmux are already correct** in `extraResources` (lines 62-105) and present on disk. No path correction needed there.
- **Arch-sensitive `.node` + `bd` are real on disk (verified):** `backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node`, `backend/engines/rust/openfang/target/release/openfang_napi.node`, `backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node`, and `apps/desktop/server/engines/beads/bin/bd` all **PRESENT** (host arm64). `crates/lance/npm-bindings/target/release/lance_npm_bindings.node` is **ABSENT** (the deliberate degrade).
- **Python sidecars** (`backend/engines/py/{mem0,colbert,browser-use,ops-recorder}`) are **not** in `extraResources` at all → shipped dead with zero build-time signal. Bundling them (per-arch venvs / interpreter) is a heavy owner project, not a config tweak → treat as **explicit degrade**, surfaced in health.
- **Env injection gaps** (`assembleBackendEnv`, `emain-backend-core.ts:356`): `RECODER_NATIVE_DIR` / `LANCE_NATIVE_DIR` / `LANCE_DATA_DIR` never set (embedded Lance store no-ops even if built); `COLBERT_RERANK_URL` / `MEM0_BASE_URL` never set (correctly null → truthful no-op, but no path to a *cloud* endpoint either).
- **Cross-arch hazard:** `mac.target` builds **both `arm64` and `x64`** (lines 137-147) but every native `.node` and `bd` on disk is host `arm64`. The x64 dmg would copy arm64 binaries → runtime load failure, and the existence-only gate passes it.
- **Two truthful health surfaces already exist (verified), and they are DIFFERENT axes:**
  - `backend/src/domains/conductor/health.ts` `buildConductorHealth` → emits **only** `substrate:<id>` lines (execution substrates, e.g. `substrate:tmux_worktree` — *how work launches*) plus `workspace-db`. It does **not** list beads/openfang/tensorzero/colbert/mem0/etc.
  - `backend/src/domains/engines/health.ts` `buildEnginesHealth` → emits the **per-engine** roster, one `EngineStatus` per declared engine named `${engineId}:${transport}` (`openfang:napi`, `governance:napi`, `tensorzero:napi`, `beads:cli`, `dmux:cli`, `tmux:cli`, `recodergit:cli`, `colbert:daemon`, `ops-recorder:daemon`, `multica:daemon`, `ziti:daemon`, `mem0:sidecar`, `browser-use:sidecar`, `pal-mcp:sidecar`). Served on the `INTERNAL_SERVICE_KEY`-gated worker surface `GET /internal/engines/health` (`bootstrap/index.ts:1290`; router `deps.mw.requireInternal` in `engines/routes/mcp-edge.routes.ts:359`). **This is the roster §4 needs — NOT conductor health.** Note: **Lance is not a declared engine here** — it is the embedded vector store, so its liveness is *not* on this endpoint; it is surfaced from the packaging classification (§2a) + `LANCE_DATA_DIR` presence (§3a).

---

## 1. Fail-loud gate mechanism

**File:** `apps/desktop/app/build/assert-extra-resources.cjs` (extend, keep the existing export signature back-compatible).

### Behavior

Three outcomes per `extraResources` entry, resolved against `appRoot`:

1. **Missing + required** → collected into `missing[]` → **THROW** (abort pack). Lists each `from` exactly.
2. **Missing + optional** (deliberate degrade, e.g. Lance) → collected into `degraded[]` → **printed loudly, non-fatal**. The line names the engine and its runtime fallback, so the operator sees "shipping without X" at package time — truthful, not silent.
3. **Present + arch-sensitive** (`.node` addons, `bd`) → read the binary header; if the CPU type ≠ target arch → `archMismatch[]` → **THROW**. This catches the arm64-in-x64-dmg hazard the existence check misses.

The gate **throws** if `missing.length || archMismatch.length`; it **always prints** `degraded[]` (even on success) so a degraded ship is loud.

### New signature

```js
// assert-extra-resources.cjs
function assertExtraResourcesExist(extraResources, appRoot, opts = {}) {
  const { targetArch = null, optional = new Set(), archSensitive = new Set() } = opts;
  const missing = [], degraded = [], archMismatch = [], verified = [];

  for (const entry of extraResources) {
    const from = typeof entry === "string" ? entry : entry?.from;
    if (!from) { missing.push(`(entry with no 'from': ${JSON.stringify(entry)})`); continue; }
    const resolved = path.resolve(appRoot, from);
    if (!fs.existsSync(resolved)) {
      (optional.has(from) ? degraded : missing).push(from);
      continue;
    }
    if (targetArch && archSensitive.has(from)) {
      const got = readBinaryArch(resolved); // Mach-O/ELF/PE, null if unknown
      if (got && got !== targetArch) archMismatch.push(`${from} (is ${got}, need ${targetArch})`);
    }
    verified.push(resolved);
  }

  if (degraded.length) {
    console.warn(
      `\n[packaging-truth] SHIPPING DEGRADED — ${degraded.length} optional engine artifact(s) absent:\n` +
      degraded.map((d) => `  - ${d}  → runtime degrades truthfully (see health roster)`).join("\n") + "\n"
    );
  }
  const fatal = [];
  if (missing.length) fatal.push(`${missing.length} REQUIRED source(s) missing:\n` + missing.map((m) => `  - ${m}`).join("\n"));
  if (archMismatch.length) fatal.push(`${archMismatch.length} arch mismatch(es) for target ${targetArch}:\n` + archMismatch.map((m) => `  - ${m}`).join("\n"));
  if (fatal.length) {
    throw new Error(
      "electron-builder extraResources gate:\n" + fatal.join("\n") +
      "\nNative .node come from scripts/build-native-addons.sh (release only); " +
      "beads bd from `cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd`; " +
      "backend/dist from its own build (the Wave recoder-* frontend builds into the shell). " +
      "Refusing to package a desktop app with silently-missing or wrong-arch engine artifacts."
    );
  }
  return verified;
}
```

`readBinaryArch(file)` is pure Node (no shell, no heavy build) — read the first 8–20 bytes:

```js
function readBinaryArch(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    const magic = buf.readUInt32BE(0);
    // Mach-O 64-bit: magic 0xFEEDFACF (BE) / 0xCFFAEDFE (LE). cputype at offset 4.
    if (magic === 0xfeedfacf || buf.readUInt32LE(0) === 0xfeedfacf) {
      const cpu = buf.readUInt32LE(4);
      if (cpu === 0x0100000c) return "arm64";
      if (cpu === 0x01000007) return "x64";
    }
    // ELF (Linux): 0x7F 'E' 'L' 'F', e_machine at offset 18 (0x3E=x64, 0xB7=arm64).
    // PE (Windows): 'MZ' … we ship node-provided runtime; skip for now.
    return null; // unknown → do not block (fail-open on detection, not on absence)
  } finally { fs.closeSync(fd); }
}
```

Detection failing (`null`) is fail-open **only for the arch check** — absence is still fatal. That is the honest tradeoff: we never *block* on a header we couldn't parse, but we never *pass* a missing required file.

### Wiring `beforePack` (arch-aware)

`electron-builder.config.cjs:220-222` currently ignores the context. `beforePack(context)` receives `context.arch` (an `Arch` enum, already imported). Universal is a merged binary → skip the per-arch check.

```js
beforePack: async (context) => {
  const archName = context && context.arch != null ? Arch[context.arch] : null; // "arm64" | "x64" | "universal"
  assertExtraResourcesExist(config.extraResources, __dirname, {
    targetArch: archName === "universal" ? null : archName,
    optional: OPTIONAL_EXTRA_RESOURCES,      // §2
    archSensitive: ARCH_SENSITIVE_EXTRA_RESOURCES, // §2
  });
},
```

---

## 2. extraResources corrections (exact diffs)

The paths for beads/recodergit/dmux/tmux/backend are **already correct** — no change. Two corrections:

### 2a. Classify Lance as optional; declare the arch-sensitive set

Add near the top of `electron-builder.config.cjs` (after the `config` object or above `beforePack`). All four non-Lance arch-sensitive `from` strings were verified present on disk; the Lance string was verified absent (and its `crates/…` parent is absent too — see §0):

```js
// Deliberate cloud-or-degrade artifacts: absence is LOGGED, not fatal. Lance
// embedded vector store degrades to Qdrant/no-op (backend/src/domains/memory).
// NB: crates/lance/npm-bindings does not yet exist in the repo (see §8-A) — the
// entry is retained so the gate emits an explicit degrade line, not silence.
const OPTIONAL_EXTRA_RESOURCES = new Set([
  "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
]);

// Native binaries whose CPU arch must match the dmg target arch.
const ARCH_SENSITIVE_EXTRA_RESOURCES = new Set([
  "../../../backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node",
  "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
  "../../../backend/engines/rust/openfang/target/release/openfang_napi.node",
  "../../../backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node",
  "../server/engines/beads/bin/bd",
]);
```

Result: a dmg builds **today** (Lance absence → loud degrade line, not abort); when Lance is later vendored + built (§8-A) the same entry is validated for arch.

### 2b. Restrict the mac target to `arm64` (tractable honesty) — until x64 native exists

Every native artifact on disk is arm64 (verified). Shipping an x64 dmg full of arm64 `.node` is a dead-engine ship. Two options; pick the honest tractable one now:

```js
// electron-builder.config.cjs:137-147
mac: {
  target: [
    { target: "zip", arch: ["arm64"] },   // was ["arm64", "x64"]
    { target: "dmg", arch: ["arm64"] },    // was ["arm64", "x64"]
  ],
  ...
}
```

x64 / universal returns in §8-B once the native addons + `bd` are cross-built. Until then the gate would (with 2a) *reject* an x64 build anyway — restricting the target is the truthful, non-surprising form.

### 2c. Python sidecars — intentionally NOT added to extraResources

Bundling `mem0`/`colbert`/`browser-use`/`ops-recorder` requires per-arch venvs or a bundled interpreter (heavy, owner runbook §8-C). We do **not** fake it with an empty dir. Instead they are surfaced as explicit `down` in the health roster (§4 — read from `/internal/engines/health`, where their `EngineStatus` is truthfully `down` because the uv venv/entrypoint is absent) and their env (`MEM0_BASE_URL`/`COLBERT_RERANK_URL`) is only injected if the user configured a **cloud** endpoint (§3) — never a localhost pointing at a sidecar that isn't there.

---

## 3. Env injection wiring (`assembleBackendEnv`)

**File:** `apps/desktop/app/emain/emain-backend-core.ts:356`. All additions are **fill-only** (explicit base env always wins) and **existence-gated** (never point at an artifact that isn't there) — matching the existing openfang pattern.

### 3a. Extend the runtime-env resolver for the embedded vector store

**File:** `apps/desktop/app/emain/emain-backend-runtime-env.ts`. Add a sibling resolver (keeps `resolveOpenfangRuntimeEnv` focused):

```ts
export const RECODER_NATIVE_DIR_ENV = "RECODER_NATIVE_DIR";
export const LANCE_NATIVE_DIR_ENV = "LANCE_NATIVE_DIR";
export const LANCE_DATA_DIR_ENV = "LANCE_DATA_DIR";

export interface EmbeddedVectorEnv {
  nativeDir: string | null;    // <resourcesPath>/native — resolves governance + lance .node
  lanceDataDir: string | null; // only when the lance .node actually exists
}

export function resolveEmbeddedVectorEnv(opts: {
  isPackaged: boolean;
  resourcesPath?: string;
  dataDir: string;
  baseEnv?: NodeJS.ProcessEnv;
  existsSync?: (p: string) => boolean;
}): EmbeddedVectorEnv {
  const env = opts.baseEnv ?? process.env;
  const existsSync = opts.existsSync ?? nodeFs.existsSync;

  const nativeDir =
    opts.isPackaged && opts.resourcesPath
      ? nodePath.join(opts.resourcesPath, "native")
      : null;

  // LANCE_DATA_DIR only when the addon is present — otherwise the embedded store
  // must stay a truthful no-op (backend/src/domains/memory/config.ts: null → no-op).
  const lanceAddonPresent =
    !!nativeDir && existsSync(nodePath.join(nativeDir, "lance_npm_bindings.node"));
  const lanceDataDir =
    lanceAddonPresent && !env[LANCE_DATA_DIR_ENV]?.trim()
      ? nodePath.join(opts.dataDir, "lance")
      : null;

  return { nativeDir, lanceDataDir };
}
```

`RECODER_NATIVE_DIR`/`LANCE_NATIVE_DIR` = `<resourcesPath>/native` makes governance + lance resolution **explicit** rather than relying only on the `process.resourcesPath` probe in `napi-loader.ts`. `LANCE_DATA_DIR` is set **only** when the addon is on disk — so Lance is alive when built, and a clean no-op when not (never a load of a missing `.node`).

### 3b. Connector secrets from the encrypted store (mem0 / colbert cloud, honest)

Extend the BYOK allowlist read path so *connector addressing* secrets ride the same encrypted store, still allowlisted. **File:** `emain-backend-runtime-env.ts` — add to `BYOK_SECRET_ENV_NAMES` (or a separate `CONNECTOR_SECRET_ENV_NAMES` lifted the same way):

```ts
export const CONNECTOR_SECRET_ENV_NAMES: readonly string[] = [
  "MEM0_BASE_URL",       // points the platform mem0 client at a cloud/self-hosted sidecar
  "COLBERT_RERANK_URL",  // cloud rerank endpoint; absent → identity order (truthful)
  "QDRANT_URL",          // external vector store (alt to embedded Lance)
  "QDRANT_API_KEY",
];
```

These are read by the existing `readByokSecretsFromStore` machinery (allowlist param) and passed through `assembleBackendEnv`'s existing fill-only `byokSecrets` loop. **Key honesty point:** we never fabricate `http://127.0.0.1:...` for a sidecar we didn't package. If the user hasn't configured a cloud endpoint, the var stays absent → backend reports the capability `down` — exactly the truthful degrade the audit wants.

### 3c. Thread it into `assembleBackendEnv`

Add opts + fills (mirrors the existing `beadsBin` / `openfang` blocks):

```ts
export function assembleBackendEnv(opts: {
  // …existing…
  vector?: EmbeddedVectorEnv;                    // §3a
  connectorSecrets?: Record<string, string>;     // §3b
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { /* …existing… */ };

  // …existing beadsBin / byokSecrets / openfang blocks…

  if (opts.vector?.nativeDir) {
    if (!env[RECODER_NATIVE_DIR_ENV]) env[RECODER_NATIVE_DIR_ENV] = opts.vector.nativeDir;
    if (!env[LANCE_NATIVE_DIR_ENV]) env[LANCE_NATIVE_DIR_ENV] = opts.vector.nativeDir;
  }
  if (opts.vector?.lanceDataDir && !env[LANCE_DATA_DIR_ENV]) {
    env[LANCE_DATA_DIR_ENV] = opts.vector.lanceDataDir;
  }
  for (const [name, value] of Object.entries(opts.connectorSecrets ?? {})) {
    if (!env[name] && typeof value === "string" && value.trim()) env[name] = value;
  }

  if (opts.electronRunAsNode) env.ELECTRON_RUN_AS_NODE = "1";
  return mergePathIntoEnv(env, opts.loginShellPath);
}
```

The caller (`emain-backend.ts` / the supervisor `_startOnce`) resolves `resolveEmbeddedVectorEnv({ isPackaged, resourcesPath: process.resourcesPath, dataDir })` and reads connector secrets via the same encrypted-store reader already used for BYOK, then passes both into `assembleBackendEnv`. Decrypt failure keeps the existing behavior: log the truthful reason, continue keyless (names-only, values never logged).

**OPENFANG_CONFIG note (partial-close, honest):** on a fresh install `<dataDir>/openfang/config.toml` doesn't exist so `OPENFANG_CONFIG` stays null and the kernel boots its built-in default — a truthful degrade, not a dead path. Provisioning a shipped default config is a separate (small) task; it is **not** claimed as done here.

---

## 4. Readiness / health surface (packaging truth → runtime truth)

The backend already owns per-engine health, and the supervisor already polls for READY/FAILED (`pollHealth`, `emain-backend-core.ts`). The missing link is **surfacing which engines are alive vs dead-because-unpackaged** so an absent engine is visible, not hidden.

**Correct source (verified):** the per-engine roster is `buildEnginesHealth` (`backend/src/domains/engines/health.ts`), exposed on the `INTERNAL_SERVICE_KEY`-gated worker surface **`GET /internal/engines/health`** (`bootstrap/index.ts:1290`; `deps.mw.requireInternal`). It emits one `EngineStatus` per **declared engine**, named `${engineId}:${transport}` — `openfang:napi`, `tensorzero:napi`, `governance:napi`, `beads:cli`, `dmux:cli`, `tmux:cli`, `recodergit:cli`, `colbert:daemon`, `ops-recorder:daemon`, `multica:daemon`, `ziti:daemon`, `mem0:sidecar`, `browser-use:sidecar`, `pal-mcp:sidecar`. **NOT `/api/conductor/health`** — `buildConductorHealth` only emits `substrate:<id>` execution-substrate lines + `workspace-db`, so it cannot produce an engine roster.

The supervisor is a worker, not a logged-in user: it already **mints/holds `INTERNAL_SERVICE_KEY`** via `loadOrCreateSecrets` (`emain-backend-core.ts:253`) and injects it into the backend env (`INTERNAL_SERVICE_KEY`, line 379). So it calls `/internal/engines/health` with the same key, e.g. `fetch(baseUrl + "/internal/engines/health", { headers: { "x-internal-service-key": internalServiceKey } })` (header name per `requireInternal`).

Design (all TS, no heavy build):

1. **On READY**, the supervisor fetches `GET /internal/engines/health` (internal key), reads the `engines[]` array of `{ name: "<id>:<transport>", status, reason? }`, and writes a truthful roster into `userData/logs/backend-supervisor.log` — driven by the endpoint's own `status`/`reason`, not hardcoded. Engines whose `status === "up"` go on the alive line; `down`/`degraded` (with their `reason`, e.g. "uv venv absent", "binary unbuilt") go on the degraded line:
   ```
   [engines] alive:    beads:cli, recodergit:cli, dmux:cli, tmux:cli,
                       governance:napi, openfang:napi, tensorzero:napi
   [engines] degraded: mem0:sidecar (not packaged; venv absent → set MEM0_BASE_URL for cloud),
                       colbert:daemon (not packaged → identity rerank),
                       browser-use:sidecar (not packaged),
                       ops-recorder:daemon (not packaged)
   [vector]  lance: no native addon (crates/lance not built) → Qdrant/no-op   # NOT an /internal/engines engine
   ```
   **Mapping note (per critic):** Lance is **not** a declared engine on `/internal/engines/health`, so its `[vector]` line is derived from the packaging classification (`OPTIONAL_EXTRA_RESOURCES`, §2a) + `LANCE_DATA_DIR` presence (§3a) — not the engine endpoint. Conductor `substrate:*` ids (from `/api/conductor/health`) are a **separate axis** (execution substrate, i.e. can work launch at all); if the supervisor also surfaces substrate readiness it must label those lines `substrate:*`, never conflate them with engine ids.
2. **Expose the roster on `getStatus()`** (the supervisor's never-lies status object) so the Wave `recoder-*` frontend can render it. Per `.claude/rules/frontend.md` the surface shows *engine state with evidence links*, not "AI is working". A dead-because-unpackaged engine shows its endpoint-reported `reason` (`not packaged` / `venv absent`), not a blank.
3. **Reconcile packaging truth with runtime truth:** the same classification the gate uses (`OPTIONAL_EXTRA_RESOURCES`, un-packaged Python sidecars) is the expected-degrade list; if an engine the gate *verified present* (e.g. `openfang:napi`, `beads:cli`) reports `down` on `/internal/engines/health`, that is a **real** fault worth a louder log line (built-but-broken ≠ deliberately-absent).

This closes the loop: the gate guarantees no *silent* dead engine at package time; the roster (sourced from the endpoint that actually lists engines) guarantees no *hidden* dead engine at runtime.

---

## 5. Test plan

All unit-level, runnable without the release toolchain (no `cargo`, no `electron-builder`, no `.node` build).

**Gate (`assert-extra-resources.test.cjs`):**
- Missing **required** source → throws; message lists that exact `from`.
- Missing **optional** source (Lance) → does **not** throw; `console.warn` contains the degraded line.
- All present, no `targetArch` → returns verified list, no throw.
- Arch-sensitive file whose header says `arm64` with `targetArch:"x64"` → throws with "is arm64, need x64" (feed a fixture buffer with Mach-O magic + cputype; use a temp file).
- Header unparseable (`readBinaryArch` → null) → does **not** throw on arch (fail-open on detection).
- Entry with no `from` → throws.

**`resolveEmbeddedVectorEnv` (extend `emain-backend-runtime-env.test.ts`):**
- Packaged + lance `.node` exists (fake `existsSync`) → `nativeDir` set, `lanceDataDir = <dataDir>/lance`.
- Packaged + lance `.node` absent → `nativeDir` set, `lanceDataDir = null` (no-op honesty).
- Dev (`isPackaged:false`) → `nativeDir = null`, `lanceDataDir = null`.
- Explicit `LANCE_DATA_DIR` in baseEnv → resolver returns null for it (explicit wins).

**`assembleBackendEnv` (extend `emain-backend-core.test.ts`):**
- `vector.nativeDir` set → `RECODER_NATIVE_DIR` + `LANCE_NATIVE_DIR` present; explicit base env value wins (fill-only).
- `vector.lanceDataDir` null → `LANCE_DATA_DIR` absent (not empty-string).
- `connectorSecrets` fill-only: base env `MEM0_BASE_URL` wins over store; absent store key → var stays absent.
- Purity: input `baseEnv` object not mutated.

**Roster parse (extend the supervisor test):**
- Given a mock `/internal/engines/health` payload (`engines[]` of `{name,status,reason?}`), the roster splits `up` → alive line, `down`/`degraded` → degraded line carrying the endpoint `reason` — no hardcoded engine names.
- Supervisor sends the `INTERNAL_SERVICE_KEY` header it holds; a 401/absent-key path logs a truthful "roster unavailable (internal key)" line rather than a fabricated alive list.
- Lance is rendered from packaging classification, not from the engines payload (assert it is absent from the `engines[]` fixture yet still appears on the `[vector]` line).

**Config correctness (`electron-builder.config.test.cjs` or a lint script):**
- Every `OPTIONAL_EXTRA_RESOURCES` / `ARCH_SENSITIVE_EXTRA_RESOURCES` entry string is an actual `from` in `config.extraResources` (no typos / drift).
- `mac.target` arch list contains only arches for which the native artifacts are declared (guards re-adding x64 without cross-built native).

---

## 6. Verification gates (what I CAN prove without a heavy build / release toolchain)

Runnable now, on this disk, no cargo/dmg (no autonomous commit triggers a multi-GB build):

- `pnpm --filter <desktop> test` (or `node --test`) for the test files in §5 — proves gate logic, resolver logic, env fill-only semantics, and roster parsing.
- `pnpm check-types` / `tsc` on `apps/desktop/app` — proves the TS additions compile.
- **Gate dry-run:** `node -e "require('./app/electron-builder.config.cjs')"` then invoke `assertExtraResourcesExist(config.extraResources, appRoot, {optional, archSensitive})` directly with the real tree — proves it (a) no longer aborts on absent Lance, (b) still aborts if I temporarily rename a required source (e.g. `openfang_napi.node`), (c) prints the degraded line. This is the core "fails on missing, passes when present" proof **without packaging**.
- **Arch check on real files:** point `readBinaryArch` at the on-disk arm64 `.node` and `bd` (verified present) → asserts `"arm64"`; with `targetArch:"x64"` the gate throws — proving the cross-arch hazard is now caught.
- **Roster source check:** confirm `buildEnginesHealth` (not `buildConductorHealth`) is the function under `/internal/engines/health`, and that the supervisor already carries `internalServiceKey` — both static reads, no runtime.
- `pnpm format` on the touched files.

**What I explicitly CANNOT verify without §8 (owner runbook / release toolchain / disk):**
- That `lance_npm_bindings.node` builds or loads — the napi crate does not exist yet (`crates/` is absent at repo root); it must first be vendored/created (§8-A).
- That the full `.dmg` actually assembles, is signed/notarized, and boots — `electron-builder` + code-signing + a multi-GB build the disk-constraint memory says not to trigger carelessly. **This is why §8 stays owner-only and no Bucket A commit invokes it.**
- That the three arm64 `.node` addons load in-process in the *packaged* Electron `ELECTRON_RUN_AS_NODE` child (only a packaged run proves this; unit tests prove resolution/env, not dlopen).
- That a live `/internal/engines/health` returns the expected roster in a packaged boot (unit tests prove the parse against a fixture, not the running backend).
- Any x64 / universal behavior (no x64 native artifacts exist on disk).
I will state these as "not run" rather than imply success (per `.claude/rules/production.md`).

---

## 7. Sequencing (tractable commits)

Each commit is Bucket A only — green under §6 gates, no `cargo`/`electron-builder`/`.node` build:

1. **`feat(desktop): arch-aware fail-loud extraResources gate`** — extend `assert-extra-resources.cjs` (optional/arch-sensitive/`readBinaryArch`), keep back-compat signature, make `beforePack` pass `context.arch`. Add gate unit tests. *(Unblocks nothing yet by itself; safe.)*
2. **`fix(desktop): classify lance optional + declare arch-sensitive set; restrict mac target to arm64`** — the two `Set`s + `mac.target` diff (§2a/2b). *After this, a dmg is buildable again (Lance degrades loud instead of aborting) and won't ship arm64-in-x64.* Add the config-correctness test.
3. **`feat(desktop): inject embedded-vector + connector env into backend spawn`** — `resolveEmbeddedVectorEnv`, `CONNECTOR_SECRET_ENV_NAMES`, `assembleBackendEnv` fills, caller wiring. Add resolver + env tests (§5).
4. **`feat(desktop): truthful engine roster on boot`** — supervisor fetches `GET /internal/engines/health` (with the `INTERNAL_SERVICE_KEY` it already holds) on READY, logs alive/degraded roster driven by the endpoint's own status/reason, renders Lance from packaging classification, exposes on `getStatus()` for the Wave `recoder-*` frontend (§4).

Land order 1→2 first (2 depends on 1's option-aware signature); 3 and 4 are independent of each other.

---

## 8. OWNER RUNBOOK (heavy native build / release pipeline — NOT auto-committed)

These need cargo release builds, cross-compilers, code-signing, and multi-GB disk — run by the owner, documented as exact steps. **Do not run casually** (disk-constraint memory: near-full APFS, ENOSPC blocks all tools). **None of §8 is reachable from a Bucket A commit;** the `beforePack` gate is the only Bucket-A code that *references* these artifacts, and it degrades/aborts rather than building them.

### 8-A. Vendor + build the Lance native addon (so the embedded vector store is alive)

**Prerequisite (verified blocker):** `crates/` does not exist at the repo root — `crates/lance/npm-bindings` is absent (only a stale copy under `.claude/worktrees/...`). The lance napi crate must **first be created/vendored** into `crates/lance/npm-bindings` (with its own `Cargo.toml` declaring the napi package + cdylib) before any build step can run. As written today, `build_lance` would build a **nonexistent workspace**. This is a Bucket B project — do **not** pull it into a tractable commit.

Once the crate exists, add a `build_lance()` to `scripts/build-native-addons.sh` mirroring the existing `build_one` calls (confirm the workspace dir + napi package name + cdylib basename against the newly-vendored `crates/lance/npm-bindings/Cargo.toml`):
```bash
# in scripts/build-native-addons.sh — ONLY after crates/lance/npm-bindings is vendored
build_lance() {
  build_one "crates/lance/npm-bindings" "lance-npm-bindings" \
    "liblance_npm_bindings" \
    "$REPO/crates/lance/npm-bindings/target/release/lance_npm_bindings.node"
}
# add to the case: lance) build_lance || rc=1 ;;   and to all)
```
Then: `scripts/build-native-addons.sh lance`. After it lands, move the Lance entry out of `OPTIONAL_EXTRA_RESOURCES` (back to required) so its absence again fails loud.

### 8-B. Cross-arch native (re-enable x64 / universal)
For each of `openfang`, `tensorzero`, `governance` (and `bd`), produce x64 (and ideally universal) variants:
```bash
# Rust addons — add the x64 target and build per-arch, renaming to native/<name>.x64.node
rustup target add x86_64-apple-darwin
scripts/build-native-addons.sh all   # host arm64
# then per-crate: cargo build --release -p <pkg> --target x86_64-apple-darwin
# beads:
cd apps/desktop/server/engines/beads && GOARCH=amd64 go build -o bin/bd.x64 ./cmd/bd
```
Only after per-arch artifacts exist: restore `mac.target` arch to `["arm64","x64"]` (or `universal`) and extend the gate's `archSensitive` handling / `singleArchFiles` so each dmg gets its matching binary. The gate (§1) will then *enforce* that an x64 dmg carries x64 native.

### 8-C. Python sidecars offline-in-app (real packaging project, optional)
If mem0/colbert/browser-use/ops-recorder must run *offline in-app* (not cloud): bundle a Python runtime + per-arch venvs into `extraResources`, add them to the gate's required set, and wire `MEM0_BASE_URL`/`COLBERT_RERANK_URL` to the embedded sidecar ports. This is a heavy per-arch project. **Default recommendation:** stay cloud-or-degrade (§3b) — the honest, light path already covered in Bucket A. (Until then these engines report `down` on `/internal/engines/health` with a truthful "venv absent" reason.)

### 8-D. Produce + sign the dmg
```bash
cd apps/desktop
# prerequisites (out-of-band, enforced only by the beforePack gate):
#   (a) scripts/build-native-addons.sh all   # + lance (8-A, needs the crate vendored first), + x64 (8-B)
#   (b) cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd
#   (c) cd backend && pnpm build              # backend/dist (tsc)
#   (d) the Wave recoder-* frontend builds into the shell (pnpm run build:prod) — no separate cockpit/dist
#   (e) vendored recodergit + dmux dists present
task package   # pnpm run build:prod && electron-builder -c app/electron-builder.config.cjs -p never
# signing/notarization env (CSC_LINK / CSC_KEY_PASSWORD / notarytool creds) per release policy;
# production/dmg distribution is approval-gated (.claude/rules/production.md).
```
The `beforePack` gate now guarantees this run **aborts loud** if any required native/backend/bd artifact is missing or wrong-arch, and **prints a degraded roster** for the deliberately-absent ones — so a signed dmg can never silently ship a dead engine.

---

**Honesty summary:** Bucket A (gate + config classification + env injection + health roster) is fully implementable and verifiable on this machine without a native build, and it converts today's *silent* failure modes (Lance aborts the whole build; arm64-in-x64; un-surfaced dead sidecars) into either a **loud abort** or an **explicitly logged degrade**. The runtime roster is sourced from the endpoint that actually enumerates engines (`/internal/engines/health`, INTERNAL_SERVICE_KEY-gated, key already held by the supervisor), with Lance surfaced from packaging classification since it is not a declared engine and conductor `substrate:*` ids kept as a distinct axis. Bucket B (vendoring + building Lance, cross-arch native, bundling Python, and the signed dmg itself) requires the release toolchain and disk headroom and is left as an exact owner runbook — its success is **not** claimed here, and **no autonomous commit triggers it**.
