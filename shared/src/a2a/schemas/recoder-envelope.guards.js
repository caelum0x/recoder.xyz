"use strict";
/**
 * @module recoder-envelope.guards
 *
 * Compile-time drift guards for the Recoder envelope Zod schemas.
 *
 * This module contains only `import type` declarations and type-level
 * assertions. It emits no runtime code and creates no runtime import cycle, so
 * it is safe even though it references both `../types` and `./recoder-envelope`
 * (which themselves form a one-way runtime dependency: `../types` -> here).
 *
 * If `../types.ts` changes a payload shape, an agent platform, an intent, or a
 * pinned version, one of the assertions below stops type-checking and `tsc`
 * fails -- guaranteeing the Zod schemas never silently drift from the canonical
 * TypeScript interfaces.
 *
 * There is no reason to import this module at runtime; importing it is a no-op.
 */
Object.defineProperty(exports, "__esModule", { value: true });
