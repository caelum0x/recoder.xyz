# GITHUB module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/engines/recodergit + gh CLI

**Interface:** `analyzeRepo · domainMap · listOpenPullRequests · reviewPR · openPR · comment · search · symbolSearch · findReferences · callGraph · definition · prStatus · health`

**Shipped:** `backend/src/domains/engines/github/` (the `GithubModule` composition + MCP
binders), mounted by the engines domain (`engines-module.ts`). The `gh` facet drives
`gh search repos / pr create / pr comment / pr view+diff` via the bounded `runCli`
seam; the `recodergit` facet drives `analyzeRepo`/`domainMap` through `RecoderGitService`
(flag-gated by `RECODER_CODE_GRAPH_ENABLED`). The previously advertised-but-404
`github.*` (`github.search / github.pr.create / github.pr.comment / github.pr_review`)
and `repo.*` (`repo.read / repo.search / repo.diff`) MCP tools now bind LIVE through the
governed interop host, reachable over the MCP HTTP edge `POST /api/mcp/tools/:server/:tool/call`.

**Shipped (installed-app PR review agents).** Wave can pin one local Git repository
and one or more selected installed runtimes, then start/pause/manually scan a standing open-PR watcher.
The GitHub facet returns each open PR's exact head SHA; agent-os keys the review by
`repo + PR number + head SHA + runtime`, checks canonical workspace metadata before dispatch,
and launches each unseen reviewer/revision once. A new push gets fresh canonical Sessions;
an app/backend restart does not duplicate an already-reviewed SHA. Drafts are
operator-selectable. The agent receives bounded `gh pr view` + `gh pr diff` context
and a review-only instruction. Each independent reviewer ends with a structured,
evidence-required finding block. Each finding carries the nearest qualified
function/class/symbol anchor. Wave groups matching file + symbol + stable defect-class
anchors even when reviewers choose different changed lines; legacy unanchored results
have only a narrow twelve-line fallback. Different symbols never collapse merely because
their wording resembles one another. Wave shows agreement as K/N beside the contributing
runtime names; it does not invent a confidence score. Across adjacent head SHAs, Recoder
uses that same anchored identity plus real `rename from` / `rename to` diff provenance to
project a shifted or renamed defect as new, persisting, or fixed. Fixed is shown only after
every reviewer on the newer revision reports, so a running or unavailable reviewer
cannot manufacture a resolution. Delivery is deliberately human-owned: workspace
metadata records `githubDelivery:'human'`, `reviewOwner:'human'`, and
`autoMerge:false`; the watcher itself never posts, approves, requests changes, or
merges. After reading the canonical Session, a human may explicitly publish a
native Comment / Approve / Request changes review from Wave. The server re-derives
the repository and PR from workspace metadata, applies the existing
`artifact.publish` governance/approval gate, and only then calls `gh pr review`;
the browser cannot retarget the write. Evidence-backed findings prefill the human
review draft and can be individually selected and edited as native inline GitHub
comments. Selected keys are resolved server-side back to the canonical file, changed
line, and reviewed head SHA; Wave cannot supply a different target. The review and
inline comments remain unposted until confirmation. Each published inline comment
also carries an invisible stable finding key. When a defect moved, the current row retains
its previous key as lineage. On refresh, Recoder reads GitHub's
paginated review-thread graph and joins `isResolved` / `isOutdated`, thread URL, and
resolver identity back onto the finding. The Wave rail therefore shows host-authoritative
open, resolved, and outdated state after restarts and later pushes. Each finding headline
also opens the exact file and line at the reviewed head SHA (including GitHub Enterprise
base paths), so evidence navigation cannot drift to the moving branch tip. This is local polling and delivery over the
installed `gh` session—no deployed webhook or production credential is required.

