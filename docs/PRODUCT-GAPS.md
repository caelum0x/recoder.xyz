# Recoder Desktop — Product Gaps & Product-First Roadmap

Status: re-audited 2026-08-31. Owner directive: focus on PRODUCT, grounded in the canon
([RECODER-PRODUCT-DESIGN.md](./RECODER-PRODUCT-DESIGN.md),
[DESIGN-REFERENCE.md](./DESIGN-REFERENCE.md),
[PRODUCT-THESIS.md](./PRODUCT-THESIS.md) §11-13). Source: a full product-surface
audit of every `recoder-*` view against the three-screens design.

## 2026-08-30 re-audit

### 2026-08-31 product expansion

- Canonical Jira requirements now join GitHub and Beads through a read-only REST v3 port;
  unavailable records remain unknown in validator evidence and Wave.
- Wave owns a durable repository Off/Warn/Block policy for required check-backed rules.
  Fresh merge-time results affect trust only when enabled and are sealed in evidence v4.
- `.recoder/checks.json` can route exact preparation/check argv to Recoder's existing off-box
  cloud sandbox with bounded tracked-delta sync and no silent local fallback.
- `.recoder/lsp.json` drives real stdio servers and Wave renders introduced/resolved
  base-versus-head diagnostics for changed files.

PW1 is shipped, so the original verdict below is retained as historical rationale,
not current product truth:

- Separately launched same-repo workspaces can be selected on the board and compared
  through the explicit ad-hoc compare/converge API. Its synthetic provenance id no
  longer strands deep inspection: clicked contested paths use explicit-id N-up file
  versions, and A/B picks use the true line-diff edge before composition.
- Compare & Converge has a full-view Wave modal rather than living in an expanded
  board row.
- The converge panel is the single per-file decision list; compare columns link into
  it instead of owning a second winner map.
- The Wave↔Loom interactive terminal bridge is shipped and governed input remains on
  the Conductor steer path.
- Failed GitHub/local checks, merge conflicts, and secret findings now have a governed send-back
  action in Review. The backend re-runs canonical readiness probes, authors the
  bounded remediation packet, and chooses live steer versus a follow-up run; the
  browser never supplies blocker prose. Wave lists those canonical blockers,
  suppresses the loud Merge action, and labels the deliberate fallback as
  **Attempt merge**. While blockers remain it re-probes them on a bounded slow
  cadence, so an asynchronous agent fix clears Review without a manual refresh
  or an expensive probe on every UI tick. Enforcement stays an explicit deployment decision:
  `RECODER_MERGE_TRUST_GATE=warn` is advisory by default, while `block` refuses a
  low-trust delivery before mutation. A successful warn-mode delivery keeps its
  tier, score, and trust advisory visible instead of collapsing to a bare success.
  An unjudgeable block-mode merge is a distinct **Human review required** outcome:
  the backend returns structured escalation provenance, while a judged low-trust
  refusal remains **Blocked by convergence trust**. Wave no longer presents either
  as a generic service failure.
- Session and Review now swap in one persisted Wave workspace-detail container
  with a shared identity/switcher header. Terminal stays a deliberate Wave
  pop-out, but Loom and tmux workspaces now use the same authenticated Recoder
  terminal edge. Conductor resolves the durable workspace to its substrate,
  renders the existing pane, and keeps input on governed steering; Wave no longer
  creates a second workspace process for canonical Recoder sessions.
- The home board is lifecycle-first (`Queued → Running → Needs review → Done`),
  with parallel groups placed by their most urgent sibling and newest-first only
  within a lifecycle column.
- Parallel agents now coordinate before completion: the existing owner-scoped,
  governed milestone broadcaster shares bounded file/diff progress at first
  change and later material milestones. The launch panel exposes a default-on
  teamwork control (with a real `sibling_awareness:false` wire opt-out), and the
  Session surface hydrates a durable Agent coordination ledger from canonical
  RunEvents so operators can inspect who shared context and when.
