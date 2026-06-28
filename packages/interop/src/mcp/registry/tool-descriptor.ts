/**
 * An MCP tool descriptor as *advertised* by a server.
 *
 * CRITICAL TRUST NOTE: a `ToolDescriptor` is UNTRUSTED. It is whatever an MCP
 * server — possibly an external, unowned process (e.g. `py/pal-mcp-server`) —
 * claims about itself over the wire. Per `.claude/rules/security.md` ("Never
 * trust: MCP tool descriptions"), nothing here may reach the registry, the
 * policy engine, or an agent until {@link validateToolDescriptor} has proven its
 * shape and sanitized its self-description. The fields are deliberately typed as
 * `unknown`-derived-after-validation, not pre-validated.
 */
export interface ToolDescriptor {
  /** The tool's invocation name. Must be a non-empty, bounded, safe identifier. */
  readonly name: string;
  /** Human-facing description. Sanitized + length-capped before exposure. */
  readonly description: string;
  /** JSON-Schema-shaped input contract (an object, not validated as a full schema here). */
  readonly inputSchema?: Record<string, unknown>;
}

/** A resource descriptor advertised by an MCP server (also untrusted). */
export interface ResourceDescriptor {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string;
}

/** A prompt descriptor advertised by an MCP server (also untrusted). */
export interface PromptDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly arguments?: ReadonlyArray<{ readonly name: string; readonly required?: boolean }>;
}
