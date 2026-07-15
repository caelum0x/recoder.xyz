/**
 * `buildOpenApiDocument` — the route table → a minimal OpenAPI 3.1 document. It
 * walks the resolved mounts and each provider's optional `openapi()` operation
 * specs, joining a provider's mount base with each operation's relative path.
 *
 * Deliberately thin + degrade-safe (never throws on bad input, per the
 * `OpenApiOperationSpec` contract): a provider with no `openapi()` contributes a
 * bare path stub for its base (so the surface is still discoverable), a malformed
 * op is skipped, and request/response schemas are passed through opaquely (schema
 * conversion is out of scope here). The document is derived data — no express, no
 * runtime coupling — so it can be served or written to disk by any caller.
 */
import type { ResolvedMount, RouteTable } from '../domains/edge/route-table.js';
import type { OpenApiOperationSpec } from '../domains/edge/ports/route-provider.port.js';

/** A single OpenAPI operation object (minimal subset). */
export interface OpenApiOperation {
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly requestBody?: { readonly content: Record<string, { readonly schema: unknown }> };
  readonly responses: Record<string, { readonly description: string; readonly content?: Record<string, { readonly schema: unknown }> }>;
}

/** A path item: methods → operations. */
export type OpenApiPathItem = Partial<Record<OpenApiOperationSpec['method'], OpenApiOperation>>;

/** The generated document (OpenAPI 3.1 subset). */
export interface OpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<string, OpenApiPathItem>;
}

export interface OpenApiInput {
  readonly title: string;
  readonly version: string;
  readonly table: RouteTable;
}

const HTTP_METHODS: ReadonlySet<string> = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** Join a mount base with an operation's relative path into one clean URL path. */
function joinPath(base: string, rel: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const r = rel.startsWith('/') ? rel : `/${rel}`;
  const joined = `${b}${r}`;
  return joined.length > 0 ? joined : '/';
}

/** Is this a well-formed operation spec we can safely emit? */
function isValidOp(op: unknown): op is OpenApiOperationSpec {
  if (typeof op !== 'object' || op === null) return false;
  const candidate = op as { method?: unknown; path?: unknown };
  return (
    typeof candidate.method === 'string' &&
    HTTP_METHODS.has(candidate.method) &&
    typeof candidate.path === 'string'
  );
}

/** Convert one validated op spec into an OpenAPI operation object. */
function toOperation(op: OpenApiOperationSpec): OpenApiOperation {
  return {
    ...(op.summary ? { summary: op.summary } : {}),
    ...(op.tags ? { tags: op.tags } : {}),
    ...(op.requestSchema !== undefined
      ? { requestBody: { content: { 'application/json': { schema: op.requestSchema } } } }
      : {}),
    responses: {
      '200': {
        description: 'OK',
        ...(op.responseSchema !== undefined
          ? { content: { 'application/json': { schema: op.responseSchema } } }
          : {}),
      },
    },
  };
}

/** Safely pull a provider's op specs (a thrown/invalid `openapi()` yields none). */
function providerOps(mount: ResolvedMount): readonly OpenApiOperationSpec[] {
  const fn = mount.provider.openapi;
  if (typeof fn !== 'function') return [];
  try {
    const specs = fn.call(mount.provider);
    return Array.isArray(specs) ? specs.filter(isValidOp) : [];
  } catch {
    return [];
  }
}

/** Assemble the minimal OpenAPI document from the route table. */
export function buildOpenApiDocument(input: OpenApiInput): OpenApiDocument {
  const paths: Record<string, OpenApiPathItem> = {};

  for (const mount of input.table.mounts) {
    const ops = providerOps(mount);

    if (ops.length === 0) {
      // No declared ops — still surface the mount base as a discoverable stub.
      const stub = joinPath(mount.spec.base, '/');
      if (!paths[stub]) paths[stub] = {};
      continue;
    }

    for (const op of ops) {
      const fullPath = joinPath(mount.spec.base, op.path);
      const item: OpenApiPathItem = paths[fullPath] ?? {};
      item[op.method] = toOperation(op);
      paths[fullPath] = item;
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: input.title, version: input.version },
    paths,
  };
}
