/**
 * `RouteProvider` — THE edge seam every one of the other 13 domains implements to
 * expose its HTTP (and optional MCP) surface WITHOUT importing express and calling
 * `app.use` itself. The edge composer walks the route table, consults each
 * provider's `health()` BEFORE mounting (degrade-safe: a `down` provider is
 * skipped and surfaced in edge health, never faked), then mounts `routes()` under
 * the provider's base path behind the one canonical middleware chain + guard.
 *
 * FROZEN CONTRACT — Phase 4 seam. The 13 downstream domains compile against this
 * shape while the concrete `edge-module.ts` composer is written. Do not widen or
 * narrow without a cross-domain migration.
 *
 * A provider exposes its surface one of two ways:
 *  - the common path: return an express `Router` from `routes()` (mounted under
 *    `basePath` or the domain's `DOMAIN_REGISTRY` mount base), OR
 *  - the escape hatch: implement `mount(app)` for the rare domain that needs raw
 *    app access (e.g. to attach its own sub-app). A provider MUST implement at
 *    least one of the two; the composer prefers `routes()`.
 */
import type { Application, Router } from 'express';
import type { McpToolRegistration } from '../../../shared/module-base.js';

/**
 * A single OpenAPI 3.1 operation a provider declares for the generated doc.
 * Deliberately thin (schemas stay opaque `unknown` here) — `http/openapi.ts`
 * (built later) walks these + the route table to assemble the document; a missing
 * or malformed spec degrades to a path listed without schema, never a crash.
 */
export interface OpenApiOperationSpec {
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Path relative to the provider's mount base (e.g. `/tasks/:id`). */
  readonly path: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  /** Zod (or JSON-Schema) request/response schema; converted by `openapi.ts`. */
  readonly requestSchema?: unknown;
  readonly responseSchema?: unknown;
}

/**
 * The truthful readiness a provider reports BEFORE it is mounted. `down` ⇒ the
 * composer skips the mount and records it in edge health (never a faked 200).
 */
export interface RouteProviderHealth {
  readonly status: 'up' | 'down';
  /** Required when `status === 'down'` — surfaced in `/health`. */
  readonly reason?: string;
}

/**
 * The contract every domain implements to expose edges through the composer.
 */
export interface RouteProvider {
  /** Stable domain key, e.g. `'agent-os'` — matches a `MountSpec.providerKey`. */
  readonly key: string;
  /**
   * Optional explicit base path. When omitted the composer uses the domain's
   * `DOMAIN_REGISTRY[key].mountBase`. Present for a provider that owns more than
   * one base or overrides the registry default.
   */
  readonly basePath?: string;
  /** The domain's mounted router (the common path). */
  routes(): Router;
  /** Escape hatch: mount directly onto the app (rare; prefer `routes()`). */
  mount?(app: Application): void;
  /** Optional MCP tools registered into the interop-gated MCP host. */
  mcp?(): readonly McpToolRegistration[];
  /** Optional OpenAPI operation specs for the generated doc. */
  openapi?(): readonly OpenApiOperationSpec[];
  /** Consulted BEFORE mounting — degrade-safe gate for the composer. */
  health(): RouteProviderHealth;
}
