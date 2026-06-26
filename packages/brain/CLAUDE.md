<!-- recodergit:start -->
# RecoderGit — Code Intelligence

This project is indexed by RecoderGit as **recoder.xyz** (392 symbols, 1003 relationships, 32 execution flows). Use the RecoderGit MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .recodergit/run.cjs analyze` from the project root — it auto-selects an available runner. No `.recodergit/run.cjs` yet? `npx recodergit analyze` (npm 11 crash → `npm i -g recodergit`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `recodergit://repo/recoder.xyz/context` | Codebase overview, check index freshness |
| `recodergit://repo/recoder.xyz/clusters` | All functional areas |
| `recodergit://repo/recoder.xyz/processes` | All execution flows |
| `recodergit://repo/recoder.xyz/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/recodergit/recodergit-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/recodergit/recodergit-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/recodergit/recodergit-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/recodergit/recodergit-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/recodergit/recodergit-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/recodergit/recodergit-cli/SKILL.md` |

<!-- recodergit:end -->