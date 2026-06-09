import type { OSSComponentDescriptor, OSSPatchPolicy } from './descriptor';

export type PatchPolicyFinding = {
  componentId: string;
  policy: OSSPatchPolicy;
  requiresReview: boolean;
  reason: string;
};

export function evaluatePatchPolicy(component: OSSComponentDescriptor): PatchPolicyFinding {
  const requiresReview = component.patchPolicy === 'vendored' || component.patchPolicy === 'forked';
  return {
    componentId: component.id,
    policy: component.patchPolicy,
    requiresReview,
    reason: requiresReview
      ? 'Vendored/forked OSS must carry patch provenance and update policy.'
      : 'Component is referenced or locally patched without ownership of upstream state.',
  };
}
