export const meta = {
  name: 'recoder-completion-build-r2',
  description: 'Completion build round 2: one agent per tree IMPLEMENTS the top concrete incomplete features from the completion spec. Real code, no stubs, verify each.',
  phases: [
    { title: 'Build', detail: 'one agent per tree: implement top backlog features for real + verify' },
    { title: 'Regression', detail: 'docker-backend tsc + cockpit tests sanity' },
  ],
}

const ROOT = '/Users/arhansubasi/recoder.xyz'

const RULES = [
  'ABSOLUTE RULES (non-negotiable, user-enforced):',
  '- NO stub, NO mock, NO placeholder, NO TODO-as-implementation, NO fake success. Ship real, working code only.',
  '- Never create *.d.ts shims or scratch tsconfigs to dodge a type error. Fix the real cause.',
  '- Stay STRICTLY inside your assigned tree. Do NOT edit other trees or repo-root config (root package.json, pnpm-lock.yaml, turbo.json).',
  '- Do NOT touch gitignored UPSTREAM CLONES (go/beads, go/ziti vendored core, go/multica, crates upstream vendor trees). Only Recoder-authored seams are fair game, and only if your guidance says so.',
  '- Do NOT destabilize a PROVEN-working path. Specifically: the tmux+worktree conductor driver is proven to drive real `claude` end-to-end — do NOT rip it out or replace it with @recoder/runtime this round. Additive completion only.',
  '- Do NOT run root-level installs/builds (races nothing this round, but still): use the narrowest per-package check.',
  '- Verify every change with a real command and paste actual output. Never claim a pass you did not run.',
  '- If a listed feature is genuinely blocked (missing dep/key/env, disk risk, gitignore), do the safe portion, then report the blocker honestly in `blocked` rather than faking it.',
].join('\n')

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tree', 'implemented', 'changedFiles', 'verify', 'blocked', 'noStub', 'remaining'],
  properties: {
    tree: { type: 'string' },
    implemented: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['feature', 'whatChanged', 'files'],
        properties: {
          feature: { type: 'string' },
          whatChanged: { type: 'string', description: 'Concrete description of the real implementation' },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    changedFiles: { type: 'array', items: { type: 'string' } },
    verify: {
      type: 'object',
      additionalProperties: false,
      required: ['command', 'passed', 'output'],
      properties: {
        command: { type: 'string' },
        passed: { type: 'boolean' },
        output: { type: 'string' },
      },
    },
    blocked: { type: 'array', items: { type: 'string' }, description: 'Features attempted but genuinely blocked, with the real reason' },
    remaining: { type: 'array', items: { type: 'string' } },
    noStub: { type: 'boolean' },
  },
}

