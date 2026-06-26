# RecoderGit PR Reviewer Swarm (cross-CLI)

A coordinated, **read-only** production-readiness PR review for RecoderGit, runnable from any
AI coding CLI. Seven specialized review personas produce one structured, evidence-grounded
review.

## Single source of truth

All review logic lives here and is shared by every CLI — edit these, not the per-CLI wrappers:

```
pr-swarm-review/
  orchestration.md      # coordinator contract: Swarm vs Solo modes, lanes, classifications, output structure
  personas/             # the 7 canonical persona prompts (role + rules + output sections)
    01-pr-facts-historian.md       (model tier: sonnet)
    02-branch-hygiene-reviewer.md  (model tier: haiku)
    03-risk-architect.md           (model tier: sonnet)
    04-test-ci-verifier.md         (model tier: haiku)
    05-security-boundary-reviewer.md (model tier: sonnet)
    06-docs-dod-reviewer.md        (model tier: sonnet)
    07-synthesis-critic.md         (model tier: sonnet)
  README.md             # this file
```

Per-CLI entrypoints are **thin wrappers** that read the files above at runtime. Only
Claude Code has first-class parallel subagents (**Swarm mode**); every other CLI runs the
same lanes sequentially in one agent (**Solo mode**) with an identical output contract.

## Invoke it from your CLI

| CLI | How to invoke | Adapter file |
|-----|---------------|--------------|
| **Claude Code** | `/recodergit-pr-swarm-review <PR>` (Swarm mode; dispatches the 7 `recodergit-*` subagents) | `.claude/skills/recodergit-pr-swarm-review/SKILL.md` + `.claude/agents/recodergit-*.md` |
| **Gemini CLI** | `/recodergit-pr-swarm-review <PR>` | `.gemini/commands/recodergit-pr-swarm-review.toml` |
| **GitHub Copilot** | `/recodergit-pr-swarm-review` (then paste the PR) | `.github/prompts/recodergit-pr-swarm-review.prompt.md` |
| **Cursor** | `/recodergit-pr-swarm-review` (then paste the PR) | `.cursor/commands/recodergit-pr-swarm-review.md` |
| **Codex CLI** | Ask: "run the RecoderGit PR swarm review for <PR>" (Codex reads `AGENTS.md`) — or install the user-level prompt below | `AGENTS.md` § PR Swarm Review |
| **Any AGENTS.md-aware agent** | Ask it to "follow `pr-swarm-review/orchestration.md` for <PR>" | `AGENTS.md` § PR Swarm Review |

### Codex (optional user-level slash command)

Codex prompts are user-level only (not repo-shareable). To get a `/recodergit-pr-swarm-review`
slash command, create `~/.codex/prompts/recodergit-pr-swarm-review.md`:

```markdown
---
description: RecoderGit production-readiness PR swarm review (Solo mode)
argument-hint: <PR URL or number>
---
Read `pr-swarm-review/orchestration.md` in this repo and run it in **Solo mode** for $ARGUMENTS.
You are single-agent: adopt each persona in `pr-swarm-review/personas/` in dependency order,
then self-critique with lane 7 before emitting the review. Stay read-only.
```

## Key properties

- **Read-only.** No persona edits files, commits, or posts to GitHub. Each enforces an
  explicit permitted/prohibited Bash list.
- **Evidence-grounded.** Every finding cites files, line ranges, checks, issue/PR refs, or commands.
- **Missing visibility becomes verification work** rather than invented facts.
- **Manually invoked.** No hooks or automatic triggers.

## Extending to a new CLI

Add one thin wrapper for the CLI's command/prompt format whose body says: *read
`pr-swarm-review/orchestration.md` and run it (Swarm mode if the runtime has parallel
subagents, else Solo mode)*. Do not copy the persona/orchestration text into the wrapper.

## Relationship to the existing review skill

This coexists with `/recodergit-pr-review` (a single-agent linear checklist using RecoderGit MCP
tools). This swarm is a multi-agent / multi-persona deep production-readiness review.
