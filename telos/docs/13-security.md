# 13 — Security

## Threats we actually have

1. Agent runs untrusted generated game code.
2. Prompt injection via asset names / console logs.
3. Cook secrets (keystore, Apple cert).
4. One tenant seeing another studio volume.

## Rules

- Player and cook run as a non-root user in a dedicated netns / container.
- Tick server binds 127.0.0.1 only.
- No `execute_code` on the host.
- No Unity/Unreal MCP on any interface.
- Secrets listed by name via `secrets.needed`; values only in the cook worker env, never in agent context.
- Audit every JSON-RPC call into `agent_events`.
- GPU quota per project per day.
- Prod deploy and store upload need `approval_id`.

## Isolation ladder

| Stage | Isolation |
|---|---|
| v1 local | Docker user + no docker.sock in player |
| v1 cloud | separate container per studio |
| later | Firecracker / E2B if we host strangers’ games |

Daytona AGPL snapshot: if used, separate process. Prefer Daytona Cloud SDK or E2B Apache infra.

## What we will not do

- Train on customer repos or clips
- Phone home from community Unity MCP (we do not install it)
- Let the model disable safety flags
