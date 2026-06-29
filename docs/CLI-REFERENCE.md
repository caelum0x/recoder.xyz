# CLI Reference — `recoder conductor`

The `recoder` CLI (a.k.a. `recoder-code`) ships a `conductor` command that drives the
parallel-agent **conductor** control plane: authenticate to recoder.xyz via a
device flow, inspect substrate health and raw tmux sessions, and manage
**workspaces** (isolated git worktree + branch + agent run) through their full
lifecycle — list / get / create / diff / merge / pr / archive.

Every subcommand is degrade-safe: it prints the real backend error (including
"not authenticated" / "cannot reach backend") rather than faking success, and
surfaces approval-gate `409`s from PR/merge as a clear next step.

> Source: [`packages/recoder-code/packages/cli/src/commands/conductor.ts`](../packages/recoder-code/packages/cli/src/commands/conductor.ts)
> · client [`services/conductor/conductor-client.ts`](../packages/recoder-code/packages/cli/src/services/conductor/conductor-client.ts)
> · auth [`services/conductor/conductor-auth.ts`](../packages/recoder-code/packages/cli/src/services/conductor/conductor-auth.ts)
> · config [`services/conductor/conductor-config.ts`](../packages/recoder-code/packages/cli/src/services/conductor/conductor-config.ts)

