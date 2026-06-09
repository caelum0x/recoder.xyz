import type { RecoderComponentDescriptor } from './descriptor';

export type RecoderComponentFinding = {
  componentId: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
};

export function validateRecoderComponent(component: RecoderComponentDescriptor): RecoderComponentFinding[] {
  const findings: RecoderComponentFinding[] = [];

  if (!component.owner) {
    findings.push({
      componentId: component.id,
      severity: 'warning',
      message: 'Component owner is not declared.',
    });
  }

  if (!component.location.path && !component.location.repo && !component.location.packageName && !component.location.dockerImage && !component.location.externalUrl) {
    findings.push({
      componentId: component.id,
      severity: 'error',
      message: 'Component has no declared location.',
    });
  }

  if (component.security.canTouchProduction && !component.security.requiresAuth) {
    findings.push({
      componentId: component.id,
      severity: 'error',
      message: 'Production-capable components must require auth.',
    });
  }

  if (component.security.handlesSecrets && !component.security.requiresAuth) {
    findings.push({
      componentId: component.id,
      severity: 'error',
      message: 'Secret-handling components must require auth.',
    });
  }

  return findings;
}

export function componentOwnsCanonicalState(component: RecoderComponentDescriptor): boolean {
  return [
    'TaskGraph',
    'InstructionCompiler',
    'ArtifactStore',
    'EventBus',
    'PolicyEngine',
    'MemoryProvider',
  ].includes(component.contract) && component.origin === 'recoder-native';
}