- Wave AI is now part of the workspace loop rather than an adjacent panel:
  Session and Review expose Ask AI, the context resolver prefers the focused
  Recoder detail workspace over stale Board selection, falls back to the
  canonical workspace read when no Board is open, and attaches the current
  changed-file/diff context once per Wave AI conversation with an explicit
  attach/detach indicator.
- Workspace detail now has a persistent two-tier spine across Session and
  Review: repository/phase, branch, real agent name, and state remain visible
  independently of tabs/actions; the navigation/action row wraps in narrow Wave
  tiles instead of clipping identity. Session attributes conversation turns and
  the composer to the actual agent, redundant Recoder wordmarks are removed,
  and unknown runtime ids are humanized rather than leaking engine syntax.
- Governed skills are now a real workspace product surface rather than an MCP-only
  backend seam. Session lists only signature-verified, version-pinned manifests,
  renders each action's closed typed parameter schema, and invokes it as the
  authenticated owner against the canonical workspace id. The first-party
  Workspace skill ships bounded read-file, list-files, text-search, and Git-diff
  actions through closed capability handlers. Its Swiss-style Trust ledger shows
  the real publisher catalog, fingerprints, source, durability, and admission
  failures; operators can persist a public Ed25519 publisher, admit its explicitly
  pinned signed manifest at runtime, or revoke that publisher and its skills.
  Private signing keys are never accepted. Every invocation now writes a durable,
  content-hashed record with its exact typed parameters, owned workspace target,
  resolved worktree, publisher/version/capabilities, policy verdict, actor, timing,
  and truthful refusal/approval/execution evidence. The ledger verifies each hash
  on read and exposes the owned workspace's real history rather than fabricated
  telemetry. In the installed desktop, the canonical KV contract now shares the
  embedded SQLite state-of-record, so this evidence and operator trust survive a
  backend/app restart without requiring Postgres.
- Workspace policy is now a real product surface beside Actions and Trust. Each
  canonical workspace persists a revisioned default effect, exact per-action
  allow/approval/deny overrides, reasons, and swarm auto-answer confidence in the
  same embedded SQLite state-of-record. Governed skill invocations record the
  applied policy revision, while `swarm.unblock` takes both its tool verdict and
  auto-answer posture from that profile; request arguments cannot widen it.
- Converge readiness is event-driven from the authoritative terminal completion
  path: workspace settlement publishes a replayable `/sync` state frame and the
  Board coalesces it into an immediate canonical refresh. A settled-group revision
  key now invalidates any Compare snapshot opened mid-run, so the final sibling's
  changed files are re-read exactly once before the converge invitation is derived.
- Remote continuity now has an authenticated product boundary. Session can mint a
  short-lived monitor or opt-in-steer session for the current owned workspace,
  show its truthful restart-survivability, probe live scope status, and copy a
  direct receiver link or bounded access packet for another signed-in client.
  The protected web receiver renders the real status-board panes, consumes a
  scope-filtered live SSE projection of native Loom status and lifecycle edges,
  sends governed input only when the session grants `steer`, and can explicitly
  revoke the session. A slow 15-second read is recovery-only while the stream is
  unavailable. Because desktop normally
  uses loopback, the packet asks for the same backend's reachable URL and warns
  that `127.0.0.1` only works on this computer. The HTTP monitor/steer
  routes re-derive identity and ownership on every use; sessions live in the
  canonical TTL-backed KvStore and survive backend restart when persistence is
  durable; installed desktop persistence now uses its embedded SQLite state-of-record.
  Remote steer still runs policy, approval, delivery, and audit.
  Canonical Better Auth sign-out revokes every remote session for that owner
  before invalidating the browser credential, covering web and desktop clients.
- Background agents now have a bounded, operator-owned Wave loop. Start pins the
  exact Git repository, project, space, and installed runtime; pause prevents new
  launches; manual and scheduled scans reuse the visible target. Dispatches are
  durable canonical workspaces, so the existing attention notifications and
  Session/Review actions own their lifecycle. Each launch records human review
  ownership and `autoMerge:false`; unattended work can prepare changes but cannot
  deliver them.
