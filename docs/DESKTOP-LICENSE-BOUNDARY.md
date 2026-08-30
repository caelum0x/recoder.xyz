# Desktop distribution license boundary

The paid Recoder desktop distribution does not contain the PolyForm-licensed RecoderGit donor or the restricted-Apache Multica donor. Both repositories remain available as source donors in the monorepo; neither is an Electron packaging input.

## Boundary

| Donor             | Source location                       | Restriction                                                  | Distribution rule                                                                                             |
| ----------------- | ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| RecoderGit engine | `apps/desktop/engines/recodergit`     | PolyForm Noncommercial 1.0.0                                 | Never package `@recoder/recodergit-engine`. The independent MIT `packages/recodergit` replacement is allowed. |
| Multica           | `apps/desktop/server/engines/multica` | Modified Apache 2.0; commercial embedding requires a license | Never package its source, binaries, package material, or Go module dependency.                                |

The release gate in `apps/desktop/app/build/assert-license-boundary.cjs` runs twice:

1. `beforePack` rejects an Electron `files` or `extraResources` source that is inside either donor root, or broad enough to contain one.
2. `afterPack` scans every file, package manifest, path, and symlink in the completed resources tree. It rejects donor paths, package identity, full license fingerprints, required notices, and the Multica Go module marker embedded by Go linkage.

The artifact scan deliberately permits `@recoder/recodergit`, the MIT Recoder-owned implementation in `packages/recodergit`. Its package identity is distinct from the restricted `@recoder/recodergit-engine` donor.

## Release evidence

Every Electron package produces `apps/desktop/app/make/license-boundary-<platform>-<arch>.json`. The evidence records:

- the packaging inputs checked against both donor roots;
- total files and bytes scanned in the final resources tree;
- the exact restricted identities and module marker enforced;
- SHA-256 provenance for every packaged `recoder-server` binary;
- a negative Multica module-linkage result.

The release script requires this evidence before signing or publishing. Published release directories and CI artifacts retain a copy alongside the DMG and updater files.

Focused verification:

```bash
pnpm -C apps/desktop/app exec vitest run tests/assert-license-boundary.test.ts tests/packaging-config.test.ts tests/assert-extra-resources.test.ts
bash scripts/release-desktop.sh dry-run
```

For an already-built app, invoke `assertRestrictedEnginesAbsentFromArtifact` against its `Contents/Resources` directory. A passing scan is artifact-specific; changing or rebuilding the app requires new evidence.
