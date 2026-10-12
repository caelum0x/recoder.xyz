# 04 — Playproof

A game revision is not mergeable, and not cookable (default policy), without a Playproof.

Playproof is not “open the editor and look.” It is a recorded run of the compiled player.

## Artifact

```
play/
  tape.yaml
  clip.mp4
  last.png
  world.json
  frames/
  report.json
```

Tape schema: `schemas/playproof.schema.yaml`.

## Deterministic checks

| Check | Pass if |
|---|---|
| `process_alive` | player still running at end of tape |
| `pixels_changed` | mean abs diff first vs last frame > threshold |
| `no_red_console` | no panic / exception in player.log |
| `world_moved` | entity x,y changed when tape has motion |
| `tick_advanced` | world.tick increased |

## VLM (second)

Last frame + 6 samples + user intent. Questions: visible playfield? input did something? prototype matches prompt? yes/no + one sentence. Do not score “fun.”

## Two agents

- `game-author` writes code, calls build + tick. Does not write report.json.
- `game-playtest` only reads clip/world/logs and writes report.json.
- `game-cook` runs only if report.ok == true.

## Refuse

- Unity Game view as proof
- Agent grading its own clip
- HTML canvas screenshot as Native Playproof