Related: [CONDUCTOR-ARCHITECTURE.md](./CONDUCTOR-ARCHITECTURE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [API rules](../.claude/rules/api.md)

---

## Invocation

The CLI is published with two binary aliases — both resolve to the same entry
point ([`package.json` `bin`](../packages/recoder-code/packages/cli/package.json)):

```bash
recoder conductor <subcommand> [options]
# alias of the same binary:
recoder-code conductor <subcommand> [options]
```

`conductor` also has the command alias `cd`:

```bash
recoder cd list        # same as: recoder conductor list
```

Running `conductor` with no subcommand prints help (yargs `demandCommand`).

---

## Environment & Config

Resolution is **env-first, then the on-disk token store, then a safe default**.
No secrets are hardcoded — credentials come only from the environment or the
device-flow store.

### Backend URL

`resolveBackendUrl()` precedence — first non-empty wins:

| Source | Notes |
|---|---|
| `--url` flag | Per-command override (available on every subcommand) |
| `RECODER_BACKEND_URL` | Primary backend base URL env var |
| `RECODER_API_URL` | Fallback |
| `NEXTAUTH_URL` | Fallback |
| `https://recoder.xyz` | Production default |

Trailing slashes are stripped. The conductor + device-flow endpoints are mounted
under this origin (`/api/conductor`, `/api/auth/cli`).

### Credential

`resolveCredential()` precedence — first present wins. Returns `null` when nothing
is configured, in which case authenticated commands print "Not authenticated"
instead of calling protected routes.

| Precedence | Env var | Header sent | Source label |
|---|---|---|---|
| 1 | `RECODER_API_KEY` | `x-api-key: <key>` | `env-api-key` (first-party platform key, e.g. `sk_...`) |
| 2 | `RECODER_TOKEN` (or `RECODER_ACCESS_TOKEN`) | `Authorization: Bearer <token>` | `env-token` (explicit override) |
| 3 | `~/.recoder/auth.json` → `access_token` | `Authorization: Bearer <access_token>` | `auth-store` (device-flow) |

### Token store — `~/.recoder/auth.json`

Written by `recoder conductor login`, read by every authenticated command, and
removed by `logout`. Canonical path: `~/.recoder/auth.json` (`os.homedir()` +
`.recoder/auth.json`). Persisted with file mode `0600`. Shape
([`RecoderAuthData`](../packages/recoder-code/packages/cli/src/services/conductor/conductor-config.ts)):

```jsonc
{
  "access_token": "<token>",
  "refresh_token": "<token>",      // optional
  "expires_at": "<ISO timestamp>", // optional
  "user": {
    "id": "...",
    "email": "you@example.com",
    "name": "...",                 // optional
    "subscription_plan": "..."     // optional
  }
}
```

---

## Authentication

### `login` — device flow (RFC 8628)

```bash
recoder conductor login [--client-id <id>] [--url <backend>]
```

| Flag | Type | Description |
|---|---|---|
| `--client-id` | string | OAuth client id for the device grant (optional) |
| `--url` | string | Backend base URL override |

Flow (`ConductorAuthClient.login`), hitting `/api/auth/cli/*`:

1. `POST /api/auth/cli/device` → mints `device_code` + `user_code`. CLI prints the
   `verification_uri`, the `user_code` to enter, and `verification_uri_complete`
   (the direct link) when present.
2. The CLI polls `POST /api/auth/cli/token` with the device-code grant
   (`urn:ietf:params:oauth:grant-type:device_code`) on the server-provided
   `interval`, printing a `.` per poll. RFC 8628 states are honored:
   `authorization_pending` (keep waiting), `slow_down` (back off +5s),
   `access_denied` → "authorization was denied", `expired_token` → "device code
   expired". Polling stops at the `expires_in` deadline → "device authorization
   timed out".
3. On `completed`, the issued token (+ optional refresh/expiry/user) is written to
   `~/.recoder/auth.json` and the CLI prints `Logged in as <email>`.

Example session:

```text
Recoder Conductor — Device Login

Backend: https://recoder.xyz

1. Open: https://recoder.xyz/device
2. Enter code: WDJB-MJHT
   Or visit directly: https://recoder.xyz/device?code=WDJB-MJHT

Waiting for authorization...
....
Logged in as you@example.com
Token stored at ~/.recoder/auth.json
```

### `whoami` — show + verify the current credential

```bash
recoder conductor whoami [--url <backend>]
```

Prints the resolved backend, the credential source (`env-api-key` / `env-token` /
`auth-store`), and the cached user (email + plan) from the auth store. Only a
device-flow access token (`source === auth-store`) can be server-verified — it
calls `POST /api/auth/cli/verify` and reports verified / no-longer-valid /
unverifiable. For env-key/env-token sources it notes that verify is device-flow
only.

### `logout` — remove the stored token

```bash
recoder conductor logout
```

Idempotently removes `~/.recoder/auth.json` (`clearAuthData()`). Does not affect
`RECODER_API_KEY` / `RECODER_TOKEN` env credentials.

---

## Health & Sessions

> These (and all workspace commands below) require a resolvable credential; without
> one they print guidance pointing to `login` / `RECODER_API_KEY` / `RECODER_TOKEN`.

### `health` — substrate availability

```bash
recoder conductor health [--url <backend>]
```

`GET /api/conductor/health`. Prints "Conductor available" / "unavailable", the
optional `reason`, and the raw JSON payload. Exit code `1` on failure.

### `sessions` — raw tmux sessions

```bash
recoder conductor sessions [--url <backend>]
```

`GET /api/conductor/sessions`. Lists raw tmux session ids managed by the
conductor, or "No active sessions."

---

## Workspaces

A workspace is an isolated git worktree + branch + agent run. State is rendered
with color cues: green (`merged`/`ready`), cyan (`running`/`merging`/`setting_up`),
yellow (`awaiting_approval`/`awaiting_review`/`changes_requested`), red
(`failed`/`cancelled`).

### `list` (alias `ls`)

```bash
recoder conductor list [--json] [--url <backend>]
```

`GET /api/conductor/workspaces`. Renders one row per workspace
(`workspaceId · state · runtimeId · branch ← baseRef`), or a hint to create one.

| Flag | Type | Default | Description |
|---|---|---|---|
| `--json` | boolean | `false` | Output raw JSON |
| `--url` | string | — | Backend base URL override |

### `get <workspaceId>`

```bash
recoder conductor get <workspaceId> [--json] [--url <backend>]
```

`GET /api/conductor/workspaces/:workspaceId`. Prints workspace detail: ID, state,
runtime (+ substrate), branch ← baseRef, space/project/task ids, optional run id,
worktree path, session name, and created-at / created-by.

### `create`

```bash
recoder conductor create \
  --space <id> --project <id> --task <id> \
  --repo <abs-path-on-backend-host> \
  (--prompt "<text>" | --command "<text>") \
  [--runtime <id>] [--substrate <id>] [--model <id>] \
  [--branch <name>] [--base-ref <ref>] [--created-by <id>] \
  [--json] [--url <backend>]
```

`POST /api/conductor/workspaces`. Creates and launches a workspace (isolated
worktree + agent run).

| Flag | Type | Required | Description |
|---|---|---|---|
| `--space` | string | ✅ | Space id |
| `--project` | string | ✅ | Project id |
| `--task` | string | ✅ | Task id |
| `--repo` | string | ✅ | Absolute repo path **on the backend host** |
| `--prompt` | string | one of | Agent prompt |
| `--command` | string | one of | Raw command to run |
| `--runtime` | string | — | Runtime id (backend planner defaults it when omitted) |
| `--substrate` | string | — | `tmux_worktree` \| `daytona` \| `in_process` |
| `--model` | string | — | Model id |
| `--branch` | string | — | Branch name for the worktree |
| `--base-ref` | string | — | Base ref to cut the branch from |
| `--created-by` | string | `cli` | Creator id |
| `--json` | boolean | — | Output raw JSON |
| `--url` | string | — | Backend base URL override |

Exactly one of `--prompt` / `--command` is required (the CLI rejects neither with
a clear error). A `429` response is surfaced as "resource budget exceeded — retry
later".

### `diff <workspaceId>`

```bash
recoder conductor diff <workspaceId> [--json] [--url <backend>]
```

`GET /api/conductor/workspaces/:workspaceId/diff`. Prints the unified `patch` when
present; otherwise a per-file changed list with `+adds/-dels`; otherwise "No
changes."

### `merge <workspaceId>` — approval-gated

```bash
recoder conductor merge <workspaceId> \
  [--strategy merge|squash|rebase] [--delete-branch] [--url <backend>]
```

`POST /api/conductor/workspaces/:workspaceId/merge`.

| Flag | Type | Default | Description |
|---|---|---|---|
| `--strategy` | string | — | Merge strategy (`merge` \| `squash` \| `rebase`) |
| `--delete-branch` | boolean | `false` | Delete the branch after merge |
| `--url` | string | — | Backend base URL override |

A `409` means an approval gate fired: the CLI prints "Approval required …" and
notes the workspace moved to `awaiting_approval` — approve it, then retry.

### `pr <workspaceId>` — approval-gated

```bash
recoder conductor pr <workspaceId> \
  [--title "<t>"] [--body "<b>"] [--base <branch>] [--draft] [--remote <name>] \
  [--url <backend>]
```

`POST /api/conductor/workspaces/:workspaceId/pr`. On success prints the PR URL.

| Flag | Type | Default | Description |
|---|---|---|---|
| `--title` | string | — | PR title |
| `--body` | string | — | PR body |
| `--base` | string | — | Base branch for the PR |
| `--draft` | boolean | `false` | Open as draft |
| `--remote` | string | — | Git remote |
| `--url` | string | — | Backend base URL override |

Like `merge`, a `409` indicates the workspace moved to `awaiting_approval`.

### `archive <workspaceId>`

```bash
recoder conductor archive <workspaceId> [--url <backend>]
```

`POST /api/conductor/workspaces/:workspaceId/archive`. Archives a finished
workspace (stop session, remove worktree).

---

## Command summary

| Subcommand | Backend route | Auth required |
|---|---|---|
| `login` | `POST /api/auth/cli/device`, `POST /api/auth/cli/token` | — |
| `whoami` | `POST /api/auth/cli/verify` (device-flow tokens only) | — |
| `logout` | — (local file remove) | — |
| `health` | `GET /api/conductor/health` | ✅ |
| `sessions` | `GET /api/conductor/sessions` | ✅ |
| `list` (`ls`) | `GET /api/conductor/workspaces` | ✅ |
| `get` | `GET /api/conductor/workspaces/:id` | ✅ |
| `create` | `POST /api/conductor/workspaces` | ✅ |
| `diff` | `GET /api/conductor/workspaces/:id/diff` | ✅ |
| `merge` | `POST /api/conductor/workspaces/:id/merge` | ✅ |
| `pr` | `POST /api/conductor/workspaces/:id/pr` | ✅ |
| `archive` | `POST /api/conductor/workspaces/:id/archive` | ✅ |

Backend route source:
[`docker-backend/src/conductor/conductor.routes.ts`](../docker-backend/src/conductor/conductor.routes.ts) ·
[`docker-backend/src/distribution/cli-auth.routes.ts`](../docker-backend/src/distribution/cli-auth.routes.ts).

> The backend conductor router exposes more surface than the CLI wires up today
> (e.g. `POST /workspaces/plan`, `/reconcile`, `/metrics`, `/resources`,
> `/workspaces/:id/steer`, `/batch/cancel`, `/batch/archive`). Those are **not yet
> exposed** as `recoder conductor` subcommands.
