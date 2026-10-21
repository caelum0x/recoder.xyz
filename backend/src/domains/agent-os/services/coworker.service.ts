/**
 * `CoworkerService` — the Recoder Coworker: an in-app AI teammate that proposes
 * ONE action at a time (a shell command, a file read/write, or a browser
 * navigation) inside its own per-task sandbox directory, requires a one-click
 * human approval before it runs, executes it for real, and seals BOTH the
 * decision and the real outcome into the durable governance audit chain.
 *
 * This is the Recoder-native shape of the reuse target (CopilotKit/OpenBot's
 * "every action decided before it happens and recorded after"), built on
 * Recoder's OWN governance primitives instead of parallel plumbing:
 *  - approval lifecycle   → `governance/services/approval.service.ts` (UNCHANGED)
 *  - durable audit chain   → `governance/services/audit-chain.service.ts` (UNCHANGED)
 *  - browser tool          → `./coworker-browser.adapter.ts` (the SAME guarded
 *    `@recoder/agent-browser` engine `engines/browser-use-engine.ts` composes)
 *  - action proposer       → the inference domain's ONE `InferenceGatewayPort`
 *    (napi → loopback → BYOK router; no new model/API-key dependency)
 *
 * Task + action state here is PROCESS-MEMORY (not a new durable store): the
 * approval + audit trail already persist durably through the governance domain,
 * so a process restart loses only the in-flight proposal queue, never the
 * record of what was decided or what actually happened. A later pass MAY back
 * this with `agent-os`'s repository if cross-restart task resumption is wanted;
 * documented here rather than silently assumed.
 */
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Logger } from '../../../shared/logger.js';
import type { ApprovalService } from '../../governance/services/approval.service.js';
import type { AuditChainService } from '../../governance/services/audit-chain.service.js';
import type { RiskTier } from '../../governance/types.js';
import type { InferenceGatewayPort } from '../../inference/ports/inference-gateway.port.js';
import type { BrowserEngine } from '@recoder/agent-browser';

const MAX_STEPS_DEFAULT = 15;
const SHELL_TIMEOUT_MS = 30_000;
const SHELL_MAX_BUFFER = 1_000_000;
const READ_FILE_MAX_CHARS = 20_000;
const BROWSER_EXTRACT_MAX_CHARS = 4_000;
const HISTORY_MAX_CHARS = 6_000;

export type CoworkerActionKind = 'shell' | 'write_file' | 'read_file' | 'browser_navigate' | 'finish';

export type CoworkerActionPayload =
  | { readonly kind: 'shell'; readonly command: string }
  | { readonly kind: 'write_file'; readonly path: string; readonly content: string }
  | { readonly kind: 'read_file'; readonly path: string }
  | { readonly kind: 'browser_navigate'; readonly url: string }
  | { readonly kind: 'finish'; readonly summary: string };

export type CoworkerActionStatus =
  | 'awaiting_approval'
  | 'approved'
  | 'denied'
  | 'executed'
  | 'failed';

export interface CoworkerActionResult {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly content?: string;
  readonly written?: boolean;
  readonly url?: string;
  readonly title?: string;
  readonly text?: string;
  readonly driver?: string;
}

export interface CoworkerActionRecord {
  readonly id: string;
  readonly taskId: string;
  readonly step: number;
  readonly kind: CoworkerActionKind;
  readonly payload: CoworkerActionPayload;
  readonly reason: string;
  readonly riskTier: RiskTier;
  readonly status: CoworkerActionStatus;
  readonly approvalId?: string;
  readonly result?: CoworkerActionResult;
  readonly error?: string;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly executedAt?: string;
}

