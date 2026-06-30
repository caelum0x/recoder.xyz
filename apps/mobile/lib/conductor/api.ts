/**
 * Conductor / Agent OS API client (mobile monitor + approve).
 *
 * Talks to the Recoder control-plane surfaces on docker-backend:
 *   - GET  /api/conductor/workspaces                      list workspaces + run state
 *   - GET  /api/conductor/workspaces/:id/events           RunEvents for a workspace
 *   - GET  /api/agent-os/runs                             canonical Agent OS runs
 *   - GET  /api/agent-os/approvals                        all approvals
 *   - POST /api/agent-os/approvals/:id/approve            decide -> approved
 *   - POST /api/agent-os/approvals/:id/reject             decide -> rejected
 *
 * Base URL: the control plane lives on docker-backend, NOT the `/v1` python
 * backend that `API_URL` points at. It is configured via
 * EXPO_PUBLIC_CONDUCTOR_API_URL and falls back to API_URL (so a single-host dev
 * setup still works). Auth reuses the shared session bearer token.
 *
 * All responses use the Recoder envelope `{ success, data, error }`. Parsers are
 * defensive: a malformed item is skipped rather than throwing, so a partial
 * backend payload still renders. The canonical state stays in Recoder.
 */

import { API_URL, getAuthHeaders } from '@/api/config';
import { getSessionUserIdentity } from '@/lib/auth/session-token';
import { log } from '@/lib/logger';
import {
  parseApproval,
  parseRun,
  parseRunEvent,
  parseRunId,
  parseWorkspace,
  record,
  unwrapEnvelope,
} from './parsers';
import type {
  AgentOsApproval,
  AgentOsRun,
  ApprovalDecisionResult,
  ConductorRunEvent,
  ConductorWorkspace,
} from './types';

const CONDUCTOR_BASE_URL =
  process.env.EXPO_PUBLIC_CONDUCTOR_API_URL?.replace(/\/+$/, '') || API_URL;

/** Restrict path segments to safe id characters before interpolating into a URL. */
const SAFE_ID_RE = /^[a-zA-Z0-9_.:-]{1,200}$/;

function assertSafeId(value: string, name: string): void {
  if (!SAFE_ID_RE.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

function controlPlaneUrl(path: string): string {
  return `${CONDUCTOR_BASE_URL}${path}`;
}

// ---------------------------------------------------------------------------
// Envelope + fetch helpers
// ---------------------------------------------------------------------------

async function getJson(path: string): Promise<unknown> {
  const headers = await getAuthHeaders();
  const url = controlPlaneUrl(path);
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status !== 401 && res.status !== 403) {
      log.error('[Conductor] GET failed:', res.status, path, text.slice(0, 200));
    }
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
  const headers = await getAuthHeaders();
  const url = controlPlaneUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMessage =
      (json && typeof json === 'object' && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : undefined) || `HTTP ${res.status}`;
    if (res.status !== 401 && res.status !== 403) {
      log.error('[Conductor] POST failed:', res.status, path, errorMessage);
    }
    throw new Error(errorMessage);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List Conductor workspaces (parallel agent sessions) with their run state. */
export async function fetchWorkspaces(): Promise<ConductorWorkspace[]> {
  const data = unwrapEnvelope(await getJson('/api/conductor/workspaces'));
  const items = Array.isArray(data) ? data : [];
  return items
    .map(parseWorkspace)
    .filter((w): w is ConductorWorkspace => w !== null);
}

/** List RunEvents for one workspace's run (live terminal + lifecycle log). */
export async function fetchWorkspaceEvents(workspaceId: string): Promise<ConductorRunEvent[]> {
  assertSafeId(workspaceId, 'workspaceId');
  const data = unwrapEnvelope(
    await getJson(`/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/events`),
  );
  const items = Array.isArray(data) ? data : [];
  return items
    .map(parseRunEvent)
    .filter((e): e is ConductorRunEvent => e !== null);
}

/**
 * List canonical Agent OS runs (the state-of-record TaskRun lifecycle). This is
 * the truth the conductor workspaces are a substrate projection of. Used by the
 * mobile "Runs" monitor tab.
 */
export async function fetchRuns(): Promise<AgentOsRun[]> {
  const data = unwrapEnvelope(await getJson('/api/agent-os/runs'));
  const items = Array.isArray(data) ? data : [];
  return items.map(parseRun).filter((r): r is AgentOsRun => r !== null);
}

/** List all Agent OS approvals (pending + decided). */
export async function fetchApprovals(): Promise<AgentOsApproval[]> {
  const data = unwrapEnvelope(await getJson('/api/agent-os/approvals'));
  const items = Array.isArray(data) ? data : [];
  return items
    .map(parseApproval)
    .filter((a): a is AgentOsApproval => a !== null);
}

async function decideApproval(
  approvalId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<ApprovalDecisionResult> {
  assertSafeId(approvalId, 'approvalId');
  const identity = await getSessionUserIdentity();
  const decidedBy = identity.id || identity.email;
  if (!decidedBy) {
    throw new Error('Not authenticated');
  }

  const json = unwrapEnvelope(
    await postJson(`/api/agent-os/approvals/${encodeURIComponent(approvalId)}/${decision}`, {
      decidedBy,
      ...(reason ? { reason } : {}),
    }),
  );

  const r = record(json);
  const approval = parseApproval(r?.approval);
  if (!approval) {
    throw new Error('Malformed approval decision response');
  }
  return { approval, runId: parseRunId(r?.run) };
}

/** Approve a pending approval as the current authenticated user. */
export function approveApproval(approvalId: string, reason?: string): Promise<ApprovalDecisionResult> {
  return decideApproval(approvalId, 'approve', reason);
}

/** Reject a pending approval as the current authenticated user. */
export function rejectApproval(approvalId: string, reason?: string): Promise<ApprovalDecisionResult> {
  return decideApproval(approvalId, 'reject', reason);
}
