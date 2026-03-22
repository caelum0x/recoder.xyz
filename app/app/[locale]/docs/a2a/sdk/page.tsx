import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Package, Layers, AlertCircle, FileCheck, Activity } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'A2A SDK Reference - Recoder Documentation',
  description: 'Complete reference for the Recoder A2A SDK. State mapping, error taxonomy, envelope builders, audit events, and validation for building A2A integrations.',
};

export default function SDKReferencePage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <Link href="/docs/a2a" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to A2A Docs
          </Link>

          <h1 className="text-4xl font-bold tracking-tight mb-4">A2A SDK Reference</h1>
          <p className="text-lg text-zinc-400 mb-6">
            Build custom A2A integrations with the official SDK. Handles state mapping, error normalization,
            task envelopes, audit events, and schema validation.
          </p>

          {/* Install */}
          <section className="mb-12">
            <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto">
              npm install recoder-a2a-sdk
            </pre>
          </section>

          {/* Modules */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Modules</h2>

            {/* State Mapping */}
            <div className="mb-10">
              <h3 className="text-xl font-medium mb-3 flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" />
                State Mapping
              </h3>
              <p className="text-zinc-400 mb-4">
                Translate between connector-specific states (Codex, Claude) and the canonical A2A task state machine.
              </p>
              <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto mb-3">
{`import {
  mapCodexState,
  mapClaudeState,
  canonicalToCodexState,
  canonicalToClaudeState,
  checkConnectorTransition,
  isConnectorTerminalState,
  TaskStateEnum,
} from 'recoder-a2a-sdk';

// Map Codex native state to canonical
const canonical = mapCodexState('completed');
// => TaskStateEnum.COMPLETED

// Map canonical back to Codex
const native = canonicalToCodexState(TaskStateEnum.IN_PROGRESS);
// => 'in_progress'

// Check if a state transition is valid
const ok = checkConnectorTransition('codex', 'in_progress', 'completed');
// => true`}
              </pre>
              <p className="text-xs text-zinc-500">Canonical states: SUBMITTED, ACCEPTED, IN_PROGRESS, INPUT_REQUIRED, COMPLETED, FAILED, CANCELLED</p>
            </div>

            {/* Error Mapping */}
            <div className="mb-10">
              <h3 className="text-xl font-medium mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Error Mapping
              </h3>
              <p className="text-zinc-400 mb-4">
                Normalize errors from different platforms into a consistent taxonomy with severity, category, and recovery hints.
              </p>
              <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto mb-3">
{`import {
  mapCodexError,
  mapClaudeError,
  mapHttpError,
  wrapUnknownError,
  A2AErrorCodeEnum,
} from 'recoder-a2a-sdk';

// Map a Codex-specific error
const err = mapCodexError({
  code: 'rate_limit_exceeded',
  message: 'Too many requests',
});
// => { code: 'RATE_LIMITED', severity: 'transient', ... }

// Map an HTTP error
const httpErr = mapHttpError(503, 'Service unavailable');

// Wrap any unknown error safely
const unknown = wrapUnknownError(someError);`}
              </pre>
            </div>

            {/* Envelope Builders */}
            <div className="mb-10">
              <h3 className="text-xl font-medium mb-3 flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-400" />
                Envelope Builders
              </h3>
              <p className="text-zinc-400 mb-4">
                Create pre-configured task envelopes for specific connectors. Handles ID generation, timestamps, and state initialization.
              </p>
              <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto mb-3">
{`import {
  buildCodexEnvelope,
  buildClaudeEnvelope,
  completeEnvelope,
  failEnvelope,
  startEnvelope,
} from 'recoder-a2a-sdk';

// Create a new task envelope for a Codex connector
const envelope = buildCodexEnvelope({
  sourceAgent: { id: 'my-agent', platform: 'custom' },
  targetAgent: { id: 'codex-1', platform: 'codex' },
  payload: { type: 'text', content: 'Review this PR' },
  workspaceId: 'ws_123',
});

// Transition states
const started = startEnvelope(envelope);
const done = completeEnvelope(started, {
  artifacts: [{ type: 'text', content: 'LGTM' }],
});`}
              </pre>
            </div>

            {/* Audit Helpers */}
            <div className="mb-10">
              <h3 className="text-xl font-medium mb-3 flex items-center gap-2">
                <Activity className="h-5 w-5 text-yellow-400" />
                Audit Helpers
              </h3>
              <p className="text-zinc-400 mb-4">
                Emit typed audit events for task lifecycle, connector health, and policy decisions.
              </p>
              <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto mb-3">
{`import {
  emitTaskSubmitted,
  emitTaskCompleted,
  emitConnectorHealth,
  emitPolicyChecked,
} from 'recoder-a2a-sdk';

// Emit when a task is submitted
const event = emitTaskSubmitted({
  taskId: envelope.id,
  actor: { kind: 'agent', id: 'my-agent' },
  workspaceId: 'ws_123',
});

// Emit connector health check
emitConnectorHealth({
  connectorId: 'codex-1',
  status: 'healthy',
  latencyMs: 42,
});`}
              </pre>
            </div>

            {/* Validation */}
            <div className="mb-10">
              <h3 className="text-xl font-medium mb-3 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-green-400" />
                Validation
              </h3>
              <p className="text-zinc-400 mb-4">
                Validate task envelopes and audit events at API boundaries. Returns structured issues with paths.
              </p>
              <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`import {
  validateTaskEnvelope,
  isValidTaskEnvelope,
  assertTaskEnvelope,
  validateAuditEvent,
} from 'recoder-a2a-sdk';

// Validate returns { valid, issues }
const result = validateTaskEnvelope(data);
if (!result.valid) {
  console.error(result.issues);
  // [{ path: 'sourceAgent.id', message: 'required' }]
}

// Boolean check
if (isValidTaskEnvelope(data)) { /* safe to use */ }

// Throws on invalid
assertTaskEnvelope(data);`}
              </pre>
            </div>
          </section>

          {/* TypeScript Types */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Key Types</h2>
            <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`// Task lifecycle
type TaskEnvelope = {
  id: string;
  version: string;
  state: TaskState;
  sourceAgent: TaskAgentRef;
  targetAgent: TaskAgentRef;
  payload: RecoderPayload;
  result?: TaskResult;
  error?: TaskErrorInfo;
  createdAt: string;
  updatedAt: string;
  workspaceId: string;
};

// Agent reference
type TaskAgentRef = {
  id: string;
  platform: RecoderAgentPlatform;
  name?: string;
};

// Payload types
type RecoderPayload =
  | RecoderTextPayload
  | RecoderJsonPayload
  | RecoderCommandPayload
  | RecoderArtifactPayload;`}
            </pre>
          </section>

          <div className="flex gap-4">
            <Link href="/docs/a2a/mcp-setup" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
              MCP Setup
            </Link>
            <Link href="/docs/a2a/workflows" className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200">
              Cross-App Workflows
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
