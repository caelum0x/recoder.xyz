export const meta = {
  name: 'recoder-completion-build-r2c',
  description: 'Round 2c (concurrent with 2b, disjoint trees): deeper completion on docker-backend, packages, apps, shared, crates, tools. Real code, no stubs, verify each.',
  phases: [
    { title: 'Build', detail: 'docker-backend/packages/apps/shared/crates/tools: deeper backlog + verify' },
  ],
}

const ROOT = '/Users/arhansubasi/recoder.xyz'

const RULES = [
  'ABSOLUTE RULES (non-negotiable, user-enforced):',
  '- NO stub, NO mock, NO placeholder, NO TODO-as-implementation, NO fake success. Ship real, working code only.',
  '- Never create *.d.ts shims or scratch tsconfigs to dodge a type error. Fix the real cause.',
  '- Stay STRICTLY inside your assigned tree. Do NOT edit other trees or repo-root config.',
  '- Do NOT touch gitignored UPSTREAM CLONES. Only Recoder-authored seams, and only if your guidance says so.',
  '- Do NOT destabilize the PROVEN tmux+worktree conductor driver, or the already-mounted routes/governor (they are committed and verified). Additive completion only — extend, do not rewrite working code.',
  '- CRITICAL (crates): do NOT run `cargo build --release` or any full Rust build of openfang (199K LOC) — it can ENOSPC the disk. Config/seam/doc work only; report build as blocked.',
  '- Verify every change with a real command and paste actual output. Never claim a pass you did not run.',
  '- If genuinely blocked, do the safe portion and report honestly in `blocked`.',
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
        properties: { feature: { type: 'string' }, whatChanged: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
      },
    },
    changedFiles: { type: 'array', items: { type: 'string' } },
    verify: {
      type: 'object',
      additionalProperties: false,
      required: ['command', 'passed', 'output'],
      properties: { command: { type: 'string' }, passed: { type: 'boolean' }, output: { type: 'string' } },
    },
    blocked: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } },
    noStub: { type: 'boolean' },
  },
}

