# Recoder — Lessons (recurring patterns + corrections)

Durable gotchas worth not re-learning. Keep terse; link the bd issue / doc where the
full recipe lives.

## Release / desktop build (see docs/OWNER-RUNBOOK.md §1)
- **`hdiutil create -srcfolder` fails EPERM** under a restricted (no Full-Disk-Access)
  shell — it mounts a temp volume it can't write. Use `hdiutil makehybrid -hfs … |
  hdiutil convert -format UDZO` (no mount) instead.
- **better-sqlite3 needs the Electron ABI**, not Node's. `prebuild-install` bundles a
  stale `node-abi` that doesn't know Electron 41 (ABI 145). Direct-download the
  `…-electron-v145-darwin-arm64.tar.gz` prebuild and swap it into the deploy tree.
  Verify: it must FAIL `require()` under plain Node.
- **node-pty `spawn-helper` is extensionless + no exec bit** → missed by the codesign
  Mach-O sweep → notarization REJECTED. Sign it explicitly before the inside-out sweep.
- **`pnpm --filter=<pkg> deploy --prod --legacy`** from repo ROOT (not the dir) or you
  get `ERR_PNPM_NOTHING_TO_DEPLOY`. Its final `_linkBins` `EACCES /Users/tmp` is
  cosmetic (`.bin` shims only) — electron-builder copies just `node_modules`.
- **Remove the dangling `backend/node_modules/recoder-backend` self-symlink** before
  codesign (deep-verify ENOENT).
- **Notarization runs ~40 min**; staple both the dmg AND the .app.

## Prod topology (see docs/PLAN.md, memory project_prod_website_deploy)
- `/` and `/download` are served by the **active systemd `recoder-site` on :3012**
  (`/srv/recoder-site`, NOT a git checkout), not the pm2 `recoder-app` (:3000). Two
  things named "recoder-site" exist (stopped pm2 vs active systemd) — don't conflate.
- `NEXT_PUBLIC_*` bake at BUILD time; flipping `/download` public needs a rebuild with
  `NEXT_PUBLIC_DOWNLOAD_MACOS_URL` + keep `SITE_ASSET_PREFIX=/__site`; then
  `systemctl restart recoder-site`. Back up `.next` → `.next.rollback` first.

## Docs drift (patterns to grep before trusting a status doc)
- Version/status drift: docs claim "planned/not built/inert" for shipped things.
  Re-verify against code, not the doc's own ✅.
- Stale file:line and renamed modules: `conductor/governance-gate.ts` →
  `domains/governance/services/governance-gate.service.ts` (`decide()`, not
  `decideDelivery()`); SESSION_PREFIX → `conductor/session-naming.ts`.
- `apps/social` folded into the backend social domain; only `apps/desktop` remains.
- recodergit is **not** bundled (PolyForm-Noncommercial, bd `recoder-rxn0`).

## Method
- Fan out read-only subagents for investigation; **adversarially verify findings**
  before acting (the "same model writes and reviews" blind spot is real).
- Only claim done with a verification artifact. beads is the shared memory — recall
  before re-deriving, note evidence as you go.
