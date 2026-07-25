# Changesets

This monorepo uses [changesets](https://github.com/changesets/changesets) (MIT) for
versioning, changelogs, tags, and GitHub Releases (bd `recoder-7byt`, report #8 in
`docs/research/OSS-ADOPTION-2026-07.md`).

How it works here:

- Every user-visible change lands with an intent file in this directory
  (`pnpm changeset` generates one: pick the touched packages + bump level + summary).
- On merge to `main`, the release workflow
  (`.github/workflows.disabled/release-changesets.yml` — move to `.github/workflows/`
  to activate) opens/updates a **"Version Packages"** PR that consumes the intent
  files into per-package `CHANGELOG.md`s and version bumps.
- Merging that PR tags each released package (`<name>@<version>`) and creates
  **GitHub Releases**. Those Releases are the single source read by the Hazel
  `/download` endpoints, the electron-updater feed, the website changelog page,
  and the in-app what's-new popover.

Notes:

- All packages here are private; `privatePackages: { version, tag }` means changesets
  versions and tags them without ever publishing to npm.
- `recoder-terminal@*` tags additionally trigger the Desktop Release build
  (`desktop-release.yml`).

Common commands:

```bash
pnpm changeset            # add an intent file for your change
pnpm changeset:status     # see pending releases
pnpm version-packages     # (CI does this) consume changesets -> bumps + CHANGELOGs
pnpm release:tag          # (CI does this) tag released packages
```
