/**
 * @module recoder-envelope
 *
 * Zod schemas for the Recoder A2A wire envelope (`RecoderA2AEnvelope`) and its
 * payload union (`RecoderPayload`).
 *
 * This module is the single source of truth for *runtime* validation of the
 * envelope. The structural TypeScript interfaces still live in `../types.ts`;
 * this file derives runtime guards from those shapes via Zod so that the
 * compile-time and run-time contracts cannot drift apart.
 *
 * The hand-rolled validators in `../types.ts` delegate here. The public
 * `validate*` / `parse*` / `is*` API in `../types.ts` is unchanged: it keeps
 * the same names, signatures, and `RecoderEnvelopeValidationIssue[]` return
 * shape, but is now Zod-backed.
 *
 * Why a separate file:
 * - Keeps `types.ts` free of a hard dependency on Zod internals.
 * - Lets adapters/services import the schema directly when they want
 *   `safeParse` semantics instead of the issue-list facade.
 *
 * @example
 * ```ts
 * import { RecoderA2AEnvelopeSchema } from '@recoder/shared/a2a/schemas';
 *
 * const result = RecoderA2AEnvelopeSchema.safeParse(raw);
 * if (result.success) {
 *   // result.data is a fully-typed RecoderA2AEnvelope
 * }
 * ```
 */
import { z } from 'zod';
/** Enum schema for the closed set of Recoder agent platforms. */
export declare const RecoderAgentPlatformSchema: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
/**
 * Schema for `RecoderAgentIdentity`.
 *
 * `id`, `name`, and `platform` are required; the platform must be one of the
 * known platforms. Optional descriptive fields are validated when present but
 * not required.
 */
export declare const RecoderAgentIdentitySchema: z.ZodObject<{
    id: z.ZodEffects<z.ZodString, string, string>;
    name: z.ZodEffects<z.ZodString, string, string>;
    platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
    instanceId: z.ZodOptional<z.ZodString>;
    team: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
    instanceId?: string | undefined;
    team?: string | undefined;
    version?: string | undefined;
}, {
    id: string;
    name: string;
    platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
    instanceId?: string | undefined;
    team?: string | undefined;
    version?: string | undefined;
}>;
/** `{ kind: 'text'; text: string }` — a non-empty text part. */
export declare const RecoderTextPayloadSchema: z.ZodObject<{
    kind: z.ZodLiteral<"text">;
    text: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    kind: "text";
    text: string;
}, {
    kind: "text";
    text: string;
}>;
/** `{ kind: 'json'; data: Record<string, unknown> }` — a structured JSON part. */
export declare const RecoderJsonPayloadSchema: z.ZodObject<{
    kind: z.ZodLiteral<"json">;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    kind: "json";
    data: Record<string, unknown>;
}, {
    kind: "json";
    data: Record<string, unknown>;
}>;
/** `{ kind: 'command'; command: string; args?: string[]; cwd?: string }`. */
export declare const RecoderCommandPayloadSchema: z.ZodObject<{
    kind: z.ZodLiteral<"command">;
    command: z.ZodEffects<z.ZodString, string, string>;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "command";
    command: string;
    args?: string[] | undefined;
    cwd?: string | undefined;
}, {
    kind: "command";
    command: string;
    args?: string[] | undefined;
    cwd?: string | undefined;
}>;
/**
 * `{ kind: 'artifact'; artifactType; mimeType; content; path? }`.
 *
 * `artifactType` is tightened from the legacy "any non-empty string" check to
 * the closed literal union actually declared by `RecoderArtifactPayload`.
 */
export declare const RecoderArtifactPayloadSchema: z.ZodObject<{
    kind: z.ZodLiteral<"artifact">;
    artifactType: z.ZodEnum<["patch", "file", "plan", "report"]>;
    mimeType: z.ZodEffects<z.ZodString, string, string>;
    content: z.ZodEffects<z.ZodString, string, string>;
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "artifact";
    artifactType: "plan" | "patch" | "file" | "report";
    mimeType: string;
    content: string;
    path?: string | undefined;
}, {
    kind: "artifact";
    artifactType: "plan" | "patch" | "file" | "report";
    mimeType: string;
    content: string;
    path?: string | undefined;
}>;
/**
 * The tightened `RecoderPayload` discriminated union.
 *
 * Previously the wire envelope accepted `RecoderPayload[] | unknown[]`, so any
 * object with a `kind` string slipped through. This discriminated union closes
 * that hole: the `kind` discriminant must be one of the four known literals and
 * each branch is validated against its own shape.
 */