**Shipped (RecoderGit impact in the installed review loop).** `reviewPR` extracts at
most twelve changed symbols and asks RecoderGit for both upstream callers and
downstream dependencies. Each query includes test nodes, stops at depth three,
and limits each depth page. The GitHub module reduces those readings to at most
one hundred reached files and thirty process paths, with risk, minimum depth,
direction, relation type, changed-symbol provenance, and affected-test labels.
The donor engine supplies its full symbol and flow graph when present. The packaged MIT
`@recoder/recodergit` fallback confirms imported calls against declarations and
supplies symbol-level caller/dependency reach without the donor. Unsupported syntax
falls back to file imports. The scanner records executable, server, worker, and
route entrypoints, then assigns reached files to those process paths. It resolves
JSONC `tsconfig`/`jsconfig` `baseUrl`, wildcard `paths`, and inherited
monorepo aliases. The same fallback resolves Python absolute/relative modules,
Go packages from discovered `go.mod` modules, and Rust `mod`/`use` paths across
local crates. Python project roots come from `pyproject.toml`, `setup.cfg`, and
`pyrightconfig.json`. Go applies local `go.mod` and `go.work` replacements. Rust
follows path-attributed modules.
Every ledger records `symbol`, `file`, `mixed`, or `unavailable` scope so a reviewer
can distinguish the two evidence levels.
Agent-os stores that bounded ledger in canonical workspace metadata and gives it
to the reviewer, validator, and finding fixer as untrusted evidence. Conductor
readiness carries the same contract into Review. Wave shows
the changed symbols beside a caller/dependency/test ledger and adds the same
evidence to the editable review draft. An unindexed, absent, truncated, or
partially enriched graph stays visible as unavailable or partial. Review dispatch
continues with the limitation recorded. RecoderGit stores its repo root, indexed
SHA, branch, stats, and availability in canonical installed-app KV. A restarted
backend can report and query the prior index. The packaged graph stores a compact
versioned snapshot beside that state and reuses symbol calls, process nodes,
co-change history, and file edges only when the repository root and source
revision match. RecoderGit mines up to 500 non-merge commits, excludes broad
source rewrites, and returns repeated file pairs with commit count and Jaccard
confidence. The shared review ledger and Wave label those pairs **changed together**.
RecoderGit also registers published package names and unresolved external imports
for npm, Python, Go, and Cargo during each packaged index. It matches a changed provider package
to exact files in other indexed repositories. The review ledger carries canonical
consumer repository IDs, file paths, package names, and import specifiers through
Agent OS, Conductor, and Wave. Tracked or untracked worktree changes force a rebuild.
Conductor resolves the Git origin once when it creates a workspace and stores the
canonical repository ID with compatibility aliases in workspace metadata. PR review
derives the same ID from the GitHub URL. Completion uses the stored ID for reindexing.
If an installed app holds current-analyzer state under a former basename, project
ID, or path-derived key, RecoderGit reads that alias and writes a canonical copy.
The symbol/process/history/package analyzer version rejects older snapshots and rebuilds
them from source once.

**Shipped (repo-scoped review feedback).** Every active finding exposes Accept and
Dismiss in Wave. Decisions persist in the shared installed-app `KvStore` under the
local repository identity using a stable `qualified symbol + defect class` signature
(with the old file signature read for compatibility), so the rule survives line movement,
file renames, and backend restarts. Accepted findings stay visible and feed
bounded priority guidance into later reviewer prompts. Dismissed signatures leave the
active surface, remain available behind a restorable dismissed count, and tell later
reviewers not to repeat the same noise without materially new evidence. The client
submits only a canonical finding key; repo, file, symbol, and rule signature are re-derived on
the server.

**Shipped (finding-to-fix handoff).** Every current, non-dismissed finding exposes a Fix action
in Wave. The backend re-derives the repository, PR, reviewed head SHA, file, line, defect class,
evidence, and validator result from the canonical review workspace. Wave supplies the installed
runtime choice only. Recoder fetches a missing GitHub `refs/pull/:number/head` object without
switching the source checkout, then creates an isolated fix workspace from the exact reviewed
commit. Durable metadata links that workspace to the finding key and human owner. A repeated click
opens the existing attempt; the operator can retry a failed attempt. Wave shows running, ready,
and failed state on the finding row. The Ready action opens the workspace diff for human comparison. The fix agent can
edit and verify inside its worktree, but it cannot push, merge, publish a review, or write to GitHub.

