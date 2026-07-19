# NETWORKING module

**Shipped as the mesh facet of the `cloud` domain** (`backend/src/domains/cloud`,
Phase 10 — not a standalone `domains/networking`). Uses the OSS engine(s) **in
place** (never copied): apps/desktop/server/engines/ziti +
apps/desktop/server/engines/recoder-xds (both shipped — no longer cloud-deferred).

**Interface** (`MeshDiagnostics` port, READ-ONLY): `zitiIdentities · xdsClusters · status · health`
— exposed at `GET /api/agent-os/cloud/mesh` (merged `MeshSnapshot`), reported as a
truthful `mesh` health source inside the cloud domain's health roll-up.

**Registered-but-no-live-data-plane.** The mesh (ziti zero-trust overlay +
recoder-xds Envoy control plane) is observable — this facet reads identity/cluster
registrations + engine health only, and never routes traffic.

**MCP tools (shipped — real-bound, degrade-truthful).** The two engines are exposed
as agent-callable MCP tools behind the governance gate:

- **ziti** (`cloud`): `cloud_mesh_services_list` · `cloud_mesh_enrollment_status` ·
  `cloud_mesh_topology` — read-only overlay introspection (services, enrollment
  state, mesh topology). Plus `cloud_mesh_enroll` (**gated** write — identity
  enrollment requires approval).
- **recoder-xds** (`cloud`): `cloud_xds_snapshot` · `cloud_xds_clusters` ·
  `cloud_xds_routes` · `cloud_xds_listeners` · `cloud_xds_endpoints` — read-only
  Envoy control-plane inspection (config snapshot, CDS/RDS/LDS/EDS resources).

All read tools mirror the `MeshDiagnostics` truthfulness contract: engine down or
endpoint absent ⇒ the tool reports the missing source, never fakes data.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down (absent ziti/xds endpoint ⇒ `status:'down'` with the missing
source named, empty identities/clusters), never fakes success. A network fault
resolves to `unknown`/`down`, never a throw. See ../docs/RECODER-MODULES.md §NETWORKING.