export type CoworkerTaskStatus =
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'denied'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface CoworkerTaskRecord {
  readonly id: string;
  readonly goal: string;
  readonly actorId: string;
  readonly sandboxDir: string;
  readonly status: CoworkerTaskStatus;
  readonly statusReason?: string;
  readonly actions: readonly CoworkerActionRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CoworkerServiceDeps {
  readonly approvals: ApprovalService;
  readonly audit: AuditChainService;
  readonly gateway: InferenceGatewayPort;
  readonly browser: BrowserEngine;
  readonly logger: Logger;
  /** Root directory each task's own sandbox is created under. */
  readonly sandboxRoot: string;
  /** Hard ceiling on proposed actions per task (loop-runaway guard). Default 15. */
  readonly maxSteps?: number;
}

const RISK_TIER_BY_KIND: Readonly<Record<CoworkerActionKind, RiskTier>> = {
  shell: 'high',
  write_file: 'high',
  read_file: 'low',
  browser_navigate: 'medium',
  finish: 'low',
};

export class CoworkerService {
  private readonly approvals: ApprovalService;
  private readonly audit: AuditChainService;
  private readonly gateway: InferenceGatewayPort;
  private readonly browser: BrowserEngine;
  private readonly log: Logger;
  private readonly sandboxRoot: string;
  private readonly maxSteps: number;
  private readonly tasks = new Map<string, CoworkerTaskRecord>();

  constructor(deps: CoworkerServiceDeps) {
    this.approvals = deps.approvals;
    this.audit = deps.audit;
    this.gateway = deps.gateway;
    this.browser = deps.browser;
    this.log = deps.logger;
    this.sandboxRoot = deps.sandboxRoot;
    this.maxSteps = deps.maxSteps && deps.maxSteps > 0 ? deps.maxSteps : MAX_STEPS_DEFAULT;
  }

  /** Start a new coworker task: creates its sandbox and proposes the first action. */
  async createTask(input: { goal: string; actorId: string }): Promise<CoworkerTaskRecord> {
    const goal = input.goal.trim();
    if (goal === '') {
      throw new Error('goal is required');
    }
    const id = randomUUID();
    const sandboxDir = path.join(this.sandboxRoot, id);
    await mkdir(sandboxDir, { recursive: true });
    const now = new Date().toISOString();
    let task: CoworkerTaskRecord = {
      id,
      goal,
      actorId: input.actorId,
      sandboxDir,
      status: 'running',
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    task = await this.proposeNextAction(task);
    return task;
  }

  getTask(id: string): CoworkerTaskRecord | null {
    return this.tasks.get(id) ?? null;
  }

  listTasks(actorId?: string): readonly CoworkerTaskRecord[] {
    const all = [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return actorId ? all.filter((t) => t.actorId === actorId) : all;
  }

  /**
   * Cancel a task (ownership/privilege is the ROUTE's job — see
   * `governance-access.ts`'s `canDecideApproval`, reused there — this method
   * trusts the caller already authorized it, exactly like `ApprovalService`
   * trusts its own callers).
   */
  async cancelTask(id: string): Promise<CoworkerTaskRecord | null> {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== 'running' && task.status !== 'awaiting_approval') return task;
    return this.setTaskStatus(task, 'cancelled', 'Cancelled by operator.');
  }

  /**
   * Decide the task's CURRENT pending action. Approving executes it for real
   * (recording a SECOND, independent audit entry carrying the real outcome) and
   * — when the task is not yet finished — proposes the next action. Denying
   * stops the task; the human veto is final for this run.
   */
  async decideAction(input: {
    taskId: string;
    actionId: string;
    decision: 'approved' | 'denied';
    decidedBy: string;
    reason?: string;
  }): Promise<CoworkerTaskRecord> {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new Error('coworker task not found');
    const action = task.actions.find((a) => a.id === input.actionId);
    if (!action) throw new Error('coworker action not found');
    if (action.status !== 'awaiting_approval' || !action.approvalId) {
      throw new Error('this action is not awaiting a decision');
    }

    const decided = await this.approvals.decide(action.approvalId, {
      decision: input.decision,
      decidedBy: input.decidedBy,
      reason: input.reason ?? null,
    });

    if (decided.status !== 'approved') {
      const denied = this.replaceAction(task, action.id, {
        ...action,
        status: 'denied',
        decidedAt: new Date().toISOString(),
      });
      return this.setTaskStatus(denied, 'denied', 'The operator denied a proposed action.');
    }

    const approvedAction = this.replaceAction(task, action.id, {
      ...action,
      status: 'approved',
      decidedAt: new Date().toISOString(),
    });

    const executed = await this.executeAction(approvedAction, action);

    if (executed.status === 'failed') {
      return this.setTaskStatus(executed.task, 'failed', executed.action.error ?? 'Action execution failed.');
    }

    if (action.kind === 'finish') {
      return this.setTaskStatus(executed.task, 'completed', (action.payload as { summary: string }).summary);
    }

    if (executed.task.actions.length >= this.maxSteps) {
      return this.setTaskStatus(executed.task, 'completed', `Reached the ${this.maxSteps}-step limit for one task.`);
    }

    return this.proposeNextAction(executed.task);
  }

  // --- action proposal ---------------------------------------------------

  private async proposeNextAction(task: CoworkerTaskRecord): Promise<CoworkerTaskRecord> {
    const prompt = buildProposerMessages(task);
    const result = await this.gateway.complete({
      model: '',
      messages: prompt,
      temperature: 0,
      maxTokens: 500,
      userId: task.actorId,
    });

    if (!result.routed || !result.content) {
      return this.setTaskStatus(
        task,
        'blocked',
        result.reason ?? 'No inference provider is configured for this Recoder deployment yet.',
      );
    }

    const proposed = parseProposedAction(result.content);
    if (!proposed) {
      return this.setTaskStatus(
        task,
        'blocked',
        'The model did not return a recognizable next action; stopped rather than guess.',
      );
    }

    const step = task.actions.length + 1;
    const target = JSON.stringify(proposed.action);
    const riskTier = RISK_TIER_BY_KIND[proposed.action.kind];

    if (proposed.action.kind === 'finish') {
      const record: CoworkerActionRecord = {
        id: randomUUID(),
        taskId: task.id,
        step,
        kind: 'finish',
        payload: proposed.action,
        reason: proposed.reason,
        riskTier,
        status: 'approved',
        createdAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
      };
      await this.auditAppend(task, record, 'allow', { phase: 'decision' });
      const withAction = this.appendAction(task, record);
      return this.setTaskStatus(withAction, 'completed', proposed.action.summary);
    }

    const approval = await this.approvals.request({
      action: `coworker.${proposed.action.kind}`,
      riskTier,
      requestedBy: task.actorId,
      taskId: task.id,
      target,
      reason: proposed.reason,
    });

    const record: CoworkerActionRecord = {
      id: randomUUID(),
      taskId: task.id,
      step,
      kind: proposed.action.kind,
      payload: proposed.action,
      reason: proposed.reason,
      riskTier,
      status: 'awaiting_approval',
      approvalId: approval.id,
      createdAt: new Date().toISOString(),
    };
    const withAction = this.appendAction(task, record);
    return this.setTaskStatus(withAction, 'awaiting_approval', `Waiting on approval for step ${step}.`);
  }

  // --- action execution ----------------------------------------------------

  private async executeAction(
    task: CoworkerTaskRecord,
    action: CoworkerActionRecord,
  ): Promise<{ task: CoworkerTaskRecord; action: CoworkerActionRecord; status: 'executed' | 'failed' }> {
    try {
      const result = await this.runPayload(task.sandboxDir, action.payload);
      const executedAction: CoworkerActionRecord = {
        ...action,
        status: 'executed',
        result,
        executedAt: new Date().toISOString(),
      };
      await this.auditAppend(task, executedAction, 'allow', { phase: 'execution', result });
      return { task: this.appendOrReplace(task, executedAction), action: executedAction, status: 'executed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedAction: CoworkerActionRecord = {
        ...action,
        status: 'failed',
        error: message,
        executedAt: new Date().toISOString(),
      };
      await this.auditAppend(task, failedAction, 'deny', { phase: 'execution', error: message });
      return { task: this.appendOrReplace(task, failedAction), action: failedAction, status: 'failed' };
    }
  }

  private async runPayload(sandboxDir: string, payload: CoworkerActionPayload): Promise<CoworkerActionResult> {
    switch (payload.kind) {
      case 'shell':
        return runShell(sandboxDir, payload.command);
      case 'write_file':
        return writeSandboxFile(sandboxDir, payload.path, payload.content);
      case 'read_file':
        return readSandboxFile(sandboxDir, payload.path);
      case 'browser_navigate':
        return this.runBrowserNavigate(payload.url);
      case 'finish':
        return { content: payload.summary };
    }
  }

  private async runBrowserNavigate(url: string): Promise<CoworkerActionResult> {
    const nav = await this.browser.navigate(url);
    if (nav.status !== 'ok') {
      throw new Error(nav.reason ?? `browser navigation ${nav.status}`);
    }
    const extracted = await this.browser.extractText(nav.url);
    const text = extracted.status === 'ok' ? (extracted.text ?? '').slice(0, BROWSER_EXTRACT_MAX_CHARS) : undefined;
    return {
      url: nav.url,
      title: nav.title,
      driver: nav.driver,
      ...(text !== undefined ? { text } : {}),
    };
  }

  // --- bookkeeping (immutable replace, never mutate in place) --------------

  private appendAction(task: CoworkerTaskRecord, action: CoworkerActionRecord): CoworkerTaskRecord {
    const updated: CoworkerTaskRecord = {
      ...task,
      actions: [...task.actions, action],
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, updated);
    return updated;
  }

  private replaceAction(
    task: CoworkerTaskRecord,
    actionId: string,
    replacement: CoworkerActionRecord,
  ): CoworkerTaskRecord {
    const updated: CoworkerTaskRecord = {
      ...task,
      actions: task.actions.map((a) => (a.id === actionId ? replacement : a)),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, updated);
    return updated;
  }

  private appendOrReplace(task: CoworkerTaskRecord, action: CoworkerActionRecord): CoworkerTaskRecord {
    const current = this.tasks.get(task.id) ?? task;
    const exists = current.actions.some((a) => a.id === action.id);
    return exists ? this.replaceAction(current, action.id, action) : this.appendAction(current, action);
  }

  private setTaskStatus(
    task: CoworkerTaskRecord,
    status: CoworkerTaskStatus,
    reason?: string,
  ): CoworkerTaskRecord {
    const current = this.tasks.get(task.id) ?? task;
    const updated: CoworkerTaskRecord = {
      ...current,
      status,
      statusReason: reason,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, updated);
    return updated;
  }

  private async auditAppend(
    task: CoworkerTaskRecord,
    action: CoworkerActionRecord,
    effect: 'allow' | 'deny',
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.append({
        actorId: task.actorId,
        action: `coworker.${action.kind}`,
        resource: `coworker-task:${task.id}:step:${action.step}`,
        effect,
        riskTier: action.riskTier,
        degraded: false,
        payload: { taskId: task.id, actionId: action.id, step: action.step, ...extra },
      });
    } catch (err) {
      this.log.warn({ err, taskId: task.id, actionId: action.id }, 'coworker audit seal failed (action still recorded)');
    }
  }
}

// --- execution primitives (pure, sandbox-confined) --------------------------

function resolveSandboxPath(sandboxDir: string, relPath: string): string {
  const resolved = path.resolve(sandboxDir, relPath);
  const root = path.resolve(sandboxDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`path escapes the task sandbox: ${relPath}`);
  }
  return resolved;
}

