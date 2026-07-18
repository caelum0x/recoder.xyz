/**
 * `DomainModule` — the shape every one of the 14 domains returns from its
 * `create<Domain>Module(deps)` factory.
 *
 * ARCHITECTURE §3: each domain is a pure factory returning a composer that
 * exposes a single public interface plus a truthful `health()`. This is the
 * minimal common base: a name, a health probe, optional edge/MCP surfaces, and
 * optional lifecycle hooks. Domain-specific methods live on the concrete module
 * interface that extends this.
 */
import type { Router } from 'express';
import type { ComponentHealth, HealthSource } from './health-types.js';

/**
 * The host-authorized caller identity threaded to a tool handler. The MCP host
 * gates the CALL at its boundary; this is the SAME authorized principal, surfaced
 * to the handler so a mutation can be bound to *who is calling* rather than to
 * free-form model output. Absent ⇒ the handler must refuse (never guess identity).
 *
 * SECURITY: handlers that mutate tenant-owned state MUST derive their subject from
 * this caller — not from their own `args` — and only honour an args-named subject
 * for a caller carrying an `admin`/`internal` scope.
 */
export interface McpToolCaller {
  /** Canonical owner id of the authorized caller (`Principal.userId`). */
  readonly userId: string;
  /** Optional organization scope of the caller (`Principal.orgId`). */
  readonly orgId?: string;
  /** Granted scope strings (e.g. `['read','write','admin','internal']`). */
  readonly scopes?: readonly string[];
}

/**
 * A minimal MCP tool registration descriptor. The full contract is owned by
 * `@recoder/agent-mcp`; the spine only needs the opaque shape so a module can
 * declare tools without the edge importing the MCP package. Widened later.
 *
 * The optional second `caller` argument carries the host-authorized identity (see
 * {@link McpToolCaller}); handlers that ignore it keep their single-arg shape.
 */
export interface McpToolRegistration {
  readonly name: string;
  readonly description?: string;
  readonly handler: (input: unknown, caller?: McpToolCaller) => Promise<unknown> | unknown;
}

/**
 * The base every domain module implements. Composers may extend this with
 * domain methods; the edge/bootstrap only rely on this base.
 */
export interface DomainModule extends HealthSource {
  /** Stable domain key, e.g. `'edge'` — matches {@link DomainKey}. */
  readonly name: string;
  /** Truthful component health (inherited from HealthSource). */
  health(): ComponentHealth | Promise<ComponentHealth>;
  /** Optional express router the edge mounts under the domain's base path. */
  routes?(): Router;
  /** Optional MCP tools registered into the interop-gated host. */
  mcp?(): readonly McpToolRegistration[];
  /** Optional start hook (open pools, spawn supervisors) — idempotent. */
  start?(): Promise<void> | void;
  /** Optional stop hook (drain, close) — idempotent, degrade-safe. */
  stop?(): Promise<void> | void;
}

/** Alias kept for readability at call sites that talk about "a module". */
export type ModuleBase = DomainModule;

/** Type guard: does a module expose an express router? */
export function hasRoutes(module: DomainModule): module is DomainModule & { routes(): Router } {
  return typeof module.routes === 'function';
}

/** Type guard: does a module expose MCP tools? */
export function hasMcp(
  module: DomainModule,
): module is DomainModule & { mcp(): readonly McpToolRegistration[] } {
  return typeof module.mcp === 'function';
}
