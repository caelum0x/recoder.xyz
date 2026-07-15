/**
 * `napi-kernel.adapter` — the in-process native kernel rung. It loads the
 * `recoder-governance-napi` `.node` addon (in-proc, sync, zero-IPC) by letting
 * `@recoder/governance`'s facade do the arch/path-aware native load, then probes
 * `hasNapiKernel()`. When the addon is present for this platform the adapter is
 * returned (engine `napi`, verdicts non-degraded); when it is ABSENT the factory
 * returns `undefined` so the ladder degrades to the daemon rung.
 *
 * DEGRADE-SAFE: construction never throws for a missing/broken addon — a load
 * failure simply yields `undefined` (the reuse contract of the package's own
 * degrade-safe napi loader). The crate is never built here.
 */
import { Governance } from '@recoder/governance';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import { GovernanceBackedKernel } from './governance-kernel.js';

/**
 * Try to build the in-proc napi kernel rung. Returns `undefined` when the native
 * addon is not loadable for this arch/platform (degrade to daemon → ts).
 *
 * @param opts.napiEnabled when false, the rung is skipped outright (config gate).
 */
export async function createNapiKernelAdapter(opts: {
  napiEnabled: boolean;
  auditEnabled: boolean;
}): Promise<GovernanceKernelPort | undefined> {
  if (!opts.napiEnabled) return undefined;
  try {
    const gov = await Governance.create({ auditEnabled: opts.auditEnabled });
    // Feature-detect the native in-proc kernel. The `@recoder/governance` facade
    // only exposes it in builds shipped with the `recoder-governance-napi` addon;
    // this build has no such method, so the probe is `undefined` and we degrade to
    // the daemon → ts rungs (truthful: napi absent, never a faked native path). A
    // future package version that adds `hasNapiKernel()` re-enables this rung with
    // no further change here.
    const probe = gov as unknown as { hasNapiKernel?: () => boolean };
    if (typeof probe.hasNapiKernel !== 'function' || !probe.hasNapiKernel()) {
      // No native addon on this platform/build — release it and degrade to the daemon.
      gov.close();
      return undefined;
    }
    return new GovernanceBackedKernel(gov, 'napi', 'in-process recoder-governance-napi kernel');
  } catch {
    // A native-load / construction fault must never throw at ladder assembly.
    return undefined;
  }
}