export declare const RecoderPayloadSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"text">;
    text: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    kind: "text";
    text: string;
}, {
    kind: "text";
    text: string;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"json">;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    kind: "json";
    data: Record<string, unknown>;
}, {
    kind: "json";
    data: Record<string, unknown>;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"command">;
    command: z.ZodEffects<z.ZodString, string, string>;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "command";
    command: string;
    args?: string[] | undefined;
    cwd?: string | undefined;
}, {
    kind: "command";
    command: string;
    args?: string[] | undefined;
    cwd?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"artifact">;
    artifactType: z.ZodEnum<["patch", "file", "plan", "report"]>;
    mimeType: z.ZodEffects<z.ZodString, string, string>;
    content: z.ZodEffects<z.ZodString, string, string>;
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "artifact";
    artifactType: "plan" | "patch" | "file" | "report";
    mimeType: string;
    content: string;
    path?: string | undefined;
}, {
    kind: "artifact";
    artifactType: "plan" | "patch" | "file" | "report";
    mimeType: string;
    content: string;
    path?: string | undefined;
}>]>;
/** Inferred type for a single payload part. Structurally equals `RecoderPayload`. */
export type RecoderPayloadInput = z.infer<typeof RecoderPayloadSchema>;
/** Schema for the optional W3C-style trace context. */
export declare const RecoderEnvelopeTraceSchema: z.ZodObject<{
    traceId: z.ZodEffects<z.ZodString, string, string>;
    parentMessageId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    traceId: string;
    parentMessageId?: string | undefined;
}, {
    traceId: string;
    parentMessageId?: string | undefined;
}>;
/**
 * Canonical Zod schema for `RecoderA2AEnvelope` (non-strict version check).
 *
 * This is the schema exported for direct consumption. Version fields are
 * required but not pinned to the canonical constant; use
 * {@link RecoderA2AEnvelopeStrictSchema} when exact version pinning is needed.
 */
export declare const RecoderA2AEnvelopeSchema: z.ZodObject<{
    envelopeVersion: z.ZodEffects<z.ZodString, string, string> | z.ZodLiteral<"2026-02-14">;
    protocolVersion: z.ZodEffects<z.ZodString, string, string> | z.ZodLiteral<"0.3.0">;
    messageId: z.ZodEffects<z.ZodString, string, string>;
    threadId: z.ZodEffects<z.ZodString, string, string>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    from: z.ZodObject<{
        id: z.ZodEffects<z.ZodString, string, string>;
        name: z.ZodEffects<z.ZodString, string, string>;
        platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
        instanceId: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }>;
    to: z.ZodObject<{
        id: z.ZodEffects<z.ZodString, string, string>;
        name: z.ZodEffects<z.ZodString, string, string>;
        platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
        instanceId: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }>;
    intent: z.ZodEnum<["plan", "execute", "review", "handoff", "status", "sync", "tool_call", "tool_result", "error"]>;
    payload: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "text";
        text: string;
    }, {
        kind: "text";
        text: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"json">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        kind: "json";
        data: Record<string, unknown>;
    }, {
        kind: "json";
        data: Record<string, unknown>;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"command">;
        command: z.ZodEffects<z.ZodString, string, string>;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cwd: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    }, {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"artifact">;
        artifactType: z.ZodEnum<["patch", "file", "plan", "report"]>;
        mimeType: z.ZodEffects<z.ZodString, string, string>;
        content: z.ZodEffects<z.ZodString, string, string>;
        path: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    }, {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    }>]>, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    trace: z.ZodOptional<z.ZodObject<{
        traceId: z.ZodEffects<z.ZodString, string, string>;
        parentMessageId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        traceId: string;
        parentMessageId?: string | undefined;
    }, {
        traceId: string;
        parentMessageId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    to: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    intent: "plan" | "execute" | "review" | "handoff" | "status" | "sync" | "tool_call" | "tool_result" | "error";
    payload: ({
        kind: "text";
        text: string;
    } | {
        kind: "json";
        data: Record<string, unknown>;
    } | {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    } | {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    })[];
    metadata?: Record<string, unknown> | undefined;
    trace?: {
        traceId: string;
        parentMessageId?: string | undefined;
    } | undefined;
}, {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    to: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    intent: "plan" | "execute" | "review" | "handoff" | "status" | "sync" | "tool_call" | "tool_result" | "error";
    payload: ({
        kind: "text";
        text: string;
    } | {
        kind: "json";
        data: Record<string, unknown>;
    } | {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    } | {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    })[];
    metadata?: Record<string, unknown> | undefined;
    trace?: {
        traceId: string;
        parentMessageId?: string | undefined;
    } | undefined;
}>;
/**
 * Strict variant of {@link RecoderA2AEnvelopeSchema} that additionally pins the
 * envelope/protocol versions to the canonical constants. Used when callers pass
 * `{ strictVersion: true }`.
 */
