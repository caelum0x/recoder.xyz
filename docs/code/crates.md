# crates/ — Rust crates: openfang sidecar, TensorZero gateway, recoder-governance

> Code documentation for `/Users/arhansubasi/recoder.xyz/crates`.
> Verified by reading the source on 2026-07-01. Where the on-disk code disagrees
> with a crate's own README, this doc follows the **code** and flags the drift.
>
> **Update (2026-07-13, `feat/enterprise-s0-p0`).** Two changes since 2026-07-01:
> (1) **`crates/lance/` was deleted** — the columnar/vector store is superseded by Qdrant (see
> [RECODER-ENGINES §5](../architecture/RECODER-ENGINES.md)); the on-disk `crates/` tree is now
> `recoder-governance`, `openfang`, `tensorzero`, `claw-code-parity` (+ `openfang.toml`, `README.md`).
> Ignore the Lance rows/sections below. (2) **`crates/tensorzero` is now adopted as the wired LLM
> gateway (E15)** — `docker-backend/src/gateway/` (`tensorzero-client.ts` + `gateway.routes.ts` +
> OpenAI-compat `/v1/chat/completions`) is the `LlmGatewayPort`, degrading to the `pi-ai` BYOK client
> when the gateway binary is absent. Wired + unit-tested, not deployed.

## 1. Purpose

`crates/` holds the Rust tier of the Recoder platform. It is a mix of
**first-party Recoder code** and **vendored upstream clones** used as execution
substrates. The TypeScript control plane (`docker-backend/`, `packages/*`) is the
client/owner of state; these crates are deep engines or sidecars it talks to over
IPC/HTTP. Per `AGENTS.md` and `.claude/rules/agent-os.md`, none of these crates own
canonical Recoder task / approval / memory / artifact state — they are replaceable
adapters and engines below the model.

Two kinds of subtree live here (see `crates/README.md`):

- **First-party, tracked, owned:** `recoder-governance/` — the deep Rust governance
  kernel under the shipped TypeScript facade in `packages/governance`.
- **Vendored upstream clones:** `lance/`, `tensorzero/` (tracked), and
  `openfang/`, `claw-code-parity/` (**gitignored** — see Gotchas). Recoder-authored
  "seam" files for openfang (config + integration contract) live at the tracked
  `crates/` root so they are versioned even though the clone itself is not.

## 2. Layout

Top-level of `crates/` (what `git ls-files` confirms is tracked vs ignored):

| Path | Tracked? | What it is |
|---|---|---|
| `recoder-governance/` | tracked | **First-party** cargo workspace: the Rust governance kernel + IPC daemon (8 member crates). |
| ~~`lance/`~~ | **DELETED** (2026-07-13) | Removed — vector storage superseded by Qdrant. Rows/sections mentioning Lance below are obsolete. |
| `tensorzero/` | tracked | Vendored TensorZero — LLM gateway / inference + optimization platform (~40 Rust crates). **Adopted as the wired LLM gateway (E15)** via `docker-backend/src/gateway/`; degrade → `pi-ai`. |
| `openfang/` | **gitignored** | Upstream openfang "Agent OS" clone (~199K LOC). **Compiled into NAPI `.node` and fused in-process** (2026-07-13). |
| `claw-code-parity/` | **gitignored** | Upstream clone (deleted 2026-07-13 as not product runtime). |
| `openfang.toml` | tracked | Recoder-authored production config for the openfang sidecar (no secrets; `*_env` references only). *Outdated note: config was for HTTP mode; review for in-process usage.* |
| `README.md` | tracked | The openfang integration seam contract (build/run/HTTP routes/fail-safe). *Outdated; see RECODER-DEEP-FUSION-PLAN.md for in-process mode.* |

### recoder-governance/ (the part to actually read)

A standalone cargo workspace (`crates/recoder-governance/Cargo.toml`, resolver 2)
with 8 members. Dependency surface is deliberately tiny: `sha2`, `hex`, `thiserror`,
`serde`, `serde_json`; **only** the IPC + daemon crates pull `tokio` (minimal
features, never `full`).

