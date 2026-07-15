/**
 * Truthful cloud module health (ARCHITECTURE §10.1). The cloud domain is an
 * off-box SUBSTRATE: its hard dependency is the Postgres state-of-record (tenant
 * store). Provider adapters, preview, mesh, and fleet are degrade-safe engines
 * that lower the module to `degraded` when impaired but do not fail it — the
 * mesh in particular is registered-but-no-live-data-plane, so its `down` is the
 * expected pre-launch posture.
 *
 * Rollup: tenant store down ⇒ `down` (nothing can be gated safely). Otherwise
 * `degraded` when any provider/preview/mesh/fleet engine is impaired; everything
 * `up` ⇒ `up`. Never a fabricated `up`.
 */
import {
  type ComponentHealth,
  type EngineStatus,
  type HealthStatus,
} from '../../shared/health-types.js';
import type { TenancyService } from './services/tenancy.service.js';
import type { SandboxProvisionerService } from './services/sandbox-provisioner.service.js';
import type { PreviewDeployService } from './services/preview-deploy.service.js';
import type { MeshDiagnosticsService } from './services/mesh-diagnostics.service.js';
import type { FleetSupervisorService } from './services/fleet-supervisor.service.js';

export interface CloudHealthDeps {
  readonly tenancy: TenancyService;
  readonly provisioner: SandboxProvisionerService;
  readonly preview: PreviewDeployService;
  readonly mesh: MeshDiagnosticsService;
  readonly fleet: FleetSupervisorService;
}

function toEngine(name: string, h: ComponentHealth): EngineStatus {
  return { name, status: h.status, ...(h.reason ? { reason: h.reason } : {}) };
}

/** Build the composed cloud component health from every sub-service. */
export async function buildCloudHealth(deps: CloudHealthDeps): Promise<ComponentHealth> {
  const { tenancy, provisioner, preview, mesh, fleet } = deps;

  const tenancyHealth = tenancy.health();
  const [provisionerHealth, previewHealth, meshHealth, fleetHealth] = await Promise.all([
    provisioner.health(),
    preview.moduleHealth(),
    mesh.moduleHealth(),
    fleet.health(),
  ]);

  const engines: readonly EngineStatus[] = [
    toEngine('tenancy', tenancyHealth),
    toEngine('provisioner', provisionerHealth),
    toEngine('preview', previewHealth),
    toEngine('mesh', meshHealth),
    toEngine('fleet', fleetHealth),
  ];

  // The tenant store is the load-bearing dependency: its `down` fails the module
  // (no cloud write can be gated safely). Everything else degrades.
  let status: HealthStatus;
  if (tenancyHealth.status === 'down') {
    status = 'down';
  } else if (engines.some((e) => e.status !== 'up')) {
    status = 'degraded';
  } else {
    status = 'up';
  }

  const base = {
    name: 'cloud',
    status,
    degraded: status === 'degraded',
    engines,
  };
  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
