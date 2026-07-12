/**
 * Fleet — the declarative polyglot service supervisor (RECODER-ENGINES §11/§24).
 * Public surface: the typed manifest plus the degrade-safe supervisor.
 */
export {
  FLEET,
  getFleetService,
  fleetServiceIds,
  type FleetService,
  type FleetLang,
  type FleetHealthKind,
  type FleetHealthCheck,
} from './manifest.js';

export {
  FleetSupervisor,
  getFleetHealth,
  type FleetSupervisorDeps,
  type FleetServiceStatus,
  type FleetStatusSource,
  type FleetHealth,
  type FleetHttpProbeResult,
  type FleetFetch,
} from './supervisor.js';
