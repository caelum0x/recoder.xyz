export const meta = {
  name: 'recoder-completion-build-r2b',
  description: 'Round 2b: implement the completion features for the trees that did not land in round 2 (ts, go, py, site, docs). Real code, no stubs, verify each.',
  phases: [
    { title: 'Build', detail: 'ts/go/py/site/docs: implement backlog features for real + verify' },
  ],
}

const ROOT = '/Users/arhansubasi/recoder.xyz'

const RULES = [
  'ABSOLUTE RULES (non-negotiable, user-enforced):',
  '- NO stub, NO mock, NO placeholder, NO TODO-as-implementation, NO fake success. Ship real, working code only.',
  '- Never create *.d.ts shims or scratch tsconfigs to dodge a type error. Fix the real cause.',
  '- Stay STRICTLY inside your assigned tree. Do NOT edit other trees or repo-root config.',
  '- Do NOT touch gitignored UPSTREAM CLONES (go/beads, go/ziti vendored core, go/multica, crates upstreams). Only Recoder-authored seams, and only if your guidance says so.',
  '- Do NOT destabilize the PROVEN tmux+worktree conductor driver. Additive completion only.',
  '- Verify every change with a real command and paste actual output. Never claim a pass you did not run.',
  '- If genuinely blocked (missing dep/key/env, disk risk, gitignore), do the safe portion and report the blocker honestly in `blocked`.',
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
          whatChanged: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
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
    key: 'ts',
    path: `${ROOT}/ts`,
    tasks: [
      'Make @recoder/connectors actually consumable + give it a real dispatch half.',
      '1) EXPORT THE CLEAN PER-CHANNEL ADAPTERS from ts/extracted-from-openclaw/src index barrel so the typecheck-clean adapters (telegram + the others that compile) are importable. Do NOT export the known-broken discord adapter (139 errors); leave it out and note it.',
      '2) Implement a CONCRETE EmbeddedRunner backed by the pi-agent (src/agents/embedded-runner.ts is interface-only) — a real runner that takes a normalized inbound message + gate result and produces a reply via the pi coding-agent harness. Gate external SDKs behind the existing optional-peer pattern (install must stay ENOSPC-safe).',
      '3) Add an inbound -> gating -> embedded-agent -> outbound dispatch pipeline (ConnectorRegistry/dispatchInbound) exercised by the existing 13 gating tests + at least one new pure dispatch test.',
      'Verify: per-package `npx tsc --noEmit` (0) and the package test script (paste tail). Rebuild dist if the package ships a build. Stay in ts/extracted-from-openclaw; do not touch the bun/turbo workspaces (open-agents, opencode) this round.',
    ].join('\n'),
  },
  {
    key: 'go',
    path: `${ROOT}/go`,
    tasks: [
      'One safe, high-leverage win only.',
      'Add scripts/build-bd.sh + a Makefile target that builds the `bd` binary reproducibly from go/beads (source .buildflags && go build with CGO + gms_pure_go tag) — the conductor depends on `bd` (docker-backend bundle.ts) but the only working binary is a developer-local install.',
      'Do NOT modify the gitignored upstream clones source. The ziti recoder/ seam is large and absent — DEFER and report in remaining[].',
      'Verify: run the new build script, confirm a `bd` binary is produced (paste version output), or report the exact build blocker honestly.',
    ].join('\n'),
  },
  {
    key: 'py',
    path: `${ROOT}/py`,
    tasks: [
      'work-signals: move persistence off in-memory, honestly.',
      'Refactor storage/workSignalStore.py into a repository Protocol with a Postgres (asyncpg, recoder_backend DB) implementation + migration SQL, keeping the in-memory impl as fallback. Real code matching the existing detector call sites.',
      'A Python env may not be installed (pytest import errors expected). If you cannot run the suite, still write correct code, run a syntax check (`python -c "import ast,sys; [compile(open(f).read(),f,\'exec\') for f in sys.argv[1:]]" <files>`), and report the env blocker honestly. Do NOT fake a passing test run.',
    ].join('\n'),
  },
  {
    key: 'site',
    path: `${ROOT}/site`,
    tasks: [
      'Stop the dead-ends and honesty violations.',
      '1) Add static assets: app/icon (favicon), app/opengraph-image, app/twitter-image.',
      '2) Make the download flow real: wire app/download/page.tsx platform cards/buttons to actual release assets OR a real "notify me" route — never a dead `#`. Verify/remove the brew line if unproven.',
      '3) Replace mailto-only Team/Enterprise CTAs with a real lead-capture route/form.',
      '4) Substantiate or QUALIFY unsupported claims (e.g. the ~41% figure) per the honesty policy.',
      'Verify: the site build/typecheck (paste tail).',
    ].join('\n'),
  },
  {
    key: 'docs',
    path: `${ROOT}/docs`,
    tasks: [
      'Make the docs reflect what is now TRUE.',
      '1) Record the LIVE-AGENT RUN PROOF: a real conductor run drove `claude -p` headless end-to-end (exit 0), created GREETING.md in an isolated worktree, captured the diff, and tore down. Update BUILD-STATUS.md / PRODUCT-PLAN.md to mark the core thesis PROVEN (honest caveat: required clearing a stale ANTHROPIC_API_KEY in a lingering tmux server; the workspace-record terminal-state fix is in progress).',
      '2) Record that the conductor capability routes (/health/full, /resources, /workflows) are now MOUNTED, the resource governor is enforced on createWorkspace, and durable Postgres work-locks now exist in @recoder/coordination.',
      '3) Reconcile the dual-runtime split honestly: the proven tmux driver is canonical; @recoder/runtime is parallel/demoted until wired.',
      '4) Fix factually wrong "done" status and dead links to deleted files. No code.',
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
        'IMPLEMENT the listed incomplete features for real and verify them.',
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
log(`Round 2b: ${built.length} features across ${ok.length} trees; ${failedVerify.length} failed verify`)

return {
  round: '2b',
  implemented: built,
  perTree: ok.map((r) => ({ tree: r.tree, features: (r.implemented || []).length, changed: r.changedFiles.length, verifyPassed: r.verify?.passed, noStub: r.noStub, blocked: r.blocked, remaining: r.remaining })),
}
