# Loom Remote Attach over Ziti — Design (herdr pillar #5)

> Status: 2026-08-13. Owner-approved transport: **on-box OpenZiti** (zero-trust
> overlay, no public port). This is the design + wiring plan for "run agents on a
> rented box, reattach from anything with a keyboard." It is a DESIGN, not shipped
> code: the real dialer needs a provisioned ziti identity to build AND verify, and
> we do not ship unverifiable network code. Everything below binds to seams that
> ALREADY exist so the implementation is additive.

## 1. Where we are (verified 2026-08-13)

herdr pillar #5 is "where do agents run while you sleep" — a remote box. In Recoder:

- `RemoteAttachService` (`backend/src/domains/conductor/remote-attach/`) already
  mints owner-scoped sessions and serves `snapshot` (monitor) + `steer` (drive).
- `createRemoteAttachDeps` (`adapters/remote-attach-wiring.ts`) already binds
  `deliver` → the **loom control API** (`agent.prompt`) over a `LoomClientPort`,
  plus real policy/approval/audit. It is composed at bootstrap.
- **Gap:** the `LoomClientPort` it drives is the **local Unix-domain socket**
  (`loomDaemon.socketPath`). "Remote" today means a different *client on the same
  host*, not a remote box. The transport is the only missing piece — the governance,
  ownership, policy, approval, and audit are all already enforced.

Because `createRemoteAttachDeps` takes `loom: LoomClientPort` as an injected seam,
**no refactor is required**: remote reach is a matter of supplying a ziti-backed
`LoomClientPort` instead of (or beside) the local one. The service, its ownership
re-verification, and its truthful `SERVICE_UNAVAILABLE` degrade are unchanged.

## 2. Why Ziti (vs SSH tunnel)

- **No listening port.** Ziti endpoints *dial out* to the controller/routers; the
  loom socket is never bound to a public interface. There is no inbound attack
  surface to firewall — the opposite of an SSH tunnel or an exposed TCP port.
- **Identity-gated by default.** Every dial is authorized against a ziti identity +
  service policy; an unauthorized caller cannot even see the service exists.
- **Already on the box.** Infra memory records ziti on the prod host, so we reuse
  the existing zero-trust fabric rather than standing up new transport.

## 3. The seam (additive, one new adapter)

```
RemoteAttachService  ── loom: LoomClientPort ──┐
                                               ├─ LOCAL:  LoomSocketClient({ socketPath })   (today)
createRemoteAttachDeps({ loom, ... })  ────────┤
                                               └─ REMOTE: LoomZitiClient({ zitiIdentity,     (new)
                                                             service: 'loom-control' })
```

`LoomZitiClient` implements the SAME `LoomClientPort.call(verb, payload)` contract
as `LoomSocketClient`, but its underlying stream is a ziti-dialed connection to the
`loom-control` service on the target box instead of a local `net.connect(socketPath)`.
The NDJSON framing, protocol-20 handshake, and request/response correlation are
IDENTICAL and already implemented in `packages/agent-runtimes/src/adapters/loom/` —
only the byte transport changes. Extract the socket plumbing behind a
`LoomTransport` interface (`connect(): Duplex`) so `LoomSocketClient` and
`LoomZitiClient` share the framing layer.

## 4. Identity & provisioning (the infra gate)

Required before implementation can be BUILT + VERIFIED:

1. A ziti identity for the backend process on each box (`backend.jwt` enrolled →
   `backend.json`). Injected via config (`CONDUCTOR_LOOM_ZITI_IDENTITY` path), read
   ONLY in bootstrap (no env in domain code — mirrors the existing config seam).
2. A ziti service `loom-control` whose terminator is the loom daemon's socket on the
   host (a ziti tunneler/host config binding the unix socket), and a service policy
   granting the backend identity `dial`, the host identity `bind`.
3. The `@openziti/ziti-sdk-nodejs` (or the ziti-hosted tunneler + a local proxy) —
   pick at implementation time based on which builds cleanly in the backend image.

Until (1)–(3) exist, `LoomZitiClient` cannot be exercised; shipping it blind would
be an unverifiable stub, which we do not do.

## 5. Truthful degrade (unchanged invariant)

- No ziti identity configured ⇒ the remote `LoomClientPort` is simply not wired, and
  a remote-scoped steer/snapshot refuses `SERVICE_UNAVAILABLE` exactly as today. The
  LOCAL path is unaffected.
- A ziti dial failure/timeout ⇒ the `call()` rejects; the service surfaces the fault
  (never a faked delivery), same as a dead local session throws today.
- Ownership, policy (`remote.steer`), approval, and audit are enforced by the service
  BEFORE the transport is touched — remoteness never weakens the gate.

## 6. Verification plan (when the identity is provisioned)

1. Unit: `LoomZitiClient` against a fake ziti transport (inject the `Duplex`) — proves
   framing/handshake parity with `LoomSocketClient` (reuse the existing socket-client
   tests over the shared framing layer).
2. Integration: two boxes (or two ziti identities on one box) — backend on A dials the
   `loom-control` service terminated at loom on B; assert `snapshot` returns B's herd
   and a governed `steer` reaches a live pane on B (`agent_prompted`).
3. Negative: an identity without the `dial` policy is refused at the fabric (cannot see
   the service) — proves the zero-trust boundary, not just app-layer auth.
4. Security: confirm no inbound port is opened on either box (`ss -ltnp` shows no new
   listener); the loom socket stays unix-domain and local.

## 7. Scope boundary

This unblocks pillar #5 transport ONLY. It does NOT change task/approval/memory/audit
ownership (Recoder-owned, per AGENTS.md), and it is gated behind an explicit config
identity — enabling it is an operator action, reviewed like any network change.
