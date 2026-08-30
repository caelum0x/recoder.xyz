# Recoder Desktop — Release Runbook

The macOS Apple-Silicon **signed + notarized DMG** release pipeline for the
Recoder desktop app (`apps/desktop`). This is the Recoder-native pipeline that
replaces the inherited upstream Wave Terminal workflow described in
[`apps/desktop/RELEASES.md`](apps/desktop/RELEASES.md) (which points at
wavetermdev S3/DigiCert infra and does **not** apply here).

**Platform today:** macOS Apple Silicon (`arm64`) only. `x64`/`universal` and
Windows/Linux are staged but inert until per-platform native artifacts exist —
see [`docs/DESKTOP-CROSS-PLATFORM.md`](docs/DESKTOP-CROSS-PLATFORM.md).

**Release only from `main`** (bd `recoder-mhyt`). Tags: `vX.Y.Z` or `vX.Y.Z-beta.N`.

---

## One command

The whole sequence lives in one orchestrator — the same script CI and a human
both run, so local and CI releases are the identical pipeline:

```bash
# Headless, no certs, no build — validate the pipeline is structurally sound:
scripts/release-desktop.sh dry-run
#   (also: make release-dry  /  pnpm run release:desktop:dry)

# Full signed release on a Mac with certs in the env (see secret table below):
scripts/release-desktop.sh release --bump patch --publish
#   (also: make release)
```

### What `release` does, in order

| Step | Tool | Detail |
|---|---|---|
| 1. version bump | `apps/desktop/app/version.cjs` | `--bump patch\|minor\|major\|prerelease\|none` |
| 2. readiness | `scripts/check-desktop-release-readiness.sh` | macOS tools + Developer ID + creds present |
| 3. pack (unsigned) | `electron-builder` via `task package` | Apple creds are **scrubbed** from this child env on purpose (see landmine) |
| 4. sign | `scripts/sign-desktop-inside-out.sh` | native `codesign`, inside-out |
| 5. dmg + sign dmg | `hdiutil` + `codesign` | `Recoder-arm64.dmg` |
| 6. notarize + staple | `xcrun notarytool` + `stapler` | waits for Apple, staples the ticket |
| 7. verify | `scripts/publish-desktop-release-local.sh verify` | `codesign --deep --strict`, `stapler validate`, `spctl` |
| 8. publish (opt) | `scripts/publish-desktop-release-local.sh publish` | assembles `dist/desktop-release/` + regenerates `latest-mac.yml` |

> **Landmine — why unsigned-pack-then-native-sign, not electron-builder's own signer:**
> the packed `.app` bundles the backend's self-contained `node_modules`
> (~2.1G, ~139K files), so `@electron/osx-sign` opens more file descriptors than
> the kernel per-process cap (`kern.maxfilesperproc`, non-root-raisable) and dies
> with `EMFILE`. Native `codesign` (few fds per call) signs it fine **inside-out**.
> Full rationale: [`docs/OWNER-RUNBOOK.md`](docs/OWNER-RUNBOOK.md) §1.

---

## Signing / notarization is env-gated — NO secret is ever committed

`apps/desktop/app/electron-builder.config.cjs` and `scripts/release-desktop.sh`
both auto-enable `hardenedRuntime + notarize` **only when Apple creds are present
in the environment**. A keyless machine produces a plain unsigned dev build — it
never half-configures a notarize that would fail. Certs/keys live in the login
keychain and the environment (locally) or GitHub Actions secrets (CI) only.

### Secrets the owner must supply

Seed the GitHub Actions secrets once from a local `.env.desktop-release`
(template: `.env.desktop-release.example`):

```bash
cp .env.desktop-release.example .env.desktop-release   # then fill values
pnpm run set:desktop-release-secrets -- --from-env-file .env.desktop-release --write
```