- Pull-request review agents now use that same authority without requiring a
  deployed webhook. Wave starts or pauses a local `gh` watcher for the pinned
  repository/runtime and can include drafts explicitly. Each open PR revision is
  keyed by repo, number, and head SHA; canonical workspace metadata prevents a
  duplicate after restart, while a new push intentionally opens a fresh review
  Session. The bounded PR diff is given to a review-only agent, and Wave exposes
  both the Session and real GitHub URL. A human can then publish a native Comment,
  Approve, or Request changes review from Wave. The backend re-derives the target
  from canonical metadata and passes `artifact.publish` through governance and the
  existing approval lifecycle before `gh pr review`; the watcher still cannot
  post or merge autonomously.
- Independent PR reviewers now converge by qualified code symbol plus defect
  class rather than brittle exact line equality. Adjacent revisions preserve
  lifecycle, native GitHub thread state, and repo feedback through real diff
  renames and large line shifts; unanchored message similarity is never treated
  as proof that two findings are the same.
- The PR-review header now exposes the repository's active learned signal profile:
  accepted versus dismissed symbol/defect rules plus a durable longitudinal
  decision history. Each Accept/Dismiss atomically updates the active rule and
  cumulative counters in one repository-scoped KV document; Clear removes the
  rule without erasing its historical decision. Legacy per-rule records migrate
  with explicit `migrated_active_rules` coverage. Wave distinguishes the lifetime
  dismissal rate from the current active accepted/dismissed rules.
- Delivered convergence decisions now form their own repository-scoped history.
  A successful composed merge records the contested file picks, chosen source
  workspace/runtime, trust tier/score, flags the operator proceeded with, actor,
  timestamp, and sealed evidence hash in the installed app's canonical KV. The
  write is idempotent per delivered workspace and retains a bounded newest-first
  evidence trail; Wave shows cumulative delivered/pick/flag counts after merge,
  and an authenticated workspace read restores the profile after restart. A merge
  with a flag means **proceeded with**, not **dismissed**. Wave now gives every
  delivered flag an explicit Accept risk / Dismiss noise / Restore decision rail.
  Those governed decisions update one active exact-match repository rule and an
  append-only bounded history. Future trust keeps accepted flags visible with a
  small bounded confirmed-risk deduction; dismissed exact repeats stop surfacing,
  but never restore evidence points or erase the underlying factor.
- After the full reviewer cohort reports, the watcher now opens one distinct,
  durable validator Session. It independently judges every bounded canonical
  finding as confirmed, rejected, or uncertain with evidence; Wave carries that
  judgment into the human-owned review without auto-hiding rejected findings.
  The judge also runs for zero-finding cohorts and separately exposes aligned,
  partial, misaligned, or unknown PR intent, including unmet requirements and
  unrelated scope in Wave and the editable review draft.
  Explicit same-repository GitHub issue references are now resolved through the
  authenticated local `gh` boundary and shown as canonical sources; casual hashes,
  cross-repo links, and inaccessible issue bodies never become invented criteria.
  Explicit `bd:<id>` and `Beads issue <id>` references now resolve through the
  same memory-owned canonical issue graph used by HERDR dispatch. Reviewer and
  validator Sessions receive bounded title, description, status, labels, notes,
  and dependency evidence; Wave and the editable review draft retain the work-item
  provenance, while an unavailable graph or missing bead remains unknown.
- Repositories can now commit bounded review criteria in
  `.recoder/review-rules.json`, `.recoder/review-rules.md`, or `REVIEW.md`. The
  independent validator returns pass, fail, or unknown with evidence for each
  rule, and Wave carries those results into the editable human review. These
  rules add scrutiny criteria only; they do not grant authority or act as a
  deterministic merge gate.
