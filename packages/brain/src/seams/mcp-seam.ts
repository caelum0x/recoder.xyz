/**
 * Brain MCP seam — the pure, SDK-agnostic core of the Brain's stdio MCP server.
 *
 * This module turns a {@link Brain} into a small set of MCP tools WITHOUT
 * touching the transport or the `@modelcontextprotocol/sdk` `Server`. Each tool
 * is a `{ name, description, readOnly, inputSchema, handler }` record; the
 * handler validates its arguments at the boundary and maps Brain output into an
 * MCP `CallToolResult`-shaped value (`{ content: [...text], isError? }`). The
 * SDK wiring (`mcp-server.ts`) is a thin shell over these, so the whole mapping
 * is unit-testable with a fake Brain and zero process/stdio.
 *
 * Doctrine (mirrors the rest of the Brain):
 *  - READ-MOSTLY: `brain_assemble` and `brain_recall` are read-only.
 *  - GOVERNANCE: `brain_record` NEVER writes durable memory. A `memory` record
 *    is emitted as a reviewable CANDIDATE (evidence-backed, not persisted); only
 *    a `task` record is applied (to the beads task graph, itself degrade-safe).
 *  - DEGRADE-SAFE: missing adapters/keys yield empty sections, never errors. The
 *    server keeps responding; `brain_assemble` reports which sections degraded.
 *  - FAIL-SAFE: a handler never throws — unexpected failures become an `isError`
 *    result so one bad call can't take the server down.
 */

import type { Brain } from "../brain";

/** One MCP `CallToolResult` — text content plus an optional error flag. */
export interface BrainToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** A single Brain MCP tool: schema + a boundary-validating handler. */
export interface BrainTool {
  /** Tool name as seen over MCP (e.g. `brain_assemble`). */
  readonly name: string;
  /** Human/agent-facing description. */
  readonly description: string;
  /** True for `assemble`/`recall`; false for `record` (candidate/task write). */
  readonly readOnly: boolean;
  /** JSON Schema for the tool's arguments. */
  readonly inputSchema: Record<string, unknown>;
  /** Run the tool. Validates args, never throws (fail-safe). */
  readonly handler: (args: Record<string, unknown>) => Promise<BrainToolResult>;
}

// ---------------------------------------------------------------------------
// Boundary helpers (validate untrusted MCP arguments; fail fast, never throw)
// ---------------------------------------------------------------------------

function ok(value: unknown): BrainToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function fail(message: string): BrainToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

function asString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((v): v is string => typeof v === "string");
}

function asLimit(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}