| Member crate | Holds |
|---|---|
| `recoder-governance-types` | Shared domain types: `RiskTier` (ordered `Low < Medium < High < Critical`), `AuditAction`, `AuditEntry`/`AuditInput`/`AuditOutcome`, approval types, `GovernanceTypeError`. |
| `recoder-governance-audit` | SHA-256 Merkle hash-chain audit log (`chain.rs`/`entry.rs`/`hashing.rs`/`verify.rs`). Byte-interoperable with the TS verifier. |
| `recoder-governance-permission` | Permission enforcement: glob/rule matching, tool policy (deny-wins), workspace boundary, read-only heuristic, path depth. |
| `recoder-governance-approval` | Approval gate: classifier, auto-approve, pending/recent tracking, per-agent caps, manager. |
| `recoder-governance-routing` | Model/runtime routing: `RouteDecision`, `RuntimeAdapter` (`generic`/`codex`/`claude-code`), `risk_tier_router`, complexity. |
| `recoder-governance-kernel` | The engine: fuses the four domains behind one `decide(request) -> verdict`. Hot-reloadable config, `lane_policy` (merged claw policy engine). |
| `recoder-governance-ipc` | Typed IPC layer: `IpcMethod` (closed enum), `IpcEnvelope`, signed/unsigned auth, length-prefixed-JSON transport over a Unix-domain socket. |
| `recoder-governance-daemon` | The runnable binary (`[[bin]]` = `recoder-governance-daemon`): boots a kernel and serves the IPC over a UDS. |

> **README drift:** `recoder-governance/README.md` claims only `-types` and
> `-audit` exist ("first slice", others "not yet built"). The on-disk workspace has
> **all 8 crates implemented with tests**. Trust the source tree, not that README's
> "Not yet built" section.

## 3. Entry points

**Governance daemon (first-party, the real entry point to read first):**
- `crates/recoder-governance/recoder-governance-daemon/src/main.rs:29` — `#[tokio::main]`
  boots `GovernanceKernel::new(...)`, builds auth, and serves the IPC until SIGTERM/SIGINT.
- `crates/recoder-governance/recoder-governance-kernel/src/lib.rs` — public surface:
  `decide`, `GovernanceKernel`, `GovernanceRequest`, `GovernanceVerdict`, the lane policy engine.
- `crates/recoder-governance/recoder-governance-kernel/src/pipeline.rs` — the ordered
  decision stages (secret-access → forbidden-path → work-lock → approval-required →
  command/mcp risk → tool-policy → permission → routing → audit; fail-closed).
- `crates/recoder-governance/recoder-governance-ipc/src/method.rs:14` — the closed
  `IpcMethod` set: `decide`, `enforce_tool`, `route`, `request_approval`,
  `resolve_approval`, `record_audit`, `verify_audit`, `reload_config`, `health`.
- `crates/recoder-governance/recoder-governance-ipc/src/envelope.rs` — the on-wire
  `IpcEnvelope` (`id`/`method`/`payload`/`ts`/`sig`) and its signing preimage.

**TS side of the governance seam (where the backend consumes it):**
- `docker-backend/src/conductor/governance-daemon.ts` — spawns the daemon binary on
  boot, publishes `GOVERNANCE_SOCKET`, degrades to a pure-TS path if no binary exists.
- `docker-backend/src/conductor/governance-gate.ts` — builds the `Governance` instance.
- `packages/governance/src/ipc/*` — the TS client that speaks the daemon's UDS wire.

**openfang engine (in-process NAPI, 2026-07-13+, vendored):**
- **Status:** Compiled into a NAPI `.node` and fused in-process into the docker-backend Node process via `docker-backend/src/conductor/openfang-native.ts`.
- **Old HTTP mode (deprecated):** ~~`crates/openfang/crates/openfang-api/src/server.rs`~~ — the HTTP server was replaced by the in-process binding.
- **TS integration:** `docker-backend/src/conductor/openfang-native.ts` loads the `.node` + serves `/api/agents/openfang/*` from the in-process kernel. The old `createOpenfangProxyRouter` (HTTP→:4200) is removed.
- **Config:** Recoder-authored `crates/openfang.toml` — review for in-process mode compatibility.

**TensorZero gateway (vendored, now the wired E15 gateway):**
- `crates/tensorzero/crates/gateway/src/main.rs` — the `gateway` binary (Cargo `name = "gateway"`).
- Core logic in `crates/tensorzero/crates/tensorzero-core`.
- **Primary Recoder seam:** `docker-backend/src/gateway/tensorzero-client.ts` (`LlmGatewayPort`, the
  supervised gateway skin) + `gateway.routes.ts` + `openai-compat.routes.ts` (`/v1/chat/completions`).
  Fleet manifest entry `tensorzero` (loopback :3030), degrade → `pi-ai`.