- Repositories can now opt into Recoder-owned deterministic command checks with
  `.recoder/checks.json`. Commands run as explicit argv in the owned worktree,
  with bounded count, output, and deadlines; their real pass/fail/error results
  join GitHub checks in readiness and appear as individually sourced Recoder rows
  in Wave even when the branch has no pull request. The detailed Checks and
  readiness reads share an in-flight execution, so opening Review cannot run the
  same command twice. Full off-box/ephemeral sandbox isolation and base-vs-head
  diagnostics deltas remain future expansion. Recoder's own repository now
  dogfoods the manifest with backend and Wave type-contract rows; a real runner
  exercise returned both as passing.
- Readiness now scans only diff-added lines for high-signal credential shapes and
  secret-named assignments, with redacted evidence. Added package lifecycle hooks
  (`preinstall`, `install`, `postinstall`) are also hard blockers. New registry and
  non-registry dependencies plus lockfile additions over 500 lines remain explicit
  human-review advisories, visible beside blockers in Wave. This is a deterministic
  local first layer, not a claim of full SAST or vulnerability-database coverage.
- The pre-merge trust fold now reads the composed workspace's immutable per-file
  convergence provenance. Its original source count wins over the composed
  workspace's intentional singleton shape, so real N-agent agreement never
  collapses to `solo`; contested picks and model-assisted files affect the gate
  before delivery rather than appearing only in post-merge evidence. Composition
  also preserves canonical repository metadata while removing only the old
  `taskGroup` membership.
- A current PR finding can now start one isolated fix Session from its exact
  reviewed head SHA. Recoder owns the repository, revision, finding payload,
  and workspace provenance; Wave supplies the installed runtime choice. The
  row tracks the fix Session through running and ready-to-compare states, then
  opens the existing Wave diff for human delivery. The operator can retry a
  failed attempt, while repeated clicks reuse active work.
- Repo-owned `.recoder/checks.json` rows can now opt into operator-triggered
  agent remediation with `autofix: true` and an optional bounded `fixPrompt`.
  Wave distinguishes agent-fixable rows from manual advisories. A failing opted-in
  row exposes **Ask agent to fix**. The governed edge first reproduces the exact
  named failure, then sends Recoder's argv-backed prompt into the same isolated
  Session/worktree. When the agent settles, the terminal hook independently reruns
  that named argv and stores durable before/after status, detail, timestamps, agent
  outcome, and attempt identity on the canonical workspace. Wave polls through
  `fix running` to `fix verified`, `fix still failing`, or `fix unverified`; the
  agent cannot self-attest, push, merge, publish, or rewrite the check definition.
- JSON review rules can bind an exact `.recoder/checks.json` name. Recoder captures
  the head-pinned command evidence before validator dispatch and ignores conflicting
  model opinions for that rule. Wave identifies check-backed verdicts, defaults a
  failed required rule to an editable **Request changes** suggestion, and exposes
  opted-in autofix on the rule itself. The fix continues the isolated validator
  Session; the independent terminal attestation replaces stale rule evidence with
  running/passed/failed/error truth. The operator still owns the GitHub event.