export declare const RecoderA2AEnvelopeStrictSchema: z.ZodObject<{
    envelopeVersion: z.ZodEffects<z.ZodString, string, string> | z.ZodLiteral<"2026-02-14">;
    protocolVersion: z.ZodEffects<z.ZodString, string, string> | z.ZodLiteral<"0.3.0">;
    messageId: z.ZodEffects<z.ZodString, string, string>;
    threadId: z.ZodEffects<z.ZodString, string, string>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    from: z.ZodObject<{
        id: z.ZodEffects<z.ZodString, string, string>;
        name: z.ZodEffects<z.ZodString, string, string>;
        platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
        instanceId: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }>;
    to: z.ZodObject<{
        id: z.ZodEffects<z.ZodString, string, string>;
        name: z.ZodEffects<z.ZodString, string, string>;
        platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
        instanceId: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }>;
    intent: z.ZodEnum<["plan", "execute", "review", "handoff", "status", "sync", "tool_call", "tool_result", "error"]>;
    payload: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "text";
        text: string;
    }, {
        kind: "text";
        text: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"json">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        kind: "json";
        data: Record<string, unknown>;
    }, {
        kind: "json";
        data: Record<string, unknown>;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"command">;
        command: z.ZodEffects<z.ZodString, string, string>;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cwd: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    }, {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"artifact">;
        artifactType: z.ZodEnum<["patch", "file", "plan", "report"]>;
        mimeType: z.ZodEffects<z.ZodString, string, string>;
        content: z.ZodEffects<z.ZodString, string, string>;
        path: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    }, {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    }>]>, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    trace: z.ZodOptional<z.ZodObject<{
        traceId: z.ZodEffects<z.ZodString, string, string>;
        parentMessageId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        traceId: string;
        parentMessageId?: string | undefined;
    }, {
        traceId: string;
        parentMessageId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    to: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    intent: "plan" | "execute" | "review" | "handoff" | "status" | "sync" | "tool_call" | "tool_result" | "error";
    payload: ({
        kind: "text";
        text: string;
    } | {
        kind: "json";
        data: Record<string, unknown>;
    } | {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    } | {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    })[];
    metadata?: Record<string, unknown> | undefined;
    trace?: {
        traceId: string;
        parentMessageId?: string | undefined;
    } | undefined;
}, {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    to: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    intent: "plan" | "execute" | "review" | "handoff" | "status" | "sync" | "tool_call" | "tool_result" | "error";
    payload: ({
        kind: "text";
        text: string;
    } | {
        kind: "json";
        data: Record<string, unknown>;
    } | {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    } | {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    })[];
    metadata?: Record<string, unknown> | undefined;
    trace?: {
        traceId: string;
        parentMessageId?: string | undefined;
    } | undefined;
}>;
/** Inferred type for a validated envelope. Structurally equals `RecoderA2AEnvelope`. */
export type RecoderA2AEnvelopeInput = z.infer<typeof RecoderA2AEnvelopeSchema>;
/**
 * Select the appropriate envelope schema for the given options.
 *
 * @param strictVersion - When true, pins version fields to canonical values.
 */
