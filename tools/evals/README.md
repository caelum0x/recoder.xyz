# Eval Gate

`tools/evals` contains quality gate inputs used by CI and local release checks.

Files:
- `thresholds.json`: per-metric gate rules (`min` or `max`).
- `latest.json`: latest measured metrics snapshot.
- `cases.json`: benchmark case definitions (shell commands, including regression tests).

Run locally:

```bash
pnpm run eval:harness
pnpm run check:eval-gate
pnpm run eval:composer-prepare -- --inbox-dir tools/evals/composer/inbox --sample tools/evals/composer/sample-results.json --output tools/evals/composer/results/latest-results.json
pnpm run eval:composer-score -- --dataset tools/evals/composer/dataset.json --results tools/evals/composer/results/latest-results.json --output tools/evals/composer/latest.json --min-pass-rate 1 --strict
```

Override paths:

```bash
node scripts/check-eval-gate.js --thresholds tools/evals/thresholds.json --report tools/evals/latest.json
```

Current real workload coverage:
- `recoder-web` copy-route regression tests
- `recoder-web` message parser action regression tests
- Composer regression dataset scoring (`tools/evals/composer/*`)

Composer results ingestion:
- Put Claude/Composer JSON outputs in `tools/evals/composer/inbox/`.
- Supported file shapes:
  - `{ "id": "...", "changes": [...] }`
  - `{ "cases": [ ... ] }`
- The prepare step writes normalized merged output to:
  - `tools/evals/composer/results/latest-results.json`
- To enforce real Composer outputs (no sample fallback):
  - `pnpm run eval:composer-prepare -- --inbox-dir tools/evals/composer/inbox --output tools/evals/composer/results/latest-results.json --require-inbox`
  - `pnpm run check:composer-inbox -- --inbox-dir tools/evals/composer/inbox --min-files 1`

CI strictness toggle:
- `COMPOSER_REQUIRE_INBOX=false` (default): allows sample fallback if inbox empty.
- `COMPOSER_REQUIRE_INBOX=true`: requires real Composer inbox artifacts and fails otherwise.