- RecoderGit impact now follows the installed PR review through canonical
  workspace metadata. Reviewers, the independent validator, and finding fixers
  receive bounded upstream callers, downstream dependencies, affected tests,
  process paths, graph depth, and risk. Wave renders the same ledger and includes
  it in the human review draft. Missing and partial graphs remain visible. The
  packaged desktop uses the MIT RecoderGit graph when the PolyForm donor is absent.
  The scanner resolves imported calls only when the target file declares the
  callee, then walks callers and callees by symbol. Unresolved syntax falls back
  to file imports and produces `mixed` or `file` scope. The scanner also records
  executable, server, worker, and route entrypoints and maps reached files onto
  those process paths. RecoderGit mines the latest 500 non-merge commits for
  repeated source-file pairs. It drops commits that touch more than 50 source
  files, keeps pairs seen together at least twice, caps each file at 20 history
  neighbors, and stores Jaccard confidence plus commit count. Agent OS,
  Conductor, and Wave render those directionless links as **changed together**.
  RecoderGit registers repository packages and unresolved external imports during workspace indexing
  for npm, Python, Go, and Cargo in canonical KV. A provider change now returns
  exact consumer files from other indexed repositories, their canonical repository
  IDs, package names, and import specifiers. Review agents receive the same bounded
  consumer list, and both Wave review surfaces show it.
  It resolves JSONC `tsconfig`/`jsconfig` `baseUrl`, wildcard `paths`, and inherited
  monorepo aliases. It follows Python absolute/relative modules, Go packages from
  discovered `go.mod` modules, and Rust `mod`/`use` paths across local crates.
  Python roots come from setuptools/Poetry fields in `pyproject.toml`,
  `setup.cfg`, and Pyright execution roots or extra paths. Go resolution applies
  local `replace` directives from the owning `go.mod` and `go.work`, including
  workspace `use` roots. Rust resolution follows `#[path = "..."]` modules.
  Conductor readiness now carries this same bounded ledger into
  Review instead of rebuilding a five-symbol upstream count. RecoderGit index
  state now uses the installed app's canonical KV, so repo root, SHA, branch,
  stats, and availability survive an embedded-backend restart. The packaged
  dependency graph now stores a compact versioned snapshot in the same KV. A
  restarted backend reuses an exact repo and source-revision match; changed
  tracked or untracked worktree content forces a source rebuild.
  Conductor now resolves the Git origin at workspace creation and persists one
  canonical repository ID plus its former path and project aliases. GitHub review
  derives the same ID from the PR URL. Completion reindexes with the persisted ID,
  and RecoderGit migrates matching current-analyzer KV state and snapshots from
  legacy keys. The symbol/process/history/package analyzer version forces one rebuild of older
  file-only snapshots.

The next product order (excluding release/ops work by owner directive) is:

1. Exercise fanout, compare, governed converge, issue/PR background dispatch,
   fix handoff, and recovery against a Recoder-owned fixture repository (or an
   external repository explicitly selected for that run). Source
   recovery keeps healthy siblings, retries incomplete agents into the same
   owned group, opens each Session and Review, and composes active replacements.
   Earlier isolated-worktree diagnostics exposed and closed terminal-authority
   defects, but they are not acceptance evidence for Recoder: a vanished agent
   session can no longer fabricate `completed(0)`, every terminal RunEvent now
   carries its canonical workspace id so `running` settles immediately, and a
   tmux `new-session` false zero must pass a named-session probe before launch is
   accepted. Local tmux runs also persist their real exit status outside the Git
   worktree. `conductor:verify-live-agents` now copies only existing Codex auth into
   an isolated writable runtime home, launches two real CLI processes against
   `backend/fixtures/live-convergence`, removes the temporary credential copy in
   every outcome, and preserves bounded failure events. In the managed Codex host
   both authenticated turns now reach the response transport but DNS/network access
   to `chatgpt.com` is denied. The full successful pass therefore still requires
   running that Recoder-owned verifier from a host allowed to reach the provider.
2. Add provisioned host-to-host Loom reach when remote-runner deployment returns
   to scope; the client continuity, stream, governance, and sign-out revocation
   loop is already source-wired.
3. Keep the selectively absorbed HERDR v0.8.2 runtime fixes, Loom terminal
   protocol, and Wave shell boundary current as upstreams evolve.

Crystal (`stravu/crystal`, MIT) is a reference donor for session persistence,
progressive Git status, diff-first review, transparent Git command previews, and
conflict-to-agent UX. Its full source is vendored as an inspectable donor, but it is
deprecated and duplicates Wave/Loom authority, so it is never started or packaged
as a production runtime.

## The verdict