export declare function getRecoderA2AEnvelopeSchema(strictVersion: boolean): z.ZodObject<{
    envelopeVersion: z.ZodEffects<z.ZodString, string, string> | z.ZodLiteral<"2026-02-14">;
    protocolVersion: z.ZodEffects<z.ZodString, string, string> | z.ZodLiteral<"0.3.0">;
    messageId: z.ZodEffects<z.ZodString, string, string>;
    threadId: z.ZodEffects<z.ZodString, string, string>;
    createdAt: z.ZodEffects<z.ZodString, string, string>;
    from: z.ZodObject<{
        id: z.ZodEffects<z.ZodString, string, string>;
        name: z.ZodEffects<z.ZodString, string, string>;
        platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
        instanceId: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }>;
    to: z.ZodObject<{
        id: z.ZodEffects<z.ZodString, string, string>;
        name: z.ZodEffects<z.ZodString, string, string>;
        platform: z.ZodEnum<["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"]>;
        instanceId: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }, {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    }>;
    intent: z.ZodEnum<["plan", "execute", "review", "handoff", "status", "sync", "tool_call", "tool_result", "error"]>;
    payload: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "text";
        text: string;
    }, {
        kind: "text";
        text: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"json">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        kind: "json";
        data: Record<string, unknown>;
    }, {
        kind: "json";
        data: Record<string, unknown>;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"command">;
        command: z.ZodEffects<z.ZodString, string, string>;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cwd: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    }, {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"artifact">;
        artifactType: z.ZodEnum<["patch", "file", "plan", "report"]>;
        mimeType: z.ZodEffects<z.ZodString, string, string>;
        content: z.ZodEffects<z.ZodString, string, string>;
        path: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    }, {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    }>]>, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    trace: z.ZodOptional<z.ZodObject<{
        traceId: z.ZodEffects<z.ZodString, string, string>;
        parentMessageId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        traceId: string;
        parentMessageId?: string | undefined;
    }, {
        traceId: string;
        parentMessageId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    to: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    intent: "plan" | "execute" | "review" | "handoff" | "status" | "sync" | "tool_call" | "tool_result" | "error";
    payload: ({
        kind: "text";
        text: string;
    } | {
        kind: "json";
        data: Record<string, unknown>;
    } | {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    } | {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    })[];
    metadata?: Record<string, unknown> | undefined;
    trace?: {
        traceId: string;
        parentMessageId?: string | undefined;
    } | undefined;
}, {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    to: {
        id: string;
        name: string;
        platform: "recoder" | "cursor" | "windsurf" | "replit" | "codex" | "claude_code" | "recoder_app" | "recoder_pm" | "recoder_agency" | "recoder_backend" | "recoder_desktop" | "custom";
        instanceId?: string | undefined;
        team?: string | undefined;
        version?: string | undefined;
    };
    intent: "plan" | "execute" | "review" | "handoff" | "status" | "sync" | "tool_call" | "tool_result" | "error";
    payload: ({
        kind: "text";
        text: string;
    } | {
        kind: "json";
        data: Record<string, unknown>;
    } | {
        kind: "command";
        command: string;
        args?: string[] | undefined;
        cwd?: string | undefined;
    } | {
        kind: "artifact";
        artifactType: "plan" | "patch" | "file" | "report";
        mimeType: string;
        content: string;
        path?: string | undefined;
    })[];
    metadata?: Record<string, unknown> | undefined;
    trace?: {
        traceId: string;
        parentMessageId?: string | undefined;
    } | undefined;
}>;
/** Local literal sets exported for the drift guards to compare against. */
export declare const __PLATFORMS: readonly ["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"];
export declare const __INTENTS: readonly ["plan", "execute", "review", "handoff", "status", "sync", "tool_call", "tool_result", "error"];
export declare const __ENVELOPE_VERSION = "2026-02-14";
export declare const __PROTOCOL_VERSION = "0.3.0";
