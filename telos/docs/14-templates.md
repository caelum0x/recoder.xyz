# 14 — Templates

Agents fork templates. They do not invent engine layout.

Every first-party template must include:

- `README.md` with engine + lane
- `playproof.yaml` known-good tape
- Recoder Native sidecar already compiling
- `telos.toml` snippet or repo-root compatible keys
- no HTML5 runtime

## v1 (build these for real)

| Path | Engine | Ship |
|---|---|---|
| `templates/bevy-2d-platformer` | Bevy / Rust | desktop player + tick |
| `templates/bevy-3d-runner` | Bevy / Rust | desktop player + tick |
| `templates/godot-cs-hypercasual` | Godot 4 C# | desktop + android cook |

## Keep as legacy / do not advertise

GDScript-only folders (`godot-2d-platformer` without C#) are not the Native v1 path. Either convert to C# or mark deprecated in their README.

## Later

| Path | Condition |
|---|---|
| `templates/unity-cs-mobile` | Unity CLI gold image + Recoder.Native assembly |
| `templates/unity-2d-mobile` | same |
| Unreal | after commandlet tick plugin exists |

## Sidecar contract

Template must answer `studio.frame` with at least one entity id `player` after first tick, so playtest heuristics work out of the box.
