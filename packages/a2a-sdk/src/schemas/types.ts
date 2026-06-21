/**
 * @module types
 *
 * Inlined types from @recoder/shared/a2a that are needed by the schema modules.
 * These are bundled directly in the SDK to avoid a dependency on the private
 * @recoder/shared workspace package.
 */

// ---------------------------------------------------------------------------
// Agent platform
// ---------------------------------------------------------------------------

export type RecoderAgentPlatform =
  | 'recoder'
  | 'cursor'
  | 'windsurf'
  | 'replit'
  | 'codex'
  | 'claude_code'
  | 'recoder_app'
  | 'recoder_pm'
  | 'recoder_agency'
  | 'recoder_backend'
  | 'recoder_desktop'
  | 'custom';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface RecoderTextPayload {
  kind: 'text';
  text: string;
}

export interface RecoderJsonPayload {
  kind: 'json';
  data: Record<string, unknown>;
}

export interface RecoderCommandPayload {
  kind: 'command';
  command: string;
  args?: string[];
  cwd?: string;
}

export interface RecoderArtifactPayload {
  kind: 'artifact';
  artifactType:
    | 'patch'
    | 'file'
    | 'plan'
    | 'report'
    | 'log'
    | 'pull_request'
    | 'preview'
    | 'screenshot'
    | 'verification'
    | 'custom';
  mimeType: string;
  content: string;
  path?: string;
}

export type RecoderPayload =
  | RecoderTextPayload
  | RecoderJsonPayload
  | RecoderCommandPayload
  | RecoderArtifactPayload;

// ---------------------------------------------------------------------------
// Protocol kinds
// ---------------------------------------------------------------------------

export type A2AProtocolKind = 'a2a' | 'mcp' | 'jsonrpc' | 'rest' | 'file_git';

// ---------------------------------------------------------------------------
// Canonical task state (from control-plane)
// ---------------------------------------------------------------------------

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'cancelled';
