#!/usr/bin/env node
/**
 * Guarded post-build IndexNow ping (degrade-safe wrapper around
 * `scripts/ping-indexnow.mjs`).
 *
 * Wired as the `postbuild` npm lifecycle script, so it runs automatically after
 * `pnpm build`. Two hard guarantees make that safe:
 *
 *  1. OFF BY DEFAULT. It only pings when `INDEXNOW_ON_BUILD=1` is set in the
 *     environment. This matters because `build` also runs inside the Docker
 *     image build and in CI — contexts where the site is NOT yet live and a
 *     ping would notify search engines about stale/undeployed content. The
 *     deploy host sets `INDEXNOW_ON_BUILD=1` only for a real production build
 *     whose output goes live, so "only run when a submission is meaningful".
 *
 *  2. NEVER FAILS THE BUILD. `ping-indexnow.mjs` exits non-zero on an IndexNow
 *     error (truthful for a standalone run), but here any failure is logged and
 *     swallowed — this wrapper always exits 0 so an IndexNow hiccup can never
 *     break a deploy.
 *
 * The underlying ping reads the LIVE sitemap and submits every URL, so it must
 * run AFTER the new build is live (a full deploy re-pings everything). For the
 * direct-`next build` / Docker deploy paths that bypass npm lifecycle scripts,
 * run `pnpm seo:indexnow` as an explicit post-deploy step instead (see
 * docs/growth/SEARCH-SUBMISSION-RUNBOOK.md §4).
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gate = (process.env.INDEXNOW_ON_BUILD || '').trim();
if (gate !== '1') {
  console.log(
    '[indexnow] postbuild ping skipped — set INDEXNOW_ON_BUILD=1 on the deploy host to enable (safe by default in dev/CI/Docker builds).',
  );
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const pingScript = join(here, 'ping-indexnow.mjs');

const child = spawn(process.execPath, [pingScript], { stdio: 'inherit' });

child.on('exit', (code) => {
  if (code !== 0) {
    console.warn(
      `[indexnow] postbuild ping did not succeed (exit ${code}); build is unaffected.`,
    );
  }
  // Degrade-safe: never fail the build on an IndexNow error.
  process.exit(0);
});

child.on('error', (error) => {
  console.warn(
    `[indexnow] postbuild ping could not start: ${error?.message || error}; build is unaffected.`,
  );
  process.exit(0);
});
