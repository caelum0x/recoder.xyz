---
"recoder-terminal": patch
---

Adopt changesets as the changelog/versioning runbook. `.changeset/*.md` intent
files drive CHANGELOGs, version bumps, and `<pkg>@<version>` tags — run MANUALLY
(`pnpm changeset` → `pnpm version-packages` → `pnpm release:tag`). This repo runs
NO CI by design (no GitHub premium; the release-changesets workflow is kept in
`.github/workflows.disabled/`), so there is no automated consumer: versioning and
release are a deliberate manual pnpm runbook, and the download page / electron-updater
feed / website changelog are populated by the manual deploy process (see
docs/Prod Website Deploy), NOT by automated GitHub Releases.
