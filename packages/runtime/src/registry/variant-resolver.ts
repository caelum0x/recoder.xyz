import type { TaskSpec } from '@recoder/agent-os';
import type { HeadlessMode } from '../contracts/headless-mode';
import { isHeadlessMode } from '../contracts/headless-mode';
import { defaultModeOf, supportsMode, type DriverDescriptor } from './driver-descriptor';

export type VariantResolveInput = {
  descriptor: DriverDescriptor;
  task?: TaskSpec;
  /** Explicit mode request (test/API). */
  requestedMode?: HeadlessMode | string;
};

/**
 * Pick the headless mode variant for a chosen driver. Honors an explicit request when
 * the driver supports it; otherwise reads `TaskSpec.metadata.headlessMode`; otherwise the
 * driver's declared default (first in `modes`).
 */
export function resolveVariant(input: VariantResolveInput): HeadlessMode {
  const requested = input.requestedMode ?? readTaskMode(input.task);
  if (requested && isHeadlessMode(requested) && supportsMode(input.descriptor, requested)) {
    return requested;
  }
  return defaultModeOf(input.descriptor);
}

function readTaskMode(task?: TaskSpec): string | undefined {
  const mode = task?.metadata?.['headlessMode'];
  return typeof mode === 'string' ? mode : undefined;
}
