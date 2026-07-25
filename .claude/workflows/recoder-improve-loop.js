export const meta = {
  name: 'recoder-improve-loop',
  description: 'Autonomous improvement round: pull top bd-ready issues, fix in parallel with adversarial verify, critic files next round',
  whenToUse: 'Run one self-contained improvement round over the Recoder repo. Each round fixes up to N ready bd issues (desktop/backend/website) and ends with a critic that files the next round of bd issues, so the loop never runs dry. Pass {maxFixes, dimension} via args.',
  phases: [
    { title: 'Pick', detail: 'read bd ready queue' },
    { title: 'Fix', detail: 'parallel fix agents, one per issue' },
    { title: 'Verify', detail: 'adversarial verify per fix' },
    { title: 'Critique', detail: 'completeness critic files next-round bd issues' },
  ],
}

const ROOT = '/Users/arhansubasi/recoder.xyz'
const MAX_FIXES = (args && args.maxFixes) || 3
const DIMENSION = (args && args.dimension) || 'any'

const CONVENTIONS = `Repo conventions: read ${ROOT}/AGENTS.md and (for desktop frontend work) ${ROOT}/apps/desktop/.kilocode/rules/rules.md FIRST and follow them exactly. Backend is source of truth for API shapes — fix frontends to match. Desktop app bin links are broken; use repo-root binaries:
- tsc: ${ROOT}/node_modules/.bin/tsc --noEmit -p ${ROOT}/apps/desktop/app/tsconfig.json
- vitest: cd ${ROOT}/apps/desktop/app && ${ROOT}/node_modules/.bin/vitest run <file>
Never fake success; report exactly what was verified vs not.`

const PICK_SCHEMA = {
  type: 'object',
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'description'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: ['summary', 'filesChanged', 'verification'],
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    verification: { type: 'string' },
    notes: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'issues'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

const CRITIC_SCHEMA = {
  type: 'object',
  required: ['filedIssues', 'observations'],
  properties: {
    filedIssues: { type: 'array', items: { type: 'string' } },
    observations: { type: 'array', items: { type: 'string' } },
  },
}

phase('Pick')
const picked = await agent(`In ${ROOT}, run: bd ready --json
Pick up to ${MAX_FIXES} issues that are concrete, self-contained engineering fixes (skip epics, DEFER items, wisps, and anything needing owner decisions or production access). Dimension filter: ${DIMENSION} (if not "any", prefer issues matching that dimension: ux/backend/architecture/positioning/website).
For each picked issue run: bd show <id> --json  and  bd update <id> --claim --json
Return the picked issues with their full descriptions.`, { label: 'pick', phase: 'Pick', schema: PICK_SCHEMA })

const work = (picked && picked.issues) ? picked.issues.slice(0, MAX_FIXES) : []
log(`picked ${work.length} issues`)

const results = await pipeline(
  work,
  (issue) => agent(`Fix bd issue ${issue.id} in ${ROOT}: ${issue.title}
FULL DESCRIPTION (contains evidence/file pointers): ${issue.description}
Investigate root cause first (read the referenced files and any backend counterparts), apply a minimal correct fix, verify with the narrowest real check (tests if a pattern exists, else typecheck + shape-trace), then run: bd note ${issue.id} "<what you did + verification output summary>"
${CONVENTIONS}`, { label: `fix:${issue.id}`, phase: 'Fix', schema: FIX_SCHEMA }),
  (fix, issue) => {
    if (!fix) { return null }
    return agent(`Adversarially verify (read-only, no edits; you may run tests/typecheck/read commands) this claimed fix for bd issue ${issue.id} in ${ROOT}:
${JSON.stringify(fix)}
Re-derive ground truth from source; try to REFUTE correctness and completeness; check for regressions in adjacent behavior. Default to "fail" with concrete issues when unproven.
If verdict is pass, run: bd close ${issue.id} --reason "Fixed and adversarially verified" --json
If verdict is fail, run: bd note ${issue.id} "VERIFY FAILED: <issues>" (leave the issue open).`, { label: `verify:${issue.id}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      .then((v) => ({ id: issue.id, title: issue.title, fix, verdict: v }))
  }
)

phase('Critique')
const critic = await agent(`Completeness critic for the Recoder improvement loop in ${ROOT}.
This round's results: ${JSON.stringify(results.filter(Boolean).map((r) => ({ id: r.id, title: r.title, verdict: r.verdict && r.verdict.verdict })))}
Your job keeps the loop alive: find the NEXT round of work across dimensions (ux, backend, architecture, positioning, website). Method:
1. For each failed verdict above, the issue stays open — do not refile it.
2. Read ${ROOT}/docs/DESKTOP-UX-STATE-AND-PLAN.md pending/deferred sections and git log -10 for fresh context.
3. Probe ONE under-examined area this round (rotate: run a typecheck or test suite that hasn't run recently, grep for TODO/FIXME in a recently-touched module, or check a doc-vs-code drift).
4. File 2-4 NEW concrete bd issues for real findings: bd create "<title>" -d "<evidence + file pointers>" --json  (skip anything already in bd — check with: bd search "<keywords>" --status all --json -n 5).
Return the ids you filed and your observations.`, { label: 'critic', phase: 'Critique', schema: CRITIC_SCHEMA, effort: 'high' })

return {
  round: { picked: work.map((w) => w.id), results: results.filter(Boolean), critic },
}
