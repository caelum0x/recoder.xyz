# NETWORKING module

**Shipped as the mesh facet of the `cloud` domain** (`backend/src/domains/cloud`,
Phase 10 — not a standalone `domains/networking`). Uses the OSS engine(s) **in
place** (never copied): apps/desktop/server/engines/ziti +
apps/desktop/server/engines/recoder-xds (both shipped — no longer cloud-deferred).

**Interface — READ half** (`MeshDiagnostics` port, READ-ONLY): `zitiIdentities ·
xdsClusters · status · health` — exposed at `GET /api/agent-os/cloud/mesh` (merged
`MeshSnapshot`), reported as a truthful `mesh` health source inside the cloud
domain's health roll-up.

**Interface — WRITE half** (`MeshWritePort`, GOVERNED, `ports/mesh-write.port.ts`):
the twin of the READ port. Where diagnostics *observe* registrations, this port
*mutates* the live mesh — `{ enroller: ZitiMeshEnroller; xds: XdsControlPlaneWriter }`.
`MeshFabricService` (`services/mesh-fabric.service.ts`) composes both engines behind
two verbs, each wrapped in the same `GovernanceGate` `decide → audit`
(`guardCloudWrite → … → recordCloudAudit`) the HTTP/MCP edges use:

- **`enrollSandbox(tenant, sandbox)`** — consumed by
  `SandboxProvisionerService.enrollOnMesh` on a SUCCESSFUL provision: enrolls a
  ziti zero-trust identity and upserts the `cloud_mesh_endpoints` registry at
  `status:'registered'`, `metadata.kind:'sandbox'`.
- **`registerPreviewEdge(tenant, deployment, target)`** — consumed by
  `PreviewDeployService.frontOnMesh` on a preview DEPLOY: bumps the recoder-xds
  control-plane snapshot (`XdsControlPlaneWriter.registerUpstream`) so Envoy fronts
  the new edge with no restart. On success the served **snapshot version is sealed
  into the governance audit as evidence** (`metadata.snapshotVersion`, endpoint
  flipped to `status:'active'`).

Both outcome unions (`MeshEnrollOutcome` / `MeshEdgeOutcome`) are discriminated on a
boolean (`enrolled` / `fronted`) with a mandatory `reason` on the false branch — the
degrade-truthful contract lives in the type, not just the runtime.

**Built + wired + ready — endpoint-DEFERRED, no live data plane (owner decision 7).**
The WRITE seams above are shipped and consumed end-to-end, BUT the mesh stays
**cloud-tier-deferred** per owner decision 7 (`docs/RECODER-MODULES.md:359,418`):
registered + diagnostics only, with **no live data plane until the cloud/teams
launch**. `ZITI_ENDPOINT` / `XDS_ENDPOINT` (`cloud/config.ts` `zitiEndpoint` /
`xdsEndpoint`) default **null**, so every write short-circuits on
`isConfigured()===false` to a truthful `{ ok:false, reason }` skip:

- provision → `enrollSandbox` ⇒ `{ enrolled:false, degraded:true }` and the sandbox
  **still provisions over its public host**;
- deploy → `registerPreviewEdge` ⇒ `{ fronted:false, degraded:true }`, the intent is
  still recorded at `status:'registered'`, and the preview **still resolves via its
  public DNS subdomain** — the xDS fronting supplements, never replaces, the DNS host.

Activation is a single env flip at cloud launch; nothing spawns `bin/recoder-xds`
and the backend never speaks ADS gRPC while deferred. This regression-locked skip
path is pinned by `cloud/__tests__/mesh-deferred-boundary.test.ts`.

**Known redundancy / launch-time follow-up.** A *second* OpenZiti client exists in
the engines domain (`engines/ziti-client.ts` + `ZitiRestAdapter` + the `ziti.*` MCP
tools, keyed by `ZITI_CONTROLLER_URL`), parallel to the cloud `ziti-mesh.adapter`
used here. It is agent-callable and harmless; it is left in place (no-prune /
OSS-dir rules) and tracked to consolidate onto the cloud enroll path when
networking un-defers at cloud launch — not deleted now.

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

**Agent-facing MCP tools (governed): none.** The mesh has no public `recoder_*`
capability-bridge tool in `mcp/recoder-capability-tools.cjs` — agents reach it only
through the engine-namespace `cloud_mesh_*` / `cloud_xds_*` ids above (behind the same
governance gate). No `recoder_mesh_*` wrapper exists today; adding one would be new work.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down (absent ziti/xds endpoint ⇒ `status:'down'` with the missing
source named, empty identities/clusters), never fakes success. A network fault
resolves to `unknown`/`down`, never a throw. See ../RECODER-MODULES.md §NETWORKING.
