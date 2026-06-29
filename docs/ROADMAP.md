# Recoder — Execution Roadmap (what to do, tracked)

> The single source of truth for *what to build next* toward a shippable product.
> Read with [`ARCHITECTURE.md`](./ARCHITECTURE.md) (the design) and
> [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) (every tree → its job).
>
> Status legend: ✅ done · 🔄 in progress · ⬜ todo · 🔒 gated (needs a key/infra/decision)
> A step is **not ✅ until it runs end-to-end** — compiles/tests is not "done".

---

## Milestone 0 — Foundations (mostly done)

| | Item | Notes |
|---|------|-------|
| ✅ | Owned engines exist + tested | agent-os, runtime, governance(+Rust kernel), brain, coordination, substrate, distribution, interop, network |
| ✅ | Conductor backend complete + secured | `/api/conductor/*`, `sk_` x-api-key auth, tmux+worktree substrate proven (`claude -p` end-to-end) |
| ✅ | Governance kernel **actually used** | fixed the dead daemon-delegation path; Rust kernel now decides (real e2e) |
| ✅ | Desktop 3-pane cockpit | uses 8 packages; 148 tests |
| ✅ | Marketing site live | recoder.xyz Conductor/Cursor-grade, one-word Download, 4 plans, link previews |
| ✅ | Dev conductor harness | `docker-backend/scripts/dev-conductor.sh` boots backend + mints key |

---

## Milestone 1 — **A product you can install + run** (the unlock)

> Goal: download → open → it runs a real agent on your Mac using the whole stack.

| | Step | Owner tree | Done-when |
|---|------|-----------|-----------|
| ✅ | **1.1 Self-contained desktop** — Electron spawns + supervises the embedded backend (TMUX_BIN→`c/tmux`, mint key, health-gate), points cockpit at it | apps/desktop | app boots backend, `/api/conductor/health` 200 via the app-spawned host |
| ⬜ | **1.2 Bundle for `.dmg`** — electron-builder `extraResources` bundles backend dist + node_modules + `c/tmux` (+ governance daemon) | apps/desktop, deploy | `.dmg` opens on a clean Mac and boots its own backend |
| ⬜ | **1.3 Real run proof** — open app → add repo → `claude -p` in a tmux worktree → output streams → diff → merge | apps/desktop + conductor | a recorded end-to-end agent run from the packaged app |
| ⬜ | **1.4 Product icon** — replace the empty dock/tab icon with the real cube `icon.icns` | apps/desktop | dock shows the Recoder mark |

---

## Milestone 2 — Sign in + entitlement (turn it into a business)

| | Step | Owner tree | Done-when |
|---|------|-----------|-----------|
| 🔄 | **2.1 Device-flow sign-in in the app** (client + registry built; needs recoder.xyz endpoints + app wiring) | packages/distribution, apps/desktop | app gets a real recoder.xyz session |
| 🔒 | **2.2 Auth email login works** (stopgap: disable email-verify; real: Resend domain) | app/ (server), packages/auth | email signup→login works (Google already works) |
| 🔄 | **2.3 Entitlement gate** (+ device limit/revoke built) — free tier BYOK works; Pro/Team gated | packages/distribution | a gated capability respects the plan |

---

## Milestone 3 — Cloud control plane live

| | Step | Owner tree | Done-when |
|---|------|-----------|-----------|
| 🔒 | **3.1 Deploy the Node backend to prod** (replace/alongside legacy Python) | docker-backend, deploy | `api.recoder.xyz` serves the conductor/agent-os |
| 🔒 | **3.2 Billing live** (Polar org + keys) | py/recoder-billing, packages/distribution | one real checkout → entitlement |
| 🔄 | **3.3 Envoy mesh in front of the cloud host** (ext_authz→governance ext-authz v3 built, fail-closed) | packages/network, go/recoder-xds | edge fails closed when governance is down |

---

## Milestone 4 — Distribution

| | Step | Owner tree | Done-when |
|---|------|-----------|-----------|
| ⬜ | **4.1 Signed + notarized `.dmg`** | apps/desktop | Gatekeeper-clean install |
| ⬜ | **4.2 Homebrew cask** `brew install --cask recoder` | homebrew-recoder | brew installs the app |
| ⬜ | **4.3 Site Download → real GitHub releases** | site/, distribution | the Download button serves a real build |

---

## Milestone 5 — Teams / Enterprise (the moat)

| | Step | Owner tree | Done-when |
|---|------|-----------|-----------|
| ⬜ | **5.1 Remote substrate (Daytona)** — flip a workspace to run off-machine | packages/substrate, agent-sandbox | a Daytona-substrate workspace runs an agent |
| ⬜ | **5.2 Cross-machine mesh** (Envoy/xDS) | packages/network, go/recoder-xds | two machines share a fleet |
| 🔄 | **5.3 XDR audit** — 7 detections built (Envoy logs → detections → Merkle audit) | packages/network/xdr, governance | tamper-evident fleet audit |
| 🔄 | **5.4 Seats / SSO / AMI self-host** (AMI image + ext_authz mesh hardened; not yet built on a host) | packages/distribution, deploy/packer | an enterprise can self-host |

---

## Always-on hygiene (parallel, never blocks shipping)
- **Wire-up backlog** — connect built-but-unused packages into the product (see [`WIRE-UP-BACKLOG.md`](./WIRE-UP-BACKLOG.md)).
- **Park vendored clones** under a labeled vendor area; drop dead dirs (see DIRECTORY-MAP §park/drop).
- Truthful health everywhere; no fake-ready; `bd` for granular issues.

---

## How we work (so the docs stay followable)
- This file = the *what next*. Check a box only when it runs end-to-end.
- `DIRECTORY-MAP.md` = every tree → role/status/verdict (keep/wire-up/park/drop).
- `WIRE-UP-BACKLOG.md` = the ordered list of built-things-not-yet-used → their consumer.
- `ARCHITECTURE.md` = the design + the agent-execution model + Envoy/XDR/AMI.
- Per-run evidence + decisions go in `tasks/` (lessons) and `bd` issues.
