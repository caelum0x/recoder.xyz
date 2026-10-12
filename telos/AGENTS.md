# AGENTS.md

Read GOAL.md, PLAN.md, docs/00-overview.md, docs/09-protocol.md, docs/10-engines.md.

## Hard rules

- Do not add Unity MCP or Unreal MCP servers to this repo.
- Do not add Phaser, Three.js, or HTML5 ship targets.
- Do not expose engine sockets on 0.0.0.0.
- Do not implement deploy.prod or store cook without approval_id.
- Do not expand past the 10 Native verbs.
- Godot first-party templates are C# only.
- Bevy and Godot C# before Unity.
- Playtest agent must not edit game code.

## Where to work

| Change | Path |
|---|---|
| Protocol types | packages/types |
| Bevy lane | packages/drivers/studio-bevy + templates/bevy-* |
| Godot C# lane | packages/drivers/studio-godot + templates/godot-cs-* |
| MCP | apps/mcp must mirror docs/09-protocol.md |
| Cook | packages/drivers/cook-* + docs/11-cook.md |
