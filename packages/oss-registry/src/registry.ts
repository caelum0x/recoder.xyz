import type {
  OSSComponentDescriptor,
  RecoderComponentContract,
  RecoderComponentDescriptor,
} from './descriptor';
import {
  componentOwnsCanonicalState,
  validateRecoderComponent,
  type RecoderComponentFinding,
} from './recoder-component';

export class OSSRegistry {
  private readonly components = new Map<string, OSSComponentDescriptor>();

  register(component: OSSComponentDescriptor): OSSComponentDescriptor {
    this.components.set(component.id, component);
    return component;
  }

  list(): OSSComponentDescriptor[] {
    return [...this.components.values()];
  }

  get(componentId: string): OSSComponentDescriptor | null {
    return this.components.get(componentId) ?? null;
  }

  byContract(contract: OSSComponentDescriptor['contract']): OSSComponentDescriptor[] {
    return this.list().filter((component) => component.contract === contract);
  }
}

export function createOSSRegistry(components: OSSComponentDescriptor[] = []): OSSRegistry {
  const registry = new OSSRegistry();
  for (const component of components) {
    registry.register(component);
  }
  return registry;
}

export type ComponentSecurityRisk = {
  componentId: string;
  name: string;
  requiresAuth: boolean;
  handlesSecrets: boolean;
  canExecuteCode: boolean;
  canTouchProduction: boolean;
  risk: 'low' | 'medium' | 'high';
};

export class RecoderComponentRegistry {
  private readonly components = new Map<string, RecoderComponentDescriptor>();

  register(component: RecoderComponentDescriptor): RecoderComponentDescriptor {
    this.components.set(component.id, component);
    return component;
  }

  list(): RecoderComponentDescriptor[] {
    return [...this.components.values()];
  }

  get(componentId: string): RecoderComponentDescriptor | null {
    return this.components.get(componentId) ?? null;
  }

  byContract(contract: RecoderComponentContract): RecoderComponentDescriptor[] {
    return this.list().filter((component) => component.contract === contract);
  }

  byOwner(owner: string): RecoderComponentDescriptor[] {
    return this.list().filter((component) => component.owner === owner);
  }

  canonicalStateOwners(): RecoderComponentDescriptor[] {
    return this.list().filter(componentOwnsCanonicalState);
  }

  securityRisks(): ComponentSecurityRisk[] {
    return this.list()
      .map((component) => ({
        componentId: component.id,
        name: component.name,
        requiresAuth: component.security.requiresAuth,
        handlesSecrets: component.security.handlesSecrets,
        canExecuteCode: component.security.canExecuteCode,
        canTouchProduction: component.security.canTouchProduction,
        risk: riskForComponent(component),
      }))
      .sort((left, right) => riskRank(right.risk) - riskRank(left.risk));
  }

  validateAll(): RecoderComponentFinding[] {
    return this.list().flatMap(validateRecoderComponent);
  }
}

export function createRecoderComponentRegistry(
  components: RecoderComponentDescriptor[] = [],
): RecoderComponentRegistry {
  const registry = new RecoderComponentRegistry();
  for (const component of components) {
    registry.register(component);
  }
  return registry;
}

function riskForComponent(component: RecoderComponentDescriptor): ComponentSecurityRisk['risk'] {
  if (component.security.canTouchProduction || (component.security.canExecuteCode && component.security.handlesSecrets)) {
    return 'high';
  }
  if (component.security.canExecuteCode || component.security.handlesSecrets || component.security.requiresAuth) {
    return 'medium';
  }
  return 'low';
}

function riskRank(risk: ComponentSecurityRisk['risk']): number {
  if (risk === 'high') {
    return 3;
  }
  if (risk === 'medium') {
    return 2;
  }
  return 1;
}
