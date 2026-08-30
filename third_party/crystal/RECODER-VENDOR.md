# Recoder vendored source — Crystal

**Upstream:** https://github.com/stravu/crystal  
**Snapshot:** v0.3.5, commit `1e18e0bc981225f75b5226f82a300fa741970c6f`  
**License:** MIT (`LICENSE` retained verbatim; upstream notices retained in `NOTICES`)  
**Vendored:** 2026-08-30

## Scope

The complete tracked upstream source is present: Electron main process, React
frontend, shared types, tests, scripts, docs, build assets, screenshots, manifests,
and lockfiles. Only the upstream `.git` database is excluded. The sole source-tree
integration patch appends a narrow allowlist to `.gitignore`, ensuring Recoder's
broader root ignore rules do not silently drop 19 files tracked by Crystal.

## How Recoder uses it

Crystal is a full-source donor for multi-session product behavior, especially:

- durable session and panel persistence;
- progressive Git/worktree status;
- diff-first review and transparent Git command previews;
- conflict-to-agent feedback loops;
- notifications and unread/attention state;
- extensible CLI-agent registration.

Do not start or package Crystal as a second Electron application inside Recoder.
Production ownership remains:

- Wave: windows, blocks, layout, terminal rendering, and desktop input;
- Loom/HERDR: PTYs, panes, native agent detection, runtime restore, and live
  worktree-process state;
- Recoder: workspace identity, governance, memory, review, convergence, evidence,
  and merge truth.

When porting source, preserve the MIT copyright/license notice in the affected file
or its containing distribution notice, and adapt the behavior to these ownership
boundaries rather than introducing a parallel database, PTY manager, or shell.

### Absorbed behavior

- **2026-08-30 — conflict/check feedback loop:** Recoder Review gained an
  “Ask agent to fix” action inspired by Crystal's conflict-to-session workflow.
  The implementation is Recoder-native: canonical readiness probes author the
  blocker packet server-side, workspace ownership is checked at the route, and the
  existing governance/audit path delivers it through live Loom steer or a durable
  follow-up run. No Crystal Git command, database, Electron process, or PTY code is
  executed.

## Refresh

Crystal was deprecated upstream in February 2026 in favor of Nimbalyst. Treat this
snapshot as stable source, not a live upstream dependency. Any future refresh must
record the new commit here, re-run the license audit, and compare behavior before
replacing local ports.
