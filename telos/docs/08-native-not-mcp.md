# 08 — Native games, not MCP, not HTML5

Rosebud, Gambo, Astrocade, Websim sell prompt-to-canvas. That is a different market. Recoder Studio ships **native binaries**: C# / C++ / Rust, desktop and mobile.

Editor MCP is not the product. It is an unreliable cable into someone else's GUI.

## Why HTML5 startups exist

JS games compile in the same process that plays them. The agent writes a file, refreshes a tab, sees a frame. Unity/Unreal/Bevy do not work that way: domain reload, cook, signing, GPU, 20 GB editors.

Rosebud even published "Why JavaScript Beats Unity for AI Games." They are correct **for toys**. They are wrong for App Store / Steam / 60fps mobile. That sentence is the wedge.

## Why Unity MCP / Unreal MCP keep failing

Observed, not vibes:

- Editor must stay open. Close it, every tool dies.
- C# compile = domain reload = bridge drops mid-call.
- Scene serialization crashes the editor (cycles, ValidTRS, UI Canvas).
- 200+ tools drown the model. Half of Inspector wiring does not survive.
- Official Unreal MCP is localhost-only and experimental.
- Community MCP has no sandbox: `execute_code` is the developer's machine.
- Builds take minutes; MCP retries them N times and wrecks the project.

Locus (open-source Unity agent) said this out loud: if they had built it as an MCP server, the important parts would be impossible. Unity's own 2026 CLI + `com.unity.pipeline` + `unity command eval` is closer to a real agent surface than MCP is.

## Product: Recoder Native Runtime

Claude Code / Codex never talk to Unity Editor MCP.

They talk to **one Recoder daemon**. The daemon owns a sealed box:

```
Claude / Codex / Recoder desktop
        │  JSON-RPC (10 verbs)
        v
Recoder Native Runtime          ← the product
        │
        ├── code workspace      git, compile, artifacts
        ├── headless player     the GAME, not the editor
        ├── tick server         step / snapshot / screenshot
        └── cook workers        android / ios / win / mac
```

The source of truth is the **player build**, not the editor scene view.

## Engine lanes (honest)

| Lane | Language | Why it is in v1 | Role |
|---|---|---|---|
| **Bevy** | Rust | Headless, snapshot, tick, MIT, agents already can `cargo run` | Default 2D/3D desktop + later mobile |
| **Godot (C#)** | C# | Text scenes, headless, Android export without a 30 GB editor | Default mobile |
| **Custom C++ host** | C++ | Thin loop + Sokol/bgfx later if we need "no engine politics" | Optional |
| **Unity** | C# | Market. Used as **batch CLI + player**, never as live MCP | Cook + eval worker |
| **Unreal** | C++ | AAA cook only, last | Cook worker |

Do not start by puppeteering Unity Editor. Start by making Bevy + Godot C# games that an agent can compile, tick, screenshot, and package.

## The 10 verbs (this is the whole API)

```
studio.new        template + engine
studio.open       attach volume
studio.edit       patch files (code-first)
studio.build      compile player (fail = compiler errors, not MCP timeout)
studio.tick       step N frames with input tape
studio.frame      png + world json (transforms, collisions, scores)
studio.snapshot   save / restore sim state
studio.cook       android aab | ios xcarchive | win/mac zip
studio.logs       compiler + player stdout
studio.reset      wipe play state, keep code
```

No `get_components` on a Canvas. No 243 Unity tools. If an engine cannot implement `tick` + `frame`, it is not a first-class lane.

## Play loop (replaces emulator-as-product)

1. Agent writes C# / Rust / C++.
2. Runtime compiles a **headless or windowed player**.
3. Agent sends an input tape (`playproof.yaml`).
4. Runtime steps the player, dumps frames + a tiny world state JSON.
5. VLM + heuristics judge. Fail returns compiler/player logs, not "MCP disconnected."
6. Only after pass: cook mobile.

Android emulator is a **second check**, not the development environment. iOS Simulator is a third check on a Mac worker. Desktop player is where the agent lives.

## What "fully integrated" means in Recoder

Recoder desktop already runs Claude Code and Codex in worktrees. Native Runtime is the worktree's machine:

- Worktree A: Bevy roguelike, `studio.tick` in that box
- Worktree B: Godot C# hypercasual, Android cook
- Merge still happens in Recoder. The runtime only proves the branch plays.

One MCP server **from Recoder**, exposing those 10 verbs. Engines stay behind the daemon. Users never configure Unity MCP.

## Unity / Unreal without MCP

When a customer insists on Unity:

- Gold image with licensed Editor
- Agent uses `unity` CLI + `[CliCommand]` methods we inject into the template
- `unity command eval` for live C# in a **player or batch editor**, then we snapshot
- Cook via `-batchmode -quit`, not via an MCP `build` tool that retries

Unreal: commandlets + Automation + headless packaged game. Same 10 verbs. Official MCP stays unused.

## Templates that are not HTML

- `bevy-2d-platformer` (Rust)
- `bevy-3d-runner` (Rust)
- `godot-cs-hypercasual` (C#)
- `godot-cs-puzzle` (C#)
- `unity-cs-mobile` (later, CLI template with our CliCommand surface baked in)

No Phaser. No Three.js. No "export to zip of index.html" as the ship target.

## Positioning line

**Everyone else generates a tab. Recoder compiles a game.**
