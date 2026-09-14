# GOAL.md

**Product:** Recoder Cloud + Recoder Studio  
**Codename:** Telos  
**Home:** [recoder.xyz](https://recoder.xyz)  
**Date:** 2026-09-10

## One sentence

Recoder agents already write code in parallel worktrees. Telos is the missing half: they get a machine, a deploy target, and — for games — a studio that can play the build and film the proof.

## North star

An agent can take a repo or a game prompt, work in isolation, prove the result, and ship to staging without a human babysitting the infrastructure. Production still needs a human.

## Why Recoder owns this

Recoder is the terminal IDE for Claude Code, Codex, Cursor, and OpenCode running in parallel git worktrees. Today those agents stop at a branch. Recoder Cloud is where the branch becomes a URL, an APK, or a Playproof clip.

```
Recoder desktop  →  worktree + agent
Recoder Cloud    →  sandbox / studio + deploy
Recoder Studio   →  native C#/C++/Rust player + Playproof + cook
                     (not HTML5, not Unity MCP)
```

Do not fork Recoder Code into this repo. This repo is the platform those agents call (CLI, MCP, A2A).

## Goals (in order)

1. **Ship loop** — `recoder ship` / MCP `deploy.staging` takes a branch to a preview URL on our Hetzner + Coolify substrate.
2. **Safe agents** — every tool call audited; prod is two-step approve; sandboxes cannot see other tenants.
3. **Playproof** — a game change is not “done” until a 10–20s clip + input tape exists and a judge (VLM + heuristics) accepts it.
4. **Mobile cook** — Android AAB from the same Studio; iOS only via a Mac worker after the human drops certs.
5. **Native, not HTML5** — C# / C++ / Rust desktop + mobile. See docs/08-native-not-mcp.md.
6. **No editor-MCP as the product** — 10 Recoder verbs against a sealed player. Unity/Unreal are batch cook workers.

## Non-goals

- Merge Coolify + Daytona + OpenHands + Godot into one git tree
- Global Anycast network (use Cloudflare)
- Kubernetes in v1
- HTML5 / Phaser / Three.js as the ship target
- Unity/Unreal MCP as the agent interface
- “AAA Unreal from one sentence”
- App Store publish without a human
- Training on customer games or repos
- Replacing Recoder desktop

## Success in 90 days

| Metric | Pass |
|---|---|
| First web app preview from Recoder MCP | working |
| Bevy template: build + tick + last.png | working |
| Godot C# template → Playproof → Android AAB | working |
| Prod deploy blocked without approval | enforced |
| Docker sandbox offline | working |
| Unity MCP not installed anywhere in the product path | enforced |
| Unity lane | designed only |

## Positioning

Cursor cloned VS Code and sold the loop.  
Recoder already is the multi-agent loop.  
Telos is the **runtime those agents lacked**.
