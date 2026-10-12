# 09 — Recoder Native protocol

Single JSON-RPC 2.0 channel. Default: Unix socket `~/.recoder/native.sock` or TCP `127.0.0.1:7430` inside the Studio box. TLS + token when the control plane proxies it.

Claude Code / Codex never speak Unity MCP or Unreal MCP. They speak this.

## Handshake

```json
{ "jsonrpc": "2.0", "id": 1, "method": "studio.open",
  "params": { "engine": "bevy", "template": "bevy-2d-platformer", "volume": "vol_01" } }
```

Reply includes `studio_id`, `engine`, `revision` of this protocol (`native.v1`).

## Verbs

### `studio.new`

Create a project from a template onto a volume.

```json
{ "template": "bevy-2d-platformer", "engine": "bevy", "name": "lane-runner" }
```

Returns `{ studio_id, root, engine }`.

### `studio.open`

Attach an existing volume. Starts the daemon sidecar if cold. Does **not** start an editor GUI.

### `studio.edit`

Patch files. Prefer this over raw `sandbox.exec` so audit can diff.

```json
{ "files": [ { "path": "src/player.rs", "op": "replace", "content": "..." } ] }
```

`op`: `replace` | `patch-unified`. Binary assets: `put-b64` only under `assets/`.

### `studio.build`

Compile the **player**, not the editor.

```json
{ "profile": "dev", "target": "native-host" }
```

`target`: `native-host` | `android-lib` | `ios-lib`.

Failure payload is compiler diagnostics as structured items:

```json
{ "ok": false, "diagnostics": [
  { "file": "src/player.rs", "line": 42, "level": "error", "msg": "..." }
] }
```

No “MCP timeout”. No retry-storm.

### `studio.tick`

Step the running player.

```json
{ "frames": 30, "tape": { "duration": 1.0, "fps": 30, "actions": [
  { "t": 0.0, "type": "key", "key": "Space", "down": true }
] } }
```

If the player is not running, start it headless from the last successful build.

### `studio.frame`

Returns the last framebuffer + world snapshot.

```json
{
  "png_b64": "...",
  "width": 1280, "height": 720,
  "world": {
    "tick": 1840,
    "entities": [
      { "id": "player", "x": 12.0, "y": 3.2, "vx": 1.1, "flags": ["grounded"] }
    ],
    "score": 0,
    "events": ["jumped"]
  }
}
```

World JSON is **engine-owned but schema-stable**. New fields allowed. Required: `tick`, `entities[].id|x|y`.

### `studio.snapshot` / `studio.reset`

`snapshot` → `{ snap_id }` (disk + optional RAM for Bevy).  
`reset` wipes play state, keeps code and last build.

### `studio.cook`

Queue a store artifact. Does not publish.

```json
{ "target": "android", "profile": "release" }
```

Returns `{ job_id }`. Poll `studio.logs` with `job_id`.

`target`: `android` | `ios` | `windows` | `macos` | `linux`.  
`web` is **not** a first-class cook target. No HTML5 ship.

### `studio.logs`

```json
{ "stream": "build" | "player" | "cook", "since": 0, "job_id": "optional" }
```

Returns line chunks + `eof`.

## Errors

| code | meaning |
|---|---|
| `engine_unsupported` | lane not enabled |
| `compile_failed` | diagnostics attached |
| `player_dead` | tick/frame with no process |
| `cook_blocked` | playproof missing when `require_playproof` |
| `approval_required` | prod / store |
| `quota` | GPU minutes |

## What is forbidden on this socket

- Unity MCP tool names
- Unreal MCP tool names
- `execute_code` against the host
- Arbitrary `docker run`
- Fetching the whole scene graph as JSON

## Mapping to Recoder MCP

`apps/mcp` exposes the same verbs as MCP tools with identical params. One implementation, two transports.