**Historical 2026-08-05 verdict:** the convergence engine is real, differentiated, and truthful — but the SEAT
is cramped.** The capability (fan-out → compare → converge → merge → evidence →
memory) all exists and degrades honestly; a passing e2e proves the loop. What
hurts a first-time dev is _staging_, not capability:

- The headline feature (converge) is a **five-panel stack jammed into an
  expanded board row** with sideways-scrolling columns — the differentiator has
  the least room to breathe.
- Converge is **hard-gated to same-`taskGroup` fan-out** — a dev who ran Claude
  and Codex _separately_ on one repo gets **no converge path at all**, which is
  exactly how many first-timers arrive.
- The **winner-picker is shown twice** (ContestedStrip + ConvergePanel) over one
  shared selection.
- Small calm-design breaks pile up (3-color health dot, per-view color, wordmark
  headers, an emoji, a separate Approvals tab that contradicts inline-only, and
  two engine leaks that name `bd`/"engine blocks" to users).

Fixing the convergence _seat_ moves the needle most; none of it needs a rewrite
of the (solid) logic modules.

## The three screens — current grades

- **Board (home): B−** — feature-complete but renders recency buckets, not the
  promised lifecycle columns; can't scan "which agent needs review."
- **Workspace detail: C** — scattered across disconnected Wave blocks (Session /
  Review / real tmux terminal are separate `createBlock` targets); no tabbed
  container. Inline approval is correct; the standalone Approvals tab was retired
  (approvals now surface inline on the diff/session stream).
- **Minimal chrome: C−** — no cube logo / workspace switcher; the health dot is now
  a single quiet graphite dot (the emerald/amber/red trio was retired); settings is
  palette-launched, not behind the avatar.
- **Zero-config first-run: B+** — the strongest area; detection + install-loop
  have no dead ends. Sign-in is (deliberately) reframed as optional.

## Roadmap — product waves (highest first-timer leverage first)

### PW1 — The convergence seat (the headline)

1. **Ungate converge** — let a dev SELECT 2+ compatible workspaces (same repo,
   shared base) launched _separately_ and form an ad-hoc converge group, not
   only same-`taskGroup` siblings. Backend: a compare/converge over an explicit
   workspaceId set. This is the biggest first-timer unblock.
2. **Give converge its own uncluttered surface** — lift compare/converge out of
   the expanded board row into a dedicated view/modal with room; N columns that
   read cleanly.
3. **One winner-picker, not two** — collapse ContestedStrip + ConvergePanel into
   a single per-file decision surface over the shared selection.

### PW2 — Calm chrome & truthful invisibility (DESIGN-REFERENCE conformance)

4. **One quiet health dot** — graphite + at most one muted crimson (down); retire
   the emerald/amber/red trio and fold the connection badge in. (Corrects the
   wave-12 dot.)
5. **Inline approvals only** — retire the standalone Approvals tab + its palette
   command; keep the correct inline cards.
6. **Kill the engine leaks** — `recoder-board.tsx` naming the `bd` CLI, settings
   "engine blocks" copy → human language or removal (invisible-engines contract).
7. **Terminal/Diff design-system alignment** — shared tokens (focus-visible ring,
   `border-white/8`), no wordmark headers ("Recoder Session"/"Recoder — Review"),
   no emoji/colored FA glyphs, 400-500 weights.

### PW3 — Workspace-detail container + board shape

8. **Lifecycle columns** on the board (queued → running → needs-review → done),
   not recency buckets — the exact scan a converging dev needs.
9. **A workspace-detail container** — bring Session / Diff / (real) Terminal /
   Conversation under one tabbed surface per workspace instead of loose blocks.
10. **Settings behind the avatar**; a minimal orienting chrome (where am I /
    whose repo / switch workspace).

## Locked constraints (do not violate)

- Terminal-plain, less-is-more; engines stay invisible.
- Truthful degrade everywhere (the app already never fakes success — preserve).
- One accent (graphite + one muted crimson); no green/blue for state.
- No rewrite of the logic modules — they're solid; this is staging + chrome.