- Older TS client also present: `packages/language-model/src/tensorzero-gateway.ts`.

**Lance (vendored):**
- Rust workspace under `crates/lance/rust/` (`lance`, `lance-core`, `lance-index`,
  `lance-io`, `lance-table`, `lance-encoding`, etc.).
- Python bindings under `crates/lance/python/` (`pyproject.toml` + `Cargo.toml`, PyO3-style).

## 4. Build / run / test

### recoder-governance (first-party — the commands you actually run)

From `crates/recoder-governance/` (per its README; these are plain Cargo, no Makefile):

```bash
cargo fmt --check
cargo clippy --workspace --all-targets
cargo check --workspace
cargo test --workspace
```

Run the daemon directly:

```bash
# requires INTERNAL_SERVICE_KEY (fail-closed) unless GOVERNANCE_ALLOW_INSECURE=1
GOVERNANCE_SOCKET=/tmp/recoder-governance.sock \
INTERNAL_SERVICE_KEY=... \
cargo run -p recoder-governance-daemon --release
```

In production the **TS backend spawns the prebuilt binary** itself; it never builds
the crate. Binary resolution order (`governance-daemon.ts`): `RECODER_GOVERNANCE_DAEMON`
env → `crates/recoder-governance/target/release/recoder-governance-daemon` →
`.../target/debug/...`. If none exists, the backend stays on the pure-TS path.

### openfang (vendored — NAPI build, 2026-07-13+)

**Current mode (in-process NAPI):**
```bash
# Build the NAPI `.node` into the workspace target/
scripts/build-native-addons.sh openfang
# Or per RECODER-DEEP-FUSION-PLAN.md:
cd crates/openfang && cargo build -p openfang-napi --release
```

The `.node` is ~110 MB and is loaded by `docker-backend/src/conductor/openfang-native.ts` at startup (degrade-safe if absent).

**Legacy HTTP mode (deprecated, not built):**
~~`docker compose up --build` for `cargo build --release --bin openfang`~~ — replaced by in-process binding.

Verify the Recoder config parses:

```bash
python3 -c "import tomllib; tomllib.load(open('crates/openfang.toml','rb')); print('OK')"
```

> Per RECODER-DEEP-FUSION-PLAN.md: openfang is now deep-fused as a NAPI `.node`, not sidecar-proxied. The HTTP daemon at :4200 is obsolete.

### tensorzero / lance (vendored — use upstream tooling)

These carry their own upstream build systems; do not assume Recoder-specific scripts.
- `tensorzero/`: cargo workspace + `pnpm` (`package.json`, `pnpm-workspace.yaml`), Python (`pyproject`-style via `clients/`), `.pre-commit-config.yaml`. Build the gateway with `cargo build -p gateway`.
- `lance/`: has a `Makefile` and `docker-compose.yml`; Rust via `cargo` in `rust/`, Python via `maturin`/`pyproject.toml` in `python/`. Treat as upstream — consult `crates/lance/CONTRIBUTING.md`.

## 5. Key patterns & contracts

**Governance verdict contract** (`recoder-governance-kernel/src/verdict.rs`):
`decide()` returns a `GovernanceVerdict { effect, tier, route, reason, audit_hash }`.
- `Effect` is a snake_case enum: `allow` / `needs_approval` / `deny`.
- `RiskTier` is **ordered**: `Low < Medium < High < Critical`.
- `VerdictRoute` is `Routed { tier, model, runtime }` or `Unrouted` (on deny).
- `runtime_for_tier`: `Low→generic`, `Medium→codex`, `High|Critical→claude-code`.
- `reason` is required to be human-readable and **secret-free**.

**Fail-closed everywhere.** The pipeline denies on any fault. The daemon
(`daemon/src/main.rs`) **refuses to start** without `INTERNAL_SERVICE_KEY` unless
`GOVERNANCE_ALLOW_INSECURE=1` is explicitly set (dev only, loud). UDS auth pins
peer credentials to the daemon's own uid (`geteuid` via a tiny inline FFI call) so
only same-user processes may connect.

**Typed IPC, hostile-by-default** (`ipc/`):
- `IpcMethod` is a **closed** enum — an unknown method name fails deserialization and
  is never dispatched (`method.rs` tests pin `"drop_table"` → error).