| GitHub secret (`DESKTOP_*`) | Maps to env | What it is | How to obtain |
|---|---|---|---|
| `DESKTOP_CSC_LINK` | `CSC_LINK` | base64 of the **Developer ID Application** `.p12` (cert + private key) | Apple Developer → Certificates → *Developer ID Application*; export from Keychain as `.p12`, then `base64 -i cert.p12` |
| `DESKTOP_CSC_KEY_PASSWORD` | `CSC_KEY_PASSWORD` | password protecting that `.p12` | set when you export the `.p12` |
| `DESKTOP_APPLE_ID` | `APPLE_ID` | Apple ID email used for notarization | your Apple Developer account email |
| `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID | appleid.apple.com → Sign-In & Security → App-Specific Passwords |
| `DESKTOP_APPLE_TEAM_ID` | `APPLE_TEAM_ID` | 10-char Apple Developer Team ID | Apple Developer → Membership |

**Alternative to the Apple-ID trio** (preferred for CI stability): an App Store
Connect **API key**. Set these in the environment instead of `APPLE_ID`/…:

| Env var | What it is |
|---|---|
| `APPLE_API_KEY` | path to the `AuthKey_XXXX.p8` file |
| `APPLE_API_KEY_ID` | the key ID |
| `APPLE_API_ISSUER` | the issuer UUID |

### Other env the owner may set

| Env var | Purpose |
|---|---|
| `RECODER_SIGN_ID` | Developer ID Application identity name in the keychain (defaults to the owner's identity; override for a different signer) |
| `RECODER_BACKEND_NODE_MODULES` | path to a **self-contained** backend `node_modules` (via `pnpm deploy --prod`) so the bundle's symlinks resolve inside the `.app` — **required** for a signed build |
| `RECODER_MAC_ARCH` | `arm64` (default) / `x64` / `universal` — only change once cross-built natives exist (runbook §1b) |

### Provision remote Loom transport

The arm64 app bundles the pinned Apache-2.0 `cloudflared` connector. Create a
remotely managed named tunnel in the Recoder Cloudflare account, route one
`<device>.remote.recoder.xyz` hostname to it, then provision the Mac without
placing the tunnel token in argv or the signed app:

```bash
scripts/provision-desktop-remote-tunnel.sh https://<device>.remote.recoder.xyz
```

Paste the named-tunnel token when prompted and restart Recoder. The script writes
mode `0600` files below `~/Library/Application Support/Recoder/remote-tunnel/`;
the connector is outbound-only, disables self-update, and automatically follows
Electron's current loopback backend port. The Remote access panel must say
`Connected` before its receiver link is shared. `RECODER_REMOTE_TUNNEL_MODE=quick`
is an explicit development-only escape hatch and is rejected by packaged apps.

Set `RECODER_REMOTE_ALLOWED_ORIGINS` on the hosted Next app only for exact HTTPS
origins outside the default `*.remote.recoder.xyz` namespace. The receiver rejects
arbitrary origins before forwarding signed-in credentials.

No cert or key is stored in the repo. `git`-check any release commit:
`git grep -nE 'BEGIN (RSA |EC )?PRIVATE KEY|APPLE_.*=.+|CSC_.*=.+'` should return nothing.

---

## CI — GitHub Actions

[`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml):

- **`validate`** job (Linux, no certs) runs on every trigger: desktop typecheck,
  artifact-independent packaging-config tests, and `release-desktop.sh dry-run`.
  It is intentionally clean-checkout safe: required native artifact existence is
  tested with fixtures here and enforced against real paths by `beforePack` only
  after the macOS build job creates those artifacts.
- **`build-sign-notarize`** job (macOS `arm64` runner) runs on a `v*` tag push or
  an explicit non-dry-run manual dispatch: builds engines/server, stages the
  self-contained backend `node_modules`, imports the signing cert into a
  throwaway keychain, then runs `scripts/release-desktop.sh release --publish`
  and uploads the signed DMG + release dir as an artifact.

Trigger a release:

```bash
git tag v0.16.3 && git push origin v0.16.3       # tag push → full signed build
# or: Actions → Desktop Release → Run workflow (dry-run=false, publish=true)
```

---

## Hosting the artifacts (auto-update feed)

The app auto-updates from `https://dl.recoder.xyz/releases` (the `generic`
`publish` feed in the electron-builder config; `electron-updater` polls
`latest-mac.yml`). `--publish` assembles `dist/desktop-release/`; upload it:

```bash
rsync -avz --progress dist/desktop-release/ <user>@<host>:/srv/dl.recoder.xyz/releases/
curl -fsI https://dl.recoder.xyz/releases/Recoder-<version>-arm64.dmg   # expect 200
curl -fs  https://dl.recoder.xyz/releases/latest-mac.yml                # expect version
```

The website `/download` page stays private-beta until
`NEXT_PUBLIC_RELEASE_VISIBILITY=public`. See `publish-desktop-release-local.sh`
output for the exact site env to wire.

---

## After a release

- Human end-to-end boot of the installed DMG: sign in, create a workspace on a
  real repo, run an agent in a worktree, review the diff, merge.
- Related open gates: `recoder-fi6w` (release operation gate) and `recoder-a7ut`
  (CI). Canonical-trunk gate `recoder-mhyt` landed on `main` at `ffbda52cb` on
  2026-08-31. Hosted-plane integrity gate
  `recoder-5iqy` was closed 2026-08-17 after the deletion was traced to the local
  v3 monitor glob, coreutils was restored, and `dpkg -V` was clean. See
  [`docs/OPEN-BEADS.md`](docs/OPEN-BEADS.md).
