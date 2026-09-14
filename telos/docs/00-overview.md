# 00 — Overview

This repo is **Recoder Cloud + Recoder Studio** (codename Telos) for [recoder.xyz](https://recoder.xyz).

Recoder desktop runs Claude Code, Codex, Cursor, OpenCode in parallel worktrees.  
This repo is the runtime those agents call.

| Surface | Ships | Does not ship |
|---|---|---|
| Recoder Cloud | preview URLs, staging, prod approve | a new IDE |
| Recoder Studio / Native | C# / C++ / Rust games, desktop + mobile | HTML5 / Phaser / Three.js toys |
| Playproof | tape + frames + judge | Unity Editor MCP |

## Read order

1. [../GOAL.md](../GOAL.md)
2. [../PLAN.md](../PLAN.md)
3. [01-architecture.md](./01-architecture.md)
4. [08-native-not-mcp.md](./08-native-not-mcp.md)
5. [09-protocol.md](./09-protocol.md)
6. [10-engines.md](./10-engines.md)
7. [12-daemon.md](./12-daemon.md)
8. [11-cook.md](./11-cook.md)
9. [04-playproof.md](./04-playproof.md)
10. [05-recoder-integration.md](./05-recoder-integration.md)
11. [02-licenses.md](./02-licenses.md)
12. [06-roadmap.md](./06-roadmap.md)
13. [13-security.md](./13-security.md)
14. [14-templates.md](./14-templates.md)

## One diagram

```
Claude / Codex / Recoder desktop
        │  MCP or CLI (Recoder-owned, 10 studio verbs + ship)
        v
   apps/api + apps/mcp
        │
        ├── Cloud: Coolify preview / staging / prod
        └── Native Runtime daemon
                ├── Bevy player (Rust)      default desktop
                ├── Godot C# player         default mobile
                ├── Unity CLI cook worker   later
                └── Unreal commandlet       last
```