- `IpcEnvelope` carries an optional detached hex `sig`. Signing is **off by default**
  (auth = peer-cred + shared key); when a `SignatureVerifier` is configured it is
  **fail-closed** — a missing/invalid sig is rejected. The signing preimage binds
  `id\n method\n ts\n <compact-json-payload>` so a signature can't be replayed across
  methods or mutated payloads.
- Wire framing is hand-rolled length-prefixed JSON over UDS — no CBOR/heavy framing dep.

**Cross-language audit interop (load-bearing)** (`recoder-governance-audit` +
`packages/governance/src/audit/merkle-verifier.ts`): the SHA-256 hash pre-image is
`sha256(seq " " timestamp " " actor " " action " " detail " " outcome " " prevHash)`,
fields joined by a single ASCII space; genesis `prevHash` is 64 `'0'`s. The Rust chain
must stay byte-identical to the TS verifier; `tests/ts_interop.rs` pins a golden hash
vector produced by the real TS algorithm. Pure/deterministic by design: no `Mutex`, no
SQLite, no `tracing` — clock and sequence are injected so it runs identically on both
sides of the IPC boundary.

**openfang NAPI binding (current, 2026-07-13+):**
- Compiled `.node` loaded by `docker-backend/src/conductor/openfang-native.ts`.
- 45 NAPI methods exposed: agents/hands/triggers/workflows/events/extensions/memory/skills/usage/health.
- Degrade-safe: absent `.node` → pure-TS OSS dispatch at `/api/agents/openfang/*`.
- See RECODER-DEEP-FUSION-PLAN.md §openfang for the full binding reference.

**Legacy: openfang HTTP contract (2026-07-12 and earlier, DEPRECATED):**
- ~~`GET /api/health` public; everything else Bearer-gated~~ → now in-process NAPI.
- ~~openfang's `/api/a2a/*` distinct from Recoder's~~ → unified via conductor routing.
- (Kept for historical reference only; the HTTP daemon is no longer built or run.)

## 6. Gotchas

- **Gitignored upstream clones.** `crates/openfang/` and `crates/claw-code-parity/`
  are ignored (`.gitignore:663-664`). Edits inside them are **not versioned** by the
  root repo. Recoder-authored seam files (`crates/openfang.toml`, `crates/README.md`)
  deliberately live at the tracked `crates/` root for this reason. Don't put owned code
  inside the ignored clones expecting it to commit.
- **`crates/**/target/` is gitignored** (`.gitignore:713`). Build artifacts (incl. the
  governance daemon binary the backend spawns) are never committed — the binary must be
  built per-environment.
- **recoder-governance README is stale.** It says only 2 of 8 crates exist. The source
  tree has all 8 (permission/approval/routing/kernel/ipc/daemon all implemented with
  tests). Read the code, not the "Not yet built" list.
- **openfang is now NAPI-fused (2026-07-13+).** The `.node` is built from `crates/openfang/` via `scripts/build-native-addons.sh openfang` or `cargo build -p openfang-napi`. The old HTTP mode (port :4200 daemon) is obsolete. See RECODER-DEEP-FUSION-PLAN.md for the in-process binding contract.
- **Vendored crates carry their own AGENTS.md/CLAUDE.md and CI.** `lance/`, `tensorzero/`,
  and `openfang/` each have their own instruction files, licenses, and pre-commit/CI
  configs. Those govern *their* internals — they are not Recoder policy. Recoder's
  cross-agent policy (`/AGENTS.md`) still owns task/approval/memory/artifact state.
- **`tensorzero/` and `lance/` are large polyglot trees** (Rust + Python + Java + TS UI +
  `pnpm-lock.yaml` / huge `Cargo.lock`). They are upstream snapshots; prefer reading
  their READMEs over inferring Recoder intent from them. The only Recoder-owned
  integration is the thin TS client (`packages/language-model/src/tensorzero-gateway.ts`).
- **`.DS_Store` files are present** in `crates/`, `crates/openfang/`, and
  `crates/claw-code-parity/` — macOS cruft, ignore.
- **TS-vs-Rust governance split.** There are two governance implementations: the shipped
  pure-TS facade (`packages/governance`, with a `dist/` build) and the deep Rust kernel
  (`crates/recoder-governance`). The backend uses the Rust daemon when a binary is present
  and **silently degrades** to the TS deny-biased path otherwise — verify which path is
  live before claiming the Rust kernel is in use.
