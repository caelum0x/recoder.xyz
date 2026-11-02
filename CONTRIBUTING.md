# Contributing to Recoder

Recoder is an open-source, self-hosted desktop app. It runs coding agents (Claude Code, Codex, Cursor, opencode, and the others listed in the README) in parallel git worktrees, then compares diffs and merges one result.

The hosted service at recoder.xyz is retired. Issues and pull requests for this repository are the way to contribute.

## Ways to help

- Fix a bug you can reproduce, with a short note on how you checked it.
- Improve docs that disagree with the code. The README quickstart and [`apps/desktop/BUILD.md`](apps/desktop/BUILD.md) are the source for how the desktop app launches.
- Pick a [good first issue idea](README.md#good-first-issues) from the README roadmap and open it, or open a pull request if the change is small.

## Before you start

For a typo, a broken link, or a narrowly scoped bugfix, open a pull request.

For a new feature, a UI change, or anything that touches many files, open an issue first and wait for a maintainer to agree on the approach. Use the feature request template.

Leave vendored trees alone unless the change is required for the bug you are fixing. That includes `apps/desktop/engines/`, `third_party/`, and the upstream engines under `backend/engines/`. Recoder's own code is MIT; vendored code stays under its original license ([NOTICE](NOTICE)).

## Develop

Follow the [README quickstart](README.md#quickstart). The desktop dev loop is:

```bash
cd apps/desktop
task dev
```

`task dev` is the `electron:dev` alias in `apps/desktop/Taskfile.yml`. It installs workspace dependencies with pnpm, builds the Go server, and runs `electron-vite dev`.

Run the narrowest check that covers your change. Useful root scripts (each exists in the root `package.json`):

- `pnpm run typecheck:desktop` — `tsc --noEmit` in `apps/desktop/app`
- `pnpm run test:desktop` — Vitest in `apps/desktop/app`
- `pnpm run lint:desktop` — ESLint in `apps/desktop/app`

A Go server change belongs with the Task targets in `apps/desktop/Taskfile.yml`. A control-plane change belongs in `backend/` (`pnpm run test:engine` runs `pnpm test` there).

## Pull requests

- One pull request, one change.
- Describe what changed and how you verified it. If you could not run a check, say so.
- Do not commit secrets, `.env` files, `node_modules`, or build outputs.
- Do not add star counts, user counts, or benchmarks that this repo does not measure.

## Issues

- [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml) — what you did, what you expected, and the commit you were on.
- [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml) — the job you want the app to do, and how you would know it works.

Strip API keys and tokens from logs before you paste them.

## License

By contributing, you agree that your changes to Recoder's own code are licensed under the [MIT License](LICENSE). Changes inside a vendored project stay under that project's license.