const TREES = [
  {
    key: 'docker-backend',
    path: `${ROOT}/docker-backend`,
    tasks: [
      'CONDUCTOR — highest value, all additive and safe:',
      '1) MOUNT THE DEAD CAPABILITY ROUTES. The multi-agent workflow runner, rich health, resources, status, and steer handlers are already WRITTEN/imported but not exposed. In src/conductor/conductor.routes.ts add the 5 route handlers wiring the already-present symbols (resolve the substrate handle from the workspace record for status/steer). This unlocks the headline "many parallel agents" feature that is already built.',
      '2) ENFORCE THE RESOURCE GOVERNOR on the primary path: in src/conductor/workspace-service.ts call admitWorkspace(projectId, createdBy) right after persisting state "created"; on rejection short-circuit to "failed" with the reason (do not launch). Map admission rejection to HTTP 429 in conductor.routes.ts.',
      '3) FIX THE LIFECYCLE: (a) in src/conductor/tmux-orchestrator.ts set remain-on-exit per-session immediately after new-session so clean exit-code-0 detection is deterministic; (b) make teardown advance the workspace RECORD to a terminal state (e.g. archived/completed) — currently teardown kills the substrate but leaves the record "running" (confirmed via a real live run), which the reconciler then flags as orphaned.',
      '4) AUTO-APPLY POSTGRES MIGRATIONS on boot when AGENT_OS_REPOSITORY=postgres (run 0002-conductor-workspaces.sql idempotently) so the missing-table blocker is gone. Keep degrade-safe.',
      'Verify: `cd docker-backend && npx tsc --noEmit 2>&1 | grep -c "error TS"` stays 0, plus targeted vitest for any touched conductor unit (e.g. conductor-locks, gateway, and a new route-mount smoke if feasible without tmux/pg).',
    ].join('\n'),
  },
  {
    key: 'packages',
    path: `${ROOT}/packages`,
    tasks: [
      'Highest-integrity, smallest win: GRADUATE WORK-LOCKS TO POSTGRES (durable, cross-process) with an in-memory fallback.',
      '- Implement packages/coordination/src/persistence/postgres/postgres-lock-store.ts (LockStorePort with compare-and-set on the fence token that conductor-locks.ts relies on) and postgres-lease-fencer.ts (LeaseFencerPort, monotonic per-scope tokens).',
      '- Export them from coordination/src/persistence/postgres/index.ts and the persistence barrel; keep the memory impls as the degrade fallback.',
      '- Do NOT attempt the XL @recoder/runtime wiring this round (risky, would touch docker-backend too). If you have spare safe scope, instead solidify coordination exports/types.',
      'Verify: `pnpm -F @recoder/coordination check-types` and `pnpm -F @recoder/coordination test` (paste tail). If a live Postgres is unavailable, unit-test the CAS logic against a fake pool you own (the store logic, not a mock of the store).',
    ].join('\n'),
  },
  {
    key: 'ts',
    path: `${ROOT}/ts`,
    tasks: [
      'Make @recoder/connectors actually consumable + give it a real dispatch half.',
      '1) EXPORT THE CLEAN PER-CHANNEL ADAPTERS from ts/extracted-from-openclaw/src index barrel so the 6 typecheck-clean adapters (telegram + the others that compile) are importable by docker-backend. Do NOT export the known-broken discord adapter (139 errors) — leave it out and note it.',
      '2) Implement a CONCRETE EmbeddedRunner backed by the pi-agent (src/agents/embedded-runner.ts is currently interface-only) — a real runner that takes a normalized inbound message + gate result and produces a reply via the pi coding-agent harness. Real implementation; gate external SDKs behind the existing optional-peer pattern so install stays ENOSPC-safe.',
      '3) Add the inbound -> gating -> embedded-agent -> outbound dispatch pipeline wiring (a ConnectorRegistry/dispatchInbound) — real, exercised by the existing 13 gating tests + at least one new pure dispatch test.',
      'Verify: per-package `npx tsc --noEmit` (0 errors) and the package test script (paste tail). Rebuild dist if the package ships a build.',
    ].join('\n'),
  },
  {
    key: 'apps',
    path: `${ROOT}/apps`,
    tasks: [
      'Make the desktop product reachable + installable for real.',
      '1) FIX NATIVE-MODULE PACKAGING in apps/desktop/package.json: ensure node-pty is asarUnpack-ed and electron-updater is bundled (the build.files whitelist currently excludes them), and add a release-artifact assertion (extend before-build.js) so it cannot silently regress.',
      '2) MAKE THE COCKPIT A FIRST-CLASS SURFACE: a persisted in-app backend-URL setting (so a default install can reach a remote backend without RECODER_COCKPIT=1) + standalone API-key entry with secure storage (electron safeStorage) in the cockpit so auth works on a clean machine.',
      'Do not break the existing 56 cockpit tests. Verify: `cd apps/desktop/cockpit && npx tsc --noEmit` (0) and `npx vitest run` (paste tail) and `node build.mjs`.',
    ].join('\n'),
  },
  {
    key: 'app',
    path: `${ROOT}/app`,
    tasks: [
      'Unblock the build break, honestly.',
      'Add the 3 missing exported functions to lib/project-snapshots.ts: listProjectSnapshotsWithLegacyFallback, getProjectSnapshot..., and the third the routes import — with REAL implementations matching their call sites (cross-model user vs users ownership via a shared resolveSnapshotOwnerCandidates(userId) helper).',
      'NOTE: this app/ path may be a sparse slice with no package.json — if you cannot run a full build here, still implement the real functions to satisfy the imports, typecheck whatever is locally checkable, and report the checkout-slice limitation honestly in blocked[].',
    ].join('\n'),
  },
  {
    key: 'shared',
    path: `${ROOT}/shared`,
    tasks: [
      'Fix the stale shipped API.',
      'The committed src/a2a/*.js build artifacts are stale (types.js exports 11 of 41 symbols) and package.json exports["./a2a"] points CJS consumers at wrong/partial output. REBUILD the artifacts from current src so the shipped .js/.d.ts match source, and verify the exports map resolves to files that exist for BOTH import and require conditions.',
      'Verify: `npx tsc --noEmit` in the package (0) and a require()/import smoke that the a2a barrel exposes the full symbol set.',
    ].join('\n'),
  },
  {
    key: 'site',
    path: `${ROOT}/site`,
    tasks: [
      'Stop the dead-ends and honesty violations (visible product polish).',
      '1) Add static assets: app/icon (favicon), app/opengraph-image, app/twitter-image so the tab + every shared link render.',
      '2) Make the download flow real: wire app/download/page.tsx platform cards/buttons to actual release assets OR, if no assets exist yet, a real "notify me" route — never a dead `#`. Verify/remove the brew line if unproven.',
      '3) Replace mailto-only Team/Enterprise CTAs with a real lead-capture route/form.',
      '4) Substantiate or QUALIFY unsupported claims (e.g. the ~41% figure) per the honesty policy — link a source/demo or label it clearly.',
      'Verify: the site build/typecheck (paste tail).',
    ].join('\n'),
  },
  {
    key: 'go',
    path: `${ROOT}/go`,
    tasks: [
      'One safe, high-leverage win only this round.',
      'Add scripts/build-bd.sh + a Makefile target that builds the `bd` binary reproducibly from go/beads (source .buildflags && go build with the CGO + gms_pure_go tag) — the conductor depends on `bd` (docker-backend bundle.ts) but the only working binary is a developer-local install. Make it reproducible.',
      'Do NOT modify the gitignored upstream clones (beads/ziti/multica) source. The ziti recoder/ seam is large and absent — DEFER it this round and report in remaining[].',
      'Verify: run the new build script and confirm a `bd` binary is produced (paste the version output), or report the exact build blocker honestly.',
    ].join('\n'),
  },
  {
    key: 'py',
    path: `${ROOT}/py`,
    tasks: [
      'work-signals: move persistence off in-memory, honestly.',
      'Refactor storage/workSignalStore.py into a repository Protocol with a Postgres (asyncpg, recoder_backend DB) implementation + the migration SQL, keeping the in-memory impl as a fallback. Real code matching the existing detector call sites.',
      'NOTE: a Python env may not be installed (pytest import errors expected). If you cannot run the suite, still write correct code, do a `python -c "import ast; compile(open(f).read(), f, \'exec\')"` syntax check on touched files, and report the env blocker honestly in blocked[]. Do NOT fake a passing test run.',
    ].join('\n'),
  },
  {
    key: 'docs',
    path: `${ROOT}/docs`,
    tasks: [
      'Make the docs reflect what is now TRUE (the user hates false claims).',
      '1) Record the LIVE-AGENT RUN PROOF: a real conductor run drove `claude -p` headless end-to-end (exit 0) creating GREETING.md in an isolated worktree, captured the diff, and tore down — update BUILD-STATUS.md / PRODUCT-PLAN.md to mark the core thesis PROVEN (with the honest caveat that it required clearing a stale ANTHROPIC_API_KEY in a lingering tmux server, and the workspace-record terminal-state fix is being added).',
      '2) Reconcile the dual-runtime split honestly: state the decision that the proven tmux driver remains canonical and @recoder/runtime is parallel/demoted until wired — so generic-adapter.ts is not presented as live.',
      '3) Fix any factually wrong "done" status and dead links to deleted files. Small, evidenced edits only. No code.',
      'Verify: grep that referenced files exist (paste a couple of checks).',
    ].join('\n'),
  },
]