const TREES = [
  {
    key: 'docker-backend',
    path: `${ROOT}/docker-backend`,
    tasks: [
      'CONDUCTOR — deeper survivability + delivery (additive; the routes/governor/lifecycle from the last round are committed — extend, do not rewrite).',
      '1) RESTART SURVIVABILITY in reconcile() (src/conductor/workspace-service.ts): for workspaces whose tmux session is still LIVE, rebind the run-tailer (startRunTail) so streaming resumes after a backend restart; re-acquire the work-lock (a self-reacquire that does not conflict with itself); for non-terminal workspaces whose session is GONE, read substrate.exitCode and emit a terminal RunEvent + advance the record to a terminal state (finalize crashed orphans) instead of leaving them dangling.',
      '2) If conductor-locks.ts lacks a self-safe re-acquire path, add a rehydrateLock()/reacquire that treats the same workspaceId as the owner (no self-conflict).',
      '3) Wire the steer + per-workspace status routes fully in conductor.routes.ts if the last round left them partial (resolve the substrate handle from the workspace record; steer via substrate send-keys; status via capture + alive + exitCode).',
      'Verify: `cd docker-backend && npx tsc --noEmit 2>&1 | grep -c "error TS"` stays 0; run conductor unit tests `npx vitest run src/conductor/conductor-locks.test.ts src/connectors/gateway.test.ts src/conductor/workspace-lifecycle.test.ts` (paste tail); add a focused no-tmux reconcile unit test if feasible.',
    ].join('\n'),
  },
  {
    key: 'packages',
    path: `${ROOT}/packages`,
    tasks: [
      'Make the BRAIN code-graph REAL (highest-value packages gap: recodergit returns empty graphs today).',
      '1) packages/recodergit/src/repo-indexer.ts: turn the empty-graph envelope into a real indexer that walks the repo, parses TS/JS for symbols + import/require edges, and builds a populated dependencyGraph (+ a basic ownershipMap from CODEOWNERS or path heuristics). Real parsing (use the TypeScript compiler API or a lightweight import-regex pass — your call, but it must produce non-empty real edges).',
      '2) packages/recodergit/src/impact.ts: replace any path passthrough with real graph-reachability impact (given changed paths, return dependent files via the edge graph).',
      '3) packages/brain/src/repo/repo-intel-adapter.ts: make contextPack() actually invoke the indexer (async) so brain context is non-empty.',
      'Verify: `pnpm -F @recoder/recodergit-engine check-types` (or the recodergit package`s own name) and `pnpm -F @recoder/brain check-types` + their test scripts (paste tail). Add a real test proving a small fixture repo yields non-empty dependency edges.',
      'Do NOT attempt the XL @recoder/runtime wiring (out of scope, risky).',
    ].join('\n'),
  },
  {
    key: 'apps',
    path: `${ROOT}/apps`,
    tasks: [
      'Prove the desktop product end-to-end + make dmux discoverable.',
      '1) Add an integration smoke harness for the cockpit: a test that boots the cockpit UI against a STUB conductor backend (a tiny in-test HTTP server you own, returning real-shaped /api/conductor responses) and drives the create -> events -> diff -> terminate flow, asserting the board reflects each state. This is a real integration test (the stub is an external seam, not a mock of the cockpit).',
      '2) Promote dmux to a discoverable surface in the desktop app (menu item / launcher) and document the real product flow in apps/desktop/README or INSTALLATION.',
      'Do not break the existing 56 cockpit tests. Verify: `cd apps/desktop/cockpit && npx tsc --noEmit` (0), `npx vitest run` (paste tail), `node build.mjs`.',
    ].join('\n'),
  },
  {
    key: 'shared',
    path: `${ROOT}/shared`,
    tasks: [
      'Harden the a2a contract validation (the artifacts were rebuilt last round — build on that).',
      '1) Replace the hand-rolled envelope validation in shared/src/a2a with Zod schemas for the TaskEnvelope + payload union, exporting both the schema and the inferred type, keeping the existing validate API backward-compatible (same function name/shape, now Zod-backed).',
      '2) Tighten the loosely-typed payload union.',
      'Rebuild the shipped artifacts so .js/.d.ts match. Verify: `npx tsc --noEmit` (0) and the package test script + a require()/import smoke (paste tail).',
    ].join('\n'),
  },
  {
    key: 'crates',
    path: `${ROOT}/crates`,
    tasks: [
      'SAFE config/seam work only — NO release build (ENOSPC risk on a 199K-LOC crate).',
      '1) Add a production openfang.toml derived from openfang.toml.example with fail-safe behavior documented: missing provider keys must degrade safely with explicit errors (per AGENTS.md), not panic. Do not invent keys.',
      '2) Document the openfang sidecar integration seam honestly (how Recoder TS would spawn/HTTP-call it) in a crates/README or openfang/INTEGRATION.md — describe the real contract; do not fake a running binary.',
      '3) Report the build/runtime-integration as blocked (no binary built; disk + scope) so status stays truthful.',
      'Verify: `cargo check -p openfang` ONLY IF it completes quickly without heavy downloads; otherwise skip and report. Validate the toml parses (e.g. a quick `python3 -c "import tomllib,sys; tomllib.load(open(sys.argv[1],\'rb\'))" <file>`).',
    ].join('\n'),
  },
  {
    key: 'tools',
    path: `${ROOT}/tools`,
    tasks: [
      'Assess + fix the tools tree (it failed the earlier spec pass).',
      'Inventory each tool, identify its language/purpose, and fix any concrete breakage (syntax/type/build errors, broken shebangs, dead references). For each touched tool verify it runs (`--help`/dry-run) or typechecks.',
      'If a tool is genuinely abandoned/empty, report it honestly in remaining[] rather than inventing work. Real fixes only.',
    ].join('\n'),
  },
]

phase('Build')
const results = await parallel(
  TREES.map((t) => () =>
    agent(
      [
        `You are the production-completion engineer for the Recoder tree: ${t.path}`,
        'IMPLEMENT the listed features for real and verify them.',
        '',
        RULES,
        '',
        'YOUR FEATURES THIS ROUND:',
        t.tasks,
        '',
        'Implement now. Depth and correctness over breadth. Return the structured result with honest blocked[]/remaining[].',
      ].join('\n'),
      { label: `build:${t.key}`, phase: 'Build', schema: SCHEMA, effort: 'high' },
    ),
  ),
)

const ok = results.filter(Boolean)
const built = ok.flatMap((r) => (r.implemented || []).map((i) => ({ tree: r.tree, feature: i.feature })))
const failedVerify = ok.filter((r) => r.verify && r.verify.passed === false)
log(`Round 2c: ${built.length} features across ${ok.length} trees; ${failedVerify.length} failed verify`)

return {
  round: '2c',
  implemented: built,
  perTree: ok.map((r) => ({ tree: r.tree, features: (r.implemented || []).length, changed: r.changedFiles.length, verifyPassed: r.verify?.passed, noStub: r.noStub, blocked: r.blocked, remaining: r.remaining })),
}
