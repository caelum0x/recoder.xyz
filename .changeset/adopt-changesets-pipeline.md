---
"recoder-terminal": patch
---

Adopt changesets as the changelog/versioning/release pipeline. `.changeset/*.md`
intent files now drive CHANGELOGs, version bumps, `<pkg>@<version>` tags, and
GitHub Releases (the single source for the download page, the electron-updater
feed, the website changelog, and the in-app what's-new surface).
