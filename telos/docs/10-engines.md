# 10 — Engine lanes

A lane is allowed only if it can implement `build`, `tick`, `frame`, `snapshot` without an editor GUI.

## Decision

| Priority | Lane | Language | v1 | Notes |
|---|---|---|---|---|
| 1 | Bevy | Rust | yes | Default desktop. Tick/snapshot native. |
| 2 | Godot 4 C# | C# | yes | Default mobile. Headless player + export. |
| 3 | Unity 6 CLI | C# | later | Batch editor + packaged player. No MCP. |
| 4 | Unreal 5.8 commandlets | C++ | last | Packaged game + automation. No MCP. |
| — | Godot GDScript | — | no | We standardize on C# for the Godot lane. |
| — | Phaser / Three / HTML5 | JS | never | Different product. |

## Bevy (Rust) — default desktop

**Why first:** `cargo build` is an agent-native compiler. Headless window or wgpu offscreen. ECS state is snapshotable. MIT. No license server.

**Daemon sidecar:** a tiny `recoder_native` crate in the template:

- runs the `App` with a fixed timestep
- applies input tape as `ButtonInput` / touch events
- every N frames writes `frame.png` + `world.json` (query Transform + our `RecoderObserve` component)
- `snapshot` serializes registered resources

**Host image:** `infra/docker/images/bevy-studio` — Rust toolchain, shader libs, optional GPU.

**Mobile later:** `cargo apk` / xbuild. Not week 1. Desktop player is enough to prove the loop.

**Template:** `templates/bevy-2d-platformer`, `templates/bevy-3d-runner`.

## Godot 4 C# — default mobile

**Why:** scenes are text, headless exists, Android export exists, language is C# (not JS). MIT engine.

**Rules:**

- New Recoder Godot templates are **C# only** (`.csproj` present).
- Agent edits `.cs` and `.tscn`. No GDScript in first-party templates.
- Play: `godot --headless --path . --script res://addons/recoder_native/tick.cs` or a packaged debug player with the Recoder tick server compiled in.
- Cook Android: `godot --headless --export-release Android build/game.aab`

**Do not** attach Godot editor MCP. The addon talks JSON-RPC to the daemon only.

**Template:** `templates/godot-cs-hypercasual` (and migrate old GDScript stubs off the v1 path).

## Unity 6 — cook + eval worker, not a product surface

Use when a customer already has a Unity project or seat.

**Allowed interface:**

- `unity` CLI install / project
- `-batchmode -nographics -quit -executeMethod Recoder.Native.BuildPlayer`
- `unity command eval` / `[CliCommand]` only inside methods we ship in `Assets/Recoder/Native/`
- Packaged standalone player that embeds the same tick server as Bevy

**Forbidden:**

- Official or community Unity MCP as the agent API
- Requiring a visible Editor window for `tick`
- Domain-reload-sensitive tool calls during `studio.edit`

Agent still only sees the 10 verbs. Driver translates `studio.build` → batchmethod, `studio.tick` → player RPC.

License: BYO seat or our floating Build Server seats on a gold image. Document activation. No pirated editors.

## Unreal 5.8 — last

`UnrealEditor-Cmd` commandlets + packaged game with a Recoder tick plugin (C++).

Official MCP plugin stays off. Same 10 verbs or the lane is not advertised.

## C++ thin host (optional, not a lane yet)

If Bevy/Godot politics get in the way: Sokol/bgfx + our tick server. Do not start here.

## Implementing a new lane

1. Add `packages/drivers/studio-<name>` implementing `NativeRuntime` in `@recoder/types`.
2. Golden image under `infra/docker/images/`.
3. Template under `templates/` with `recoder_native` sidecar already wired.
4. Fixture in `tests/playproof/` that ticks 60 frames and asserts `pixels_changed`.
5. Update this file.
