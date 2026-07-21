/**
 * `pal-route.parity.test.ts` — the drift guard for critic fix 1. The inference
 * domain re-declares pal's two string unions LOCALLY (`RouteRisk` /
 * `RouteModelCategory`) so it takes no direct pal-engine-package import (§7 grep
 * gate). This test pins those local copies to the engines-owned facet's
 * `PalRouteDecision` fields — which ARE the pal engine's `RiskLevel` /
 * `ToolModelCategory` — via a COMPILE-TIME mutual-assignability assertion. If pal
 * ever adds/renames/removes a member and the local mirror is not updated in
 * lockstep, `tsc` fails here.
 *
 * The comparison is intentionally against the facet type (not the pal engine
 * package directly) so this file stays inside the inference domain WITHOUT
 * importing the engine — the same discipline the domain enforces everywhere else.
 */
import { describe, it, expect } from 'vitest';
import type { PalRouteDecision } from '../../engines/ports/pal-brain.port.js';
import type { RouteRisk, RouteModelCategory } from './pal-route.port.js';

/** `true` only when `A` is assignable to `B`; a compile error otherwise. */
type AssertAssignable<A extends B, B> = true;

// Both directions ⇒ the two unions have IDENTICAL member sets. Any drift (added,
// renamed, or removed member on either side) makes one of these fail to compile.
type RiskParity = AssertAssignable<RouteRisk, PalRouteDecision['risk']> &
  AssertAssignable<PalRouteDecision['risk'], RouteRisk>;
type CategoryParity = AssertAssignable<RouteModelCategory, PalRouteDecision['category']> &
  AssertAssignable<PalRouteDecision['category'], RouteModelCategory>;

const RISK_PARITY: RiskParity = true;
const CATEGORY_PARITY: CategoryParity = true;

describe('inference RouteRisk/RouteModelCategory parity with the pal facet unions', () => {
  it('the local mirrors are member-identical to the facet decision types', () => {
    // The real assertion is at the type level above; these keep vitest honest.
    expect(RISK_PARITY).toBe(true);
    expect(CATEGORY_PARITY).toBe(true);
  });
});