**Shipped (independent finding and intent validator).** Once every selected reviewer in a head-SHA
cohort has returned structured evidence—even when all reviewers report zero findings—the watcher
launches exactly one fresh validator Session on the pinned primary runtime. Reviewer and
validator workspaces are role-isolated and durably deduped by repository, PR, head SHA,
runtime, and role. The validator receives the bounded diff plus the canonical K/N finding
payload as untrusted data, independently inspects repository context, and returns
`confirmed`, `rejected`, or `uncertain` with rationale and concrete evidence for each
canonical key. In the same result it rates the diff against the PR description and
referenced requirements as `aligned`, `partial`, `misaligned`, or `unknown`, with explicit
unmet requirements and out-of-scope changes; missing intent is `unknown`, never guessed.
Wave shows validator progress, validated/total coverage, intent evidence, and per-finding
judgment; review drafts and inline-comment drafts include that evidence. Validation remains
advisory: a rejected result is visibly retained for the human and is never silently deleted
or promoted into an autonomous GitHub write.

**Shipped (canonical linked GitHub requirements).** `reviewPR` extracts only explicit
closing-keyword / Issue / Ticket references and same-repository `/issues/:number` URLs from
the PR body, ignores casual hashes and cross-repository links, and resolves at most five
through the authenticated repository-scoped `gh issue view` boundary. Actual title, body,
state, labels, and URL become untrusted reviewer/validator context and bounded workspace
provenance. Closed state is context, never proof of fulfillment. Private, deleted, or
otherwise inaccessible references remain explicit unavailable evidence instead of failing
the review or being guessed. Wave links each resolved requirement and carries both resolved
and unavailable sources into the editable human review draft.

**Shipped (canonical linked Jira requirements).** Explicit Jira browse URLs,
bracketed keys, and `Jira issue/ticket/story`, `Ticket`, `Story`, `Fixes`, `Closes`,
or `Resolves` references such as `PAY-42` resolve read-only through Jira Cloud REST
v3. Configure `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`; when email is
absent the token is sent as Bearer auth. Summary, flattened ADF description, status,
issue type, priority, labels, and canonical URL become bounded untrusted evidence.
Missing configuration, inaccessible issues, and transport failures remain explicit
unknown requirements, and casual uppercase tokens are ignored.

**Shipped (repository-owned review rules).** A repository can give Recoder bounded,
version-controlled scrutiny criteria. `reviewPR` reads the first existing file in this order:
`.recoder/review-rules.json`, `.recoder/review-rules.md`, then `REVIEW.md`. The JSON format is:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "migration-safety",
      "level": "required",
      "text": "Schema changes require a migration."
    }
  ]
}
```

A JSON rule may also bind to an exact repository-owned check name:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "backend-types",
      "level": "required",
      "text": "Backend changes preserve the type contract.",
      "check": "Backend types"
    }
  ]
}
```

The name must match `.recoder/checks.json` exactly. Recoder runs the named-check
set in the head-pinned review worktree before dispatching the validator and
stores that evidence on the validator workspace. A passing or failing command
is authoritative for the linked rule; missing, duplicate, unavailable, or
errored checks remain `unknown`. The validator model assesses only rules without
`check` and cannot override named-check evidence. A failed required rule becomes
Wave's editable **Request changes** suggestion. When the named check explicitly
opts into `autofix`, the rule row can launch the governed Session continuation;
Recoder's independent post-agent rerun replaces the persisted rule evidence.

Markdown files use explicit rule bullets:

```markdown
- [required] Schema changes require a migration.
- [advisory] Prefer bounded retries around remote calls.
```

Recoder accepts `required` and `advisory` levels, caps the file and rule count, and reports an
invalid first-choice file as unavailable instead of falling through to a weaker source. Reviewers
receive the criteria as untrusted repository data. The independent validator assesses model-judged
rules; Recoder projects `pass`, `fail`, or `unknown` from exact command evidence for linked rules.
Wave shows each result and includes it in the editable human review draft. Both levels remain
human-controlled in the current product: repository
rules cannot grant permissions, override Recoder instructions, bypass governance, or block a merge
without a separate operator-owned policy.