phase('Build')
const results = await parallel(
  TREES.map((t) => () =>
    agent(
      [
        `You are the production-completion engineer for the Recoder tree: ${t.path}`,
        'Your job THIS ROUND is to IMPLEMENT the listed incomplete features for real and verify them.',
        '',
        RULES,
        '',
        'YOUR FEATURES THIS ROUND:',
        t.tasks,
        '',
        'Implement now. Depth and correctness over breadth — fully finishing 1-2 features beats half-finishing all. Return the structured result with honest blocked[]/remaining[].',
      ].join('\n'),
      { label: `build:${t.key}`, phase: 'Build', schema: SCHEMA, effort: 'high' },
    ),
  ),
)

const ok = results.filter(Boolean)
const built = ok.flatMap((r) => (r.implemented || []).map((i) => ({ tree: r.tree, feature: i.feature })))
const failedVerify = ok.filter((r) => r.verify && r.verify.passed === false)
const stubbed = ok.filter((r) => r.noStub === false)
log(`Completion build r2: ${built.length} features implemented across ${ok.length} trees; ${failedVerify.length} failed verify; ${stubbed.length} stub-flags`)

phase('Regression')
const regression = await agent(
  [
    'Regression sanity after the completion build. Fix ONLY a regression you directly find; otherwise change nothing.',
    'Run: `cd /Users/arhansubasi/recoder.xyz/docker-backend && npx tsc --noEmit 2>&1 | grep -c "error TS"` (expect 0).',
    'Run: `cd /Users/arhansubasi/recoder.xyz/apps/desktop/cockpit && npx vitest run 2>&1 | tail -6`.',
    'Return structured result tree="regression"; verify.passed=true only if docker-backend tsc==0 AND cockpit tests pass. Name any regression file/line in remaining[].',
  ].join('\n'),
  { label: 'regression', phase: 'Regression', schema: SCHEMA, effort: 'high' },
)

return {
  round: 2,
  implemented: built,
  perTree: ok.map((r) => ({
    tree: r.tree,
    features: (r.implemented || []).length,
    changed: r.changedFiles.length,
    verifyPassed: r.verify?.passed,
    noStub: r.noStub,
    blocked: r.blocked,
    remaining: r.remaining,
  })),
  totals: {
    featuresImplemented: built.length,
    failedVerify: failedVerify.map((r) => r.tree),
    stubFlags: stubbed.map((r) => r.tree),
  },
  regression: regression ? { passed: regression.verify?.passed, output: regression.verify?.output, remaining: regression.remaining } : null,
}
