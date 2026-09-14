# 12 — Recoder Native Runtime daemon

The daemon is the process Claude actually drives.

## Processes on a Studio box

```
recoder-native-d          # Go or Rust, owns the socket
  ├─ build worker         # cargo / dotnet / godot / unity-cli
  ├─ player               # headless game process with tick server
  └─ cook worker          # optional, long job
```

One daemon per studio_id. Control plane (`apps/api`) SSHs or execs into the box and talks JSON-RPC.

## State machine

```
cold ──open──► ready
ready ──build──► built          (or compile_failed → ready)
built ──tick──► playing
playing ──snapshot──► playing
playing ──reset──► built
built ──cook──► cooking → built
any ──idle 15m──► sleep (keep volume, drop GPU)
sleep ──open──► ready
```

Editor GUI is not a state.

## Layout on disk

```
/studio/<id>/
  project/              # git worktree or clone
  builds/dev/           # last player binary
  builds/cook/          # aab / exe
  play/last.png
  play/world.json
  play/tape.yaml
  play/clip.mp4
  snaps/<snap_id>/
  logs/build.log
  logs/player.log
```

Volume is persistent. Player binary is not the editor cache (`Library/` stays inside Unity worker only).

## Tick server inside the player

Each template links a small library:

- Bevy: `recoder_native` crate
- Godot C#: `Recoder.Native` assembly
- Unity: `Assets/Recoder/Native/`
- Unreal: `RecoderNative` plugin

The library binds `127.0.0.1:<port>` **inside the netns**. Daemon is the only client. Protocol = same verbs `tick` / `frame` / `snapshot` subset.

If the player dies, daemon restarts from `builds/dev` and returns `player_dead` once so the agent can rebuild.

## GPU

Bevy 2D and Godot 2D can run SwiftShader / llvmpipe for CI. Real Playproof on 3D wants a GPU worker.

Quota: `telos.toml [studio].max_gpu_minutes_per_day`.

## Local mode (laptop)

`recoder studio up` starts `recoder-native-d` against the current worktree. Same socket. Claude Code in Recoder desktop talks to localhost. This is how “fully integrated” feels without a cloud GPU.
