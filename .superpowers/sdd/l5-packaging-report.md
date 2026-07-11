# L5 NAPI Native Addon Packaging Report

## What Was Wired

### 1. extraResources (apps/desktop/package.json)

Two entries added to the `build.extraResources` array:

```json
{
  "from": "../../crates/recoder-governance/target/release/recoder-governance-napi.node",
  "to": "native/recoder-governance-napi.node"
},
{
  "from": "../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
  "to": "native/lance_npm_bindings.node"
}
```

Both `.node` files land under `Resources/native/` in the packaged app (macOS: `Recoder.app/Contents/Resources/native/`; win32/linux: `resources/native/`). They are outside `app.asar` by design — native addons cannot be `require()`d from inside an asar archive and do not need `asarUnpack` because they are already in `extraResources` (the file-system Resources dir).

### 2. napi:build script (apps/desktop/package.json + apps/desktop/scripts/napi-build.js)

A `"napi:build": "node scripts/napi-build.js"` script was added. The script:
- Checks for `cargo` in PATH; skips with a warning if absent.
- Respects `NAPI_SKIP_BUILD=1` to bypass all builds (useful for CI that pre-builds).
- Builds `recoder-governance-napi` and `lance-npm-bindings` with `cargo build --release`.
- Skips any crate whose directory is missing (disk-deferred crates: tensorzero, openfang, claw-code-parity are NOT listed).
- **Always exits 0** — a build failure degrades to the committed pre-built `.node` rather than blocking the installer build.

### 3. before-build.js hook

`buildNapiAddons()` function added and called from `exports.default`. It:
- Runs `node scripts/napi-build.js` via `runIn(__dirname, ...)`.
- Catches all errors and logs a warning (non-fatal); the build continues.
- Logs presence/absence of each committed `.node` source file so regressions are visible.

### 4. after-pack.js — Invariant 6 (soft)

A soft invariant checks whether `Resources/native/recoder-governance-napi.node` and `Resources/native/lance_npm_bindings.node` landed in the packaged output. Issues `console.warn` (not `fail()`) so a disk-constrained CI host that cannot build the Rust crates still produces a working installer (degraded to TS fallback / @lancedb SDK fallback).

### 5. Loader path resolution — packages/governance/src/napi/napi-loader.ts

`buildCandidatePaths()` extended with priority order:

1. `RECODER_NATIVE_DIR` env var + `recoder-governance-napi.node`
2. `process.resourcesPath + /native/recoder-governance-napi.node` (Electron packaged path)
3. `__dirname` → up 5 levels → workspace root → `crates/recoder-governance/target/release/` (dev path, no hardcoded home dir)
4. Co-located `recoder-governance-napi.node` (production deploy artifact fallback)

Candidates are built inside `tryLoadNapiModule()` (not at module load time) so `process.resourcesPath` and `RECODER_NATIVE_DIR` are evaluated after Electron bootstrap.

### 6. Loader path resolution — packages/rag/src/vector-store/lance-client.ts

Same priority order via `buildLanceCandidatePaths()`:

1. `RECODER_NATIVE_DIR` + `lance_npm_bindings.node`
2. `process.resourcesPath + /native/lance_npm_bindings.node`
3. `__dirname` → workspace root → `crates/lance/npm-bindings/target/release/`
4. Co-located `lance-npm-bindings.node`

Candidates built inside `tryLoadNativeAddon()` (lazy, not module-level).

## How It's Degrade-Safe

| Scenario | Behavior |
|----------|----------|
| Rust toolchain absent | `napi-build.js` logs warning, exits 0; committed pre-built `.node` used |
| `.node` not present at extraResources source path | electron-builder silently omits the file; after-pack warns but doesn't fail |
| `.node` absent in packaged app at runtime | loader tries next candidate; returns `undefined`/`null`; caller degrades to TS path or @lancedb SDK |
| `process.resourcesPath` absent (dev mode) | resourcesPath branch skipped; `__dirname`-derived dev path tried instead |
| `RECODER_NATIVE_DIR` not set | branch skipped; next candidates tried |

## Config Validation Result

```
node -e "require('./package.json')"  →  OK (no output, exit 0)
npm run lint:syntax                  →  OK (all --check passes)
npm test                             →  96 passed / 3 pre-existing failures (backend-supervisor port tests unrelated to NAPI; verified same failures exist on the baseline branch)
napi-loader-paths.test.js           →  10/10 PASS (new test)
```

## Commit Hash

TBD — commit staged immediately after this report is written.

## What's Left for a Real Signed-Installer Build

1. **Run `electron-builder --mac` (or `--win`/`--linux`)**: The actual multi-GB DMG/NSIS/AppImage build. Not done here due to ~10 GB free disk (ENOSPC risk).
2. **Build 3 deferred `.node` crates** once disk is freed:
   - `crates/tensorzero` → `tensorzero-napi.node`
   - `crates/openfang` → `openfang.node`
   - `crates/claw-code-parity` → `claw-code-parity.node`
   Add their `extraResources` entries and loader candidates following the same pattern.
3. **Cross-arch builds** (Apple Silicon + Intel): NAPI addons are arch-specific; CI matrix must build each arch's `.node` separately and place them in the `extraResources` source paths before packaging.
4. **Codesigning entitlements for `.node` files**: macOS requires all executables/dylibs inside the bundle to be signed with the app's entitlements. Verify the `--hardened-runtime` + `--entitlements` flags in `entitlements.mac.plist` cover the native addons.
5. **Notarization**: `notarize.js` already exists; verify it runs after the `.node` files are bundled.
