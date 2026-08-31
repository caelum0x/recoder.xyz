# Loom Remote Attach over Ziti — Design (herdr pillar #5)

> Status: source-complete 2026-08-31; live provisioning pending. The installed arm64
> app now ships the OpenZiti binary, starts a private Unix-socket dial bridge from an
> enrolled identity, and routes governed remote monitor + steer through that socket.
> The host bridge binds only loopback before Ziti carries the stream. A real two-host
> proof still requires the operator-owned `loom-control` service and dial/bind identities.

## 1. Where we are (verified 2026-08-13)

herdr pillar #5 is "where do agents run while you sleep" — a remote box. In Recoder:

- `RemoteAttachService` (`backend/src/domains/conductor/remote-attach/`) already
  mints owner-scoped sessions and serves `snapshot` (monitor) + `steer` (drive).
- `createRemoteAttachDeps` (`adapters/remote-attach-wiring.ts`) already binds
  `deliver` → the **loom control API** (`agent.prompt`) over a `LoomClientPort`,
  plus real policy/approval/audit. It is composed at bootstrap.
- Authenticated HTTP mint/describe/snapshot/stream/steer/revoke routes now expose the service to a second
  signed-in client. Sessions use the canonical TTL-backed KvStore and report
  whether they are restart-survivable; Session copies a receiver deep link and
  the mobile-first web receiver shows real panes, governed steer, and revocation.
  Its authenticated SSE route projects native Loom status and Recoder lifecycle
  edges through the session's still-owned scope rather than polling the UI.
  Canonical Better Auth sign-out revokes every remote session for the owner before
  invalidating the credential, so a second client cannot outlive global sign-out.
- The local path still uses `loomDaemon.socketPath`. When
  `CONDUCTOR_REMOTE_LOOM_SOCKET_PATH` is present, remote attach uses that distinct
  bridge socket for both `session.snapshot` and `agent.prompt`; local launches and
  local status remain on the app-owned Loom daemon.

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

The shipped bridge deliberately preserves `LoomSocketClient` unchanged: on the dial
host, `scripts/loom-ziti-bridge.mjs dial` owns a mode-0600 Unix socket and opens one
SDK-backed `ziti demo zcat` stream per Loom connection. On the Loom host, the same
script's `host` mode binds a loopback-only TCP hop into the Loom Unix socket while
`ziti tunnel host` binds the service. No Loom control port is public.

## 4. Identity & provisioning (the infra gate)

Required before implementation can be BUILT + VERIFIED:

1. A ziti identity for the backend process on each box (`backend.jwt` enrolled →
   `backend.json`). Injected via config (`CONDUCTOR_LOOM_ZITI_IDENTITY` path), read
   ONLY in bootstrap (no env in domain code — mirrors the existing config seam).
2. A ziti service `loom-control` whose terminator is the loom daemon's socket on the
   host (a ziti tunneler/host config binding the unix socket), and a service policy
   granting the backend identity `dial`, the host identity `bind`.
3. The arm64 OpenZiti CLI shipped in the app. The bridge uses its Go SDK-backed
   `zcat` dialer and host tunneler; no Node native addon is required.

Provision the installed client after the controller objects exist:

```bash
scripts/provision-desktop-loom-ziti.sh /absolute/path/client.json loom-control
```

Run the host endpoint with a `host.v1` service configuration pointing at the same
loopback port:

```bash
node scripts/loom-ziti-bridge.mjs host \
  --identity /absolute/path/host.json \
  --service loom-control \
  --loom-socket /absolute/path/loom.sock \
  --listen-port 19020 \
  --ziti-bin /absolute/path/ziti
```

The missing live input is now only the enrolled identities plus the controller's
service/policies; source and installed-app launch wiring are present.

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
