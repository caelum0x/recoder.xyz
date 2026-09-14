# 01 — Architecture

```
 Recoder desktop / Claude Code / Codex
                  |
          apps/mcp  +  apps/cli
                  |
               apps/api
          policy, audit, quotas
                  |
     +------------+-------------+
     |                          |
 Recoder Cloud              Recoder Native
 Coolify / Kamal            recoder-native-d
 preview / staging / prod   Bevy | Godot C# | Unity cook
     |                          |
  preview URL               player tick + Playproof + AAB
```

Studios are long-lived volumes plus a daemon. Sandboxes are short-lived Linux boxes for non-game apps. They do not share a network namespace with a Native player.

See 09-protocol.md, 12-daemon.md, 10-engines.md.
