/**
 * Backward-compatible barrel.
 *
 * The Brain's types now live in `domain/` (data shapes, no IO) and `ports/`
 * (the source contracts bound to the owned mem0 / context7 / beads / git-nexus).
 * This file re-exports them so existing `./types` imports keep working while the
 * subsystem grows into the structure described in docs/subsystems/brain.md.
 */
export type * from "./domain";
export type * from "./ports";