function asMetadata(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = args[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Degradation reporting (which fused sections came back empty)
// ---------------------------------------------------------------------------

/** True when the repo context pack carries no real source references. */
function isRepoDegraded(repo: unknown): boolean {
  if (!repo || typeof repo !== "object") {
    return true;
  }
  const refs = (repo as { sourceRefs?: unknown }).sourceRefs;
  return !Array.isArray(refs) || refs.length === 0;
}

/**
 * Compute which fused sections are degraded (empty). An empty section is the
 * degrade-safe signal that its adapter/key/tool was absent or returned nothing —
 * the call still succeeds, callers just learn richness was missing.
 */
function degradedSections(ctx: {
  repo: unknown;
  memories: unknown[];
  docs: unknown[];
  tasks: unknown[];
  activity: { recent: unknown[]; profile: unknown };
}): string[] {
  const degraded: string[] = [];
  if (isRepoDegraded(ctx.repo)) {
    degraded.push("repo");
  }
  if (ctx.memories.length === 0) {
    degraded.push("memories");
  }
  if (ctx.docs.length === 0) {
    degraded.push("docs");
  }
  if (ctx.tasks.length === 0) {
    degraded.push("tasks");
  }
  if (ctx.activity.recent.length === 0 && ctx.activity.profile === null) {
    degraded.push("activity");
  }
  return degraded;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/** Tool names, exported so the server/tests reference them without magic strings. */
export const BRAIN_TOOL_NAMES = {
  assemble: "brain_assemble",
  recall: "brain_recall",
  record: "brain_record",
  activity: "brain_activity",
} as const;

/**
 * Build the Brain's MCP tools over a given {@link Brain}. Pure: no transport, no
 * process state — just schema + handlers that map Brain output to MCP results.
 */
export function createBrainTools(brain: Brain): BrainTool[] {
  const assemble: BrainTool = {
    name: BRAIN_TOOL_NAMES.assemble,
    description:
      "Assemble the fused Brain context ONCE for a repo/task and reuse it: repo " +
      "intelligence + prior memories + docs + task graph + desktop activity, plus " +
      "a `degraded[]` list of sections whose adapter was absent. Read-only.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The task/prompt driving this run." },
        repoRoot: { type: "string", description: "Absolute repo root to index." },
        focusFiles: {
          type: "array",
          items: { type: "string" },
          description: "Optional files the agent is focused on.",
        },
        limit: {
          type: "number",
          description: "Max items per source (optional).",
        },
      },
      required: ["task", "repoRoot"],
    },
    handler: async (args) => {
      const task = asString(args, "task");
      if (!task) {
        return fail("`task` is required and must be a non-empty string.");
      }
      const repoRoot = asString(args, "repoRoot");
      if (!repoRoot) {
        return fail("`repoRoot` is required and must be a non-empty string.");
      }
      try {
        const ctx = await brain.assemble({
          task,
          repoRoot,
          focusFiles: asStringArray(args, "focusFiles"),
          limit: asLimit(args, "limit"),
        });
        return ok({ ...ctx, degraded: degradedSections(ctx) });
      } catch (error) {
        return fail(
          error instanceof Error ? error.message : "assemble failed unexpectedly.",
        );
      }
    },
  };

  const recall: BrainTool = {
    name: BRAIN_TOOL_NAMES.recall,
    description:
      "Focused semantic recall of prior memories for a query — no full assemble. " +
      "Read-only. Degrades to [] when no memory adapter is configured.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to recall memories about." },
        limit: { type: "number", description: "Max memories to return (optional)." },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const query = asString(args, "query");
      if (!query) {
        return fail("`query` is required and must be a non-empty string.");
      }
      try {
        const memories = await brain.recall(query, asLimit(args, "limit") ?? 8);
        return ok({ memories, degraded: memories.length === 0 ? ["memories"] : [] });
      } catch (error) {
        return fail(
          error instanceof Error ? error.message : "recall failed unexpectedly.",
        );
      }
    },
  };

  const record: BrainTool = {
    name: BRAIN_TOOL_NAMES.record,
    description:
      "Record an agent outcome. A `memory` record is emitted as a reviewable, " +
      "evidence-backed CANDIDATE (NOT durable — never written directly, per " +
      "governance). A `task` record applies a status update to the beads task " +
      "graph (degrade-safe no-op when unavailable). Write tool.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["memory", "task"] },
        text: {
          type: "string",
          description: "Memory text (kind=memory).",
        },
        evidence: {
          type: "string",
          description: "Evidence supporting the memory candidate (kind=memory).",
        },
        metadata: {
          type: "object",
          description: "Optional metadata for the memory candidate (kind=memory).",
        },
        id: { type: "string", description: "Task id (kind=task)." },
        status: { type: "string", description: "New task status (kind=task)." },
        note: { type: "string", description: "Optional task note (kind=task)." },
      },
      required: ["kind"],
    },
    handler: async (args) => {
      const kind = asString(args, "kind");
      if (kind !== "memory" && kind !== "task") {
        return fail("`kind` must be 'memory' or 'task'.");
      }

      if (kind === "memory") {
        const text = asString(args, "text");
        if (!text) {
          return fail("`text` is required for a memory record.");
        }
        // GOVERNANCE: never write durable memory directly. Emit a candidate.
        const candidate = {
          kind: "memory" as const,
          text,
          evidence: asString(args, "evidence") ?? undefined,
          metadata: asMetadata(args, "metadata"),
          proposedAt: new Date().toISOString(),
        };
        return ok({
          durable: false,
          candidate,
          note:
            "Memory candidate emitted for review — NOT written to durable memory. " +
            "Promote it through the reviewed memory-candidate lifecycle.",
        });
      }

      const id = asString(args, "id");
      if (!id) {
        return fail("`id` is required for a task record.");
      }
      const status = asString(args, "status");
      if (!status) {
        return fail("`status` is required for a task record.");
      }
      try {
        await brain.record({
          kind: "task",
          id,
          status,
          note: asString(args, "note") ?? undefined,
        });
        return ok({
          durable: true,
          applied: { kind: "task", id, status },
          note: "Task update applied to the task graph (degrade-safe no-op if unavailable).",
        });
      } catch (error) {
        return fail(
          error instanceof Error ? error.message : "task record failed unexpectedly.",
        );
      }
    },
  };

  const activity: BrainTool = {
    name: BRAIN_TOOL_NAMES.activity,
    description:
      "Focused desktop/agent activity lookup (no full assemble). Read-only. Without a " +
      "`query`: returns the user's recent activity (newest-first, deduped) + a one-line " +
      "'who is this user' snapshot — grounded in the owned continuum (incl. the agent's own " +
      "session actions). With a `query`: grounded Q&A over activity — evidence `sources` " +
      "(always) + a synthesized `answer` when an LLM is configured. Degrades to empty when no " +
      "activity adapter is wired.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Optional. Omit for the recent-activity view; provide for grounded Q&A over activity.",
        },
        limit: {
          type: "number",
          description: "Max activity rows (optional).",
        },
      },
    },
    handler: async (args) => {
      const query = asString(args, "query");
      const limit = asLimit(args, "limit") ?? 8;
      try {
        if (query) {
          const result = await brain.answerActivity(query, limit);
          return ok({
            answer: result.answer,
            sources: result.sources,
            degraded: result.sources.length === 0 && result.answer === null ? ["activity"] : [],
          });
        }
        const [recent, snapshot] = await Promise.all([
          brain.recentActivity(limit),
          brain.activitySnapshot(),
        ]);
        return ok({
          recent,
          snapshot,
          degraded: recent.length === 0 && snapshot === null ? ["activity"] : [],
        });
      } catch (error) {
        return fail(
          error instanceof Error ? error.message : "activity lookup failed unexpectedly.",
        );
      }
    },
  };

  return [assemble, recall, record, activity];
}
