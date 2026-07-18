/**
 * Persistence MCP tools (skeleton per the wiring checklist). Registered into the
 * interop-gated MCP host by the engines domain (Phase 6); every call passes the
 * interop chain + governance gate at the host boundary.
 *
 *  - `db_schema_inspect`  — read-only schema introspection for agents.
 *  - `db_query_readonly`  — SELECT-only, `:param`-bound, result-size capped.
 *
 * Phase 1 provides truthful handlers over the module surface. The full MCP
 * registration (`IN_PROC_SERVERS` + `ENGINE_SERVERS`) is wired by engines.
 *
 * TENANT SAFETY (SECURITY): these handlers reach the CONTROL-PLANE database,
 * which is multi-tenant. They MUST bind to the host-authorized
 * {@link McpToolCaller} (2nd handler arg) — never guess an identity — and refuse
 * (`AUTH_REQUIRED`) when no caller is threaded. `db_query_readonly` must NOT
 * expose a raw SELECT over the whole DB to a NON-privileged (edge/agent) caller:
 * free-form agent SQL cannot be safely tenant-scoped, so an agent read is
 * constrained to an explicit allowlist of tenant-scoped relations (fail-closed /
 * default-deny). A caller supplies no subject selector here, so there is no
 * args-named subject to honour.
 *
 * A TRUSTED `internal`/`admin` caller (a service or agent-os workflow acting on
 * behalf of the platform, not free-form model SQL) is exempted from the relation
 * allowlist and may run the raw read — mirroring the billing tool, where a
 * privileged caller may target an arbitrary subject. This keeps the tool live for
 * its legitimate internal callers instead of 403-ing every call while the agent
 * allowlist is still empty; it does NOT weaken the edge binding (a non-privileged
 * agent stays fail-closed). Tracking: enumerate the concrete tenant-scoped VIEWS
 * the agent allowlist needs (bd: persistence db_query_readonly agent allowlist).
 */
import { AppError, createError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { PersistenceModule } from './../index.js';

const MAX_ROWS = 500;

/**
 * Relations an agent's read query MAY reference — EMPTY BY DESIGN (fail-closed).
 *
 * The control-plane DB is multi-tenant and a free-form agent SELECT cannot be
 * safely row-scoped to the caller's tenant, so raw reads by a NON-privileged
 * (edge/agent) caller are denied until explicit tenant-scoped VIEWS are
 * enumerated here (a trusted `internal`/`admin` caller bypasses this — see the
 * file header). Each entry MUST be a view
 * that already constrains rows to the caller's tenant (or is non-tenant
 * reference/lookup data). Never add a raw multi-tenant table (e.g. `user`,
 * `secrets`, `agent_os.tasks`) — that reopens the cross-tenant read this guard
 * closes. Entries are matched lowercased and schema-qualified (`schema.view`).
 */
const ALLOWED_RELATIONS: ReadonlySet<string> = new Set<string>([]);

/**
 * Reject SQL carrying comment markers or a statement separator. Comments and
 * multiple statements are the classic evasions used to smuggle a non-allowlisted
 * relation past the reference scan, so a query that contains any of them is
 * refused outright rather than parsed heuristically.
 */
const UNSAFE_SQL_TOKENS = /--|\/\*|\*\/|;/;

/**
 * Extract every relation referenced after a `from`/`join` keyword, normalized to
 * a lowercased, unquoted, whitespace-free `schema.name` (or bare `name`). Used to
 * enforce {@link ALLOWED_RELATIONS}; a relation the scan misses can never satisfy
 * the "≥1 referenced AND all allowlisted" rule, so an empty allowlist denies all.
 */
const RELATION_RE = /\b(?:from|join)\s+("?[a-z_][\w$]*"?(?:\s*\.\s*"?[a-z_][\w$]*"?)?)/gi;

function referencedRelations(sql: string): readonly string[] {
  const found = new Set<string>();
  RELATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RELATION_RE.exec(sql)) !== null) {
    found.add(match[1].replace(/["\s]/g, '').toLowerCase());
  }
  return [...found];
}

interface QueryReadonlyInput {
  readonly sql?: string;
  readonly params?: Record<string, unknown>;
}

interface SchemaInspectInput {
  readonly schema?: string;
  readonly table?: string;
}

/**
 * Require a host-authorized caller and return it narrowed. Persistence tools
 * reach tenant-owned control-plane data, so an absent/empty caller identity is
 * refused (never guessed) — mirroring the billing MCP subject-resolution fix.
 */
function requireCaller(caller: McpToolCaller | undefined, ctx: string): McpToolCaller {
  const userId = typeof caller?.userId === 'string' ? caller.userId.trim() : '';
  if (!caller || !userId) {
    throw createError(ErrorCode.AUTH_REQUIRED, `${ctx}: no authorized caller identity`);
  }
  return caller;
}

/**
 * Does the caller carry an elevated scope? A TRUSTED `internal`/`admin` service
 * principal (not free-form agent SQL) is exempted from the relation allowlist and
 * may run the raw read — mirroring the billing tool's privileged-subject path.
 */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

export function buildPersistenceMcpTools(module: PersistenceModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'db_schema_inspect',
      description: 'Read-only introspection of control-plane tables/columns/indexes.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller, 'db_schema_inspect');
        const input = (raw ?? {}) as SchemaInspectInput;
        if (!module.executor().isAvailable()) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable');
        }
        const inspector = module.schema();
        if (input.schema && input.table) {
          const [columns, indexes] = await Promise.all([
            inspector.inspectColumns(input.schema, input.table),
            inspector.inspectIndexes(input.schema, input.table),
          ]);
          return { schema: input.schema, table: input.table, columns, indexes };
        }
        return { tables: await inspector.inspectTables() };
      },
    },
    {
      name: 'db_query_readonly',
      description: 'Run a SELECT over an allowlisted tenant-scoped view (:param-bound, size-capped).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authCaller = requireCaller(caller, 'db_query_readonly');
        const input = (raw ?? {}) as QueryReadonlyInput;
        const sql = (input.sql ?? '').trim();
        if (!sql) throw new AppError(ErrorCode.INVALID_INPUT, 'sql is required');
        if (!/^select\b/i.test(sql)) {
          throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'only SELECT queries are permitted');
        }
        if (UNSAFE_SQL_TOKENS.test(sql)) {
          throw new AppError(
            ErrorCode.INVALID_INPUT,
            'query must be a single SELECT statement without comments or separators',
          );
        }
        // Tenant safety: a NON-privileged (edge/agent) caller may reference ONLY
        // allowlisted tenant-scoped relations. Deny when it names none (nothing to
        // scope) or any relation outside the allowlist — the raw whole-DB read is
        // not exposed to agents. A TRUSTED internal/admin service principal is
        // exempted (it is not free-form agent SQL), so its raw read runs.
        if (!isPrivileged(authCaller)) {
          const relations = referencedRelations(sql);
          const disallowed = relations.filter((r) => !ALLOWED_RELATIONS.has(r));
          if (relations.length === 0 || disallowed.length > 0) {
            throw new AppError(
              ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
              'db_query_readonly: query may only read allowlisted tenant-scoped views',
            );
          }
        }
        if (!module.executor().isAvailable()) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable');
        }
        const rows = await module.executor().execute(sql, input.params ?? {});
        return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
      },
    },
  ];
}