/**
 * Run one shell command confined to `cwd`. A NON-ZERO exit is a truthful result
 * (resolves with that `exitCode`, never thrown); only a genuine spawn fault
 * (binary missing, timeout) — surfaced by Node as a string `error.code` —
 * rejects, since there is no exit code to report.
 */
function runShell(cwd: string, command: string): Promise<CoworkerActionResult> {
  return new Promise((resolve, reject) => {
    execFile(
      '/bin/sh',
      ['-c', command],
      { cwd, timeout: SHELL_TIMEOUT_MS, maxBuffer: SHELL_MAX_BUFFER },
      (error, stdout, stderr) => {
        const errWithCode = error as (NodeJS.ErrnoException & { code?: string | number }) | null;
        if (errWithCode && typeof errWithCode.code === 'string') {
          reject(new Error(`${errWithCode.code}: ${errWithCode.message}`));
          return;
        }
        const exitCode = typeof errWithCode?.code === 'number' ? errWithCode.code : 0;
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode });
      },
    );
  });
}

async function writeSandboxFile(sandboxDir: string, relPath: string, content: string): Promise<CoworkerActionResult> {
  const target = resolveSandboxPath(sandboxDir, relPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
  return { written: true };
}

async function readSandboxFile(sandboxDir: string, relPath: string): Promise<CoworkerActionResult> {
  const target = resolveSandboxPath(sandboxDir, relPath);
  const content = await readFile(target, 'utf8');
  return { content: content.slice(0, READ_FILE_MAX_CHARS) };
}

// --- action proposer (LLM contract) ------------------------------------------

const SYSTEM_PROMPT = `You are the Recoder Coworker, an AI teammate with its own sandboxed computer: a
scratch workspace directory, a shell, and a browser. You work toward a goal ONE
action at a time; a human approves every action before it runs, and you see the
real result before proposing the next one.

Reply with EXACTLY one JSON object, no prose, no markdown fence:
{"kind":"shell","command":"...","reason":"..."}
{"kind":"write_file","path":"relative/path","content":"...","reason":"..."}
{"kind":"read_file","path":"relative/path","reason":"..."}
{"kind":"browser_navigate","url":"https://...","reason":"..."}
{"kind":"finish","summary":"what you accomplished","reason":"..."}

Rules: paths are relative to your sandbox (you cannot leave it). Use "finish" as
soon as the goal is met or you determine it cannot be completed with your tools —
explain why in "summary". Keep "reason" to one short sentence a human approver
can read in under two seconds.`;

function buildProposerMessages(task: CoworkerTaskRecord): { role: 'system' | 'user'; content: string }[] {
  const history = task.actions
    .map((a) => {
      const status = a.status === 'denied' ? 'DENIED by human' : a.status === 'failed' ? `FAILED: ${a.error}` : 'done';
      const outcome = a.result ? JSON.stringify(a.result).slice(0, 400) : '';
      return `Step ${a.step} — ${a.kind} (${JSON.stringify(a.payload)}) → ${status}${outcome ? ` — ${outcome}` : ''}`;
    })
    .join('\n')
    .slice(-HISTORY_MAX_CHARS);

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Goal: ${task.goal}\n\nActions so far:\n${history || '(none yet)'}\n\nPropose the next action.`,
    },
  ];
}

function parseProposedAction(raw: string): { action: CoworkerActionPayload; reason: string } | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const reason = typeof obj.reason === 'string' && obj.reason.trim() !== '' ? obj.reason.trim() : 'No reason given.';

  switch (obj.kind) {
    case 'shell':
      return isNonEmptyString(obj.command)
        ? { action: { kind: 'shell', command: obj.command }, reason }
        : null;
    case 'write_file':
      return isNonEmptyString(obj.path) && typeof obj.content === 'string'
        ? { action: { kind: 'write_file', path: obj.path, content: obj.content }, reason }
        : null;
    case 'read_file':
      return isNonEmptyString(obj.path) ? { action: { kind: 'read_file', path: obj.path }, reason } : null;
    case 'browser_navigate':
      return isNonEmptyString(obj.url) ? { action: { kind: 'browser_navigate', url: obj.url }, reason } : null;
    case 'finish':
      return isNonEmptyString(obj.summary) ? { action: { kind: 'finish', summary: obj.summary }, reason } : null;
    default:
      return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}
