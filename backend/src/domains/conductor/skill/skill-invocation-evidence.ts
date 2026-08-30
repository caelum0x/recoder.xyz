/**
 * Durable evidence for every governed-skill invocation attempt. The record keeps
 * the exact typed action, owned target, policy verdict, and truthful outcome in
 * one content-hashed document. An `executing` record is written before capability
 * dispatch and replaced by the terminal outcome, so a crash cannot erase the fact
 * that an allowed invocation started.
 */
import { createHash } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import type { SkillActionOutcome } from './skill.types.js';

export type SkillInvocationPhase =
  | 'request'
  | 'resolution'
  | 'validation'
  | 'workspace'
  | 'policy'
  | 'approval'
  | 'execution';

export type SkillPolicyEvidence =
  | { readonly effect: 'not_evaluated' }
  | {
      readonly effect: 'deny' | 'needs_approval' | 'allow';
      readonly reason?: string;
      readonly profileRevision?: number;
    };

export type SkillInvocationEvidenceOutcome =
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'needs_approval'; readonly requestId: string; readonly reason: string }
  | { readonly status: 'executing' }
  | { readonly status: 'executed'; readonly result: SkillActionOutcome }
  | { readonly status: 'failed'; readonly reason: string };

export interface SkillInvocationEvidenceBody {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly actorId: string;
  readonly target: {
    /** Canonical Recoder workspace id supplied at the authenticated edge. */
    readonly workspaceId: string;
    /** Server-resolved owned checkout; absent when resolution never succeeded. */
    readonly worktree?: string;
  };
  readonly skill: {
    readonly id: string;
    readonly actionId: string;
    readonly version?: string;
    readonly publisherKeyId?: string;
    readonly capabilities: readonly string[];
  };
  /** Exact JSON invocation params. Invalid non-JSON internal values degrade to a string. */
  readonly params: unknown;
  readonly phase: SkillInvocationPhase;
  readonly policy: SkillPolicyEvidence;
  readonly outcome: SkillInvocationEvidenceOutcome;
}

export interface SkillInvocationEvidence extends SkillInvocationEvidenceBody {
  /** SHA-256 over the canonical evidence body, excluding this field. */
  readonly contentHash: string;
}

export interface SkillInvocationEvidenceStore {
  put(record: SkillInvocationEvidence): Promise<void>;
  listByWorkspace(workspaceId: string, limit: number): Promise<{
    readonly total: number;
    readonly invocations: readonly SkillInvocationEvidence[];
  }>;
  isDurable(): boolean;
}

export interface SkillInvocationEvidenceView {
  readonly durable: boolean;
  readonly total: number;
  readonly invocations: ReadonlyArray<SkillInvocationEvidence & {
    readonly integrity: 'verified' | 'invalid';
  }>;
}

export function evidenceJsonValue(value: unknown): unknown {
  try {
    const encoded = JSON.stringify(value ?? null);
    return encoded === undefined ? null : JSON.parse(encoded) as unknown;
  } catch {
    return String(value);
  }
}

export function sealSkillInvocationEvidence(
  body: SkillInvocationEvidenceBody,
): SkillInvocationEvidence {
  const safeBody = { ...body, params: evidenceJsonValue(body.params) };
  const contentHash = createHash('sha256').update(canonicalJson(safeBody)).digest('hex');
  return { ...safeBody, contentHash };
}

export function verifySkillInvocationEvidence(record: SkillInvocationEvidence): boolean {
  const { contentHash, ...body } = record;
  return createHash('sha256').update(canonicalJson(body)).digest('hex') === contentHash;
}