Wave exposes that repository-scoped operator policy as **Off**, **Warn in trust**,
or **Cap trust low**. Only check-backed `required` rules participate. Enabling it
freshly executes each exact named check at merge time and seals the selected mode
plus pass/fail/error/missing outcomes into convergence-evidence v4. `warn` deducts
trust and adds a review flag; `block` also caps trust low. Actual refusal still
follows `RECODER_MERGE_TRUST_GATE`; repository content cannot activate either policy.

Checks may opt into the existing remote sandbox without changing their argv:

```json
{
  "checks": [{
    "name": "Backend types",
    "command": "pnpm",
    "args": ["--dir", "backend", "exec", "tsc", "--noEmit"],
    "execution": "offbox",
    "prepare": { "command": "pnpm", "args": ["install", "--frozen-lockfile"] }
  }]
}
```

The off-box runner clones the origin at the workspace base, applies a bounded
binary base-to-head patch, runs exact preparation/check argv, and destroys the
sandbox. It refuses untracked files, oversized patches, unavailable sandboxes,
and unprovable exit codes instead of falling back locally or checking stale code.

`.recoder/lsp.json` declares versioned stdio language servers:

```json
{
  "version": 1,
  "servers": [{
    "id": "typescript",
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensions": [".ts", ".tsx"]
  }]
}
```

Recoder opens each bounded changed file with base and then head content against
the same project root. `GET /api/conductor/workspaces/:id/diagnostics`, the Checks
payload, and Wave's selected-workspace rail show introduced/resolved diagnostics
while preserving unconfigured, unmatched, failed, empty, and truncated states.

**Shipped (code-graph MCP tools).** The `recodergit` facet now exposes four
real-bound, degrade-truthful code-graph tools over the same governed interop host:
`recodergit.symbol_search` (locate a symbol across the repo), `recodergit.find_references`
(all call/use sites of a symbol), `recodergit.call_graph` (caller/callee edges around a
symbol), and `recodergit.definition` (jump to a symbol's defining site). These drive the
real recodergit engine in place (flag-gated by `RECODER_CODE_GRAPH_ENABLED`); when the
engine is unavailable the facet reports down rather than faking a result.

**Shipped (PR status).** Per-workspace PR status folds in through the conductor domain:
per-repo setup-script run on worktree create, plus `GET /api/conductor/workspaces/:id/pr-status`
(driven by `gh`). The desktop surface is the Wave `recoder-*` shell (NOT the deleted Preact
cockpit): the PR chip renders inside the compare panel `RecoderComparePanel`
(`apps/desktop/app/frontend/app/view/recoder/recoder-compare.tsx:91-98` — `PR #{number} {state}`,
fed by the per-workspace readiness model in `recoder-model.ts`), which the board opens from
`recoder.tsx` (imports it at `recoder-compare.tsx` line 10, renders it at line ~999). The
per-repo setup script remains a backend/conductor feature (worktree-create hook + the
`/api/conductor/workspaces/:id/pr-status` edge); the current Wave shell exposes no dedicated
repo-settings panel.

**Shipped (public agent-facing MCP tools).** Alongside the engine-namespace tools above,
the governed capability surface exposes five public, agent-callable GitHub/repo tools
(registered in `mcp/recoder-capability-tools.cjs`): `recoder_github_pr_create`,
`recoder_github_pr_review`, `recoder_github_search_repos` (find repos by query — complements
the CODE search), `recoder_repo_search` (search code across the repo), and `recoder_repo_diff`.
These are the stable public ids agents invoke; the engine-namespace `github.*` / `repo.*` /
`recodergit.*` verbs above are the internal governed bindings behind them.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. The single `GithubHealth` probe folds both
facets (`gh`, `recodergitLib`): `up` = both available, `degraded` = one, `down` = neither.
Degrade-safe: any engine down → that facet reports down, never fakes success.
See ../RECODER-MODULES.md §GITHUB.
