/**
 * @recoder/conductor-ui — the web front door for the Recoder Conductor.
 *
 * Exposes a typed control-plane client ({@link ConductorClient}) plus a
 * prompt-first helper, all mirroring the real backend contract in
 * docker-backend/src/conductor/conductor.routes.ts.
 */
export { ConductorClient, ConductorError } from './client.js';
export {
  createWorkspaceFromPrompt,
  buildCreateWorkspaceInput,
} from './create-from-prompt.js';
export type { CreateFromPromptOptions } from './create-from-prompt.js';
export type {
  ApiEnvelope,
  ConductorAvailability,
  ConductorClientOptions,
  CreatePrResult,
  CreateWorkspaceInput,
  MergeResult,
  RunEvent,
  RunEventHandler,
  RunEventType,
  RuntimeAvailability,
  StreamHandle,
  SubstrateAvailability,
  WebSocketCtor,
  WebSocketLike,
  Workspace,
  WorkspaceDiff,
  WorkspaceOutput,
  WorkspaceState,
  WorkspaceStatus,
  WorkspaceSubstrate,
} from './types.js';
