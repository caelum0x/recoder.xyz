/**
 * Shared in-memory fakes for governance unit tests. Not a `*.test.ts` file, so
 * vitest does not collect it as a suite — it only supplies deterministic doubles
 * that mirror the frozen repository/kernel ports (no Postgres, no native kernel).
 */
import { AUDIT_GENESIS_HASH } from '../types.js';
import type { AuditRepository, AuditSealer } from '../ports/audit-repo.port.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { ApprovalRepository, ApprovalQuery } from '../ports/approval-repo.port.js';
import type { WorkLockRepository, WorkLockAcquireInput, WorkLockAcquireResult } from '../ports/worklock-repo.port.js';
import type { SecretRepository, SecretCipherRow, SecretCipherInput } from '../ports/secrets.port.js';
import type { VaultAdapter, SealedSecret } from '../adapters/vault.adapter.js';
import type {
  ApprovalRecord,
  AuditEntryInput,
  AuditRecord,
  AuditVerification,
  KernelRequest,
  KernelStatus,
  KernelVerdict,
  RoutingHint,
  SecretRef,
  ToolEnforcement,
  WorkLock,
} from '../types.js';

// --- audit -------------------------------------------------------------------

/** In-memory audit chain that mirrors the durable Merkle semantics. */
export class InMemoryAuditRepository implements AuditRepository {
  readonly rows: AuditRecord[] = [];

  async append(entry: AuditEntryInput, seal: AuditSealer): Promise<AuditRecord> {
    const prevHash = this.rows[this.rows.length - 1]?.entryHash ?? AUDIT_GENESIS_HASH;
    const record: AuditRecord = {
      id: `audit_${this.rows.length + 1}`,
      seq: this.rows.length + 1,
      prevHash,
      entryHash: seal(prevHash, entry),
      actorId: entry.actorId,
      action: entry.action,
      resource: entry.resource,
      effect: entry.effect,
      riskTier: entry.riskTier,
      degraded: entry.degraded,
      payload: entry.payload ?? {},
      createdAt: new Date().toISOString(),
    };
    this.rows.push(record);
    return record;
  }

  async tip(): Promise<AuditRecord | null> {
    return this.rows[this.rows.length - 1] ?? null;
  }

  async range(): Promise<readonly AuditRecord[]> {
    return [...this.rows];
  }

  async verifyChain(seal: AuditSealer): Promise<AuditVerification> {
    let prevHash = AUDIT_GENESIS_HASH;
    for (const r of this.rows) {
      const recomputed = seal(prevHash, {
        actorId: r.actorId,
        action: r.action,
        resource: r.resource,
        effect: r.effect,
        riskTier: r.riskTier,
        degraded: r.degraded,
        payload: r.payload,
      });
      if (r.prevHash !== prevHash || r.entryHash !== recomputed) {
        return { ok: false, brokenAtSeq: r.seq, tipHash: this.rows[this.rows.length - 1]?.entryHash, entries: this.rows.length };
      }
      prevHash = r.entryHash;
    }
    return { ok: true, tipHash: this.rows.length ? prevHash : undefined, entries: this.rows.length };
  }
}

/** An audit repo whose append always throws (simulates an unavailable chain). */
export class FailingAuditRepository implements AuditRepository {
  async append(): Promise<AuditRecord> {
    throw new Error('audit chain unavailable');
  }
  async tip(): Promise<AuditRecord | null> {
    return null;
  }
  async range(): Promise<readonly AuditRecord[]> {
    return [];
  }
  async verifyChain(): Promise<AuditVerification> {
    return { ok: false, entries: 0 };
  }
}

// --- kernel ------------------------------------------------------------------

export interface FakeKernelOpts {
  readonly verdict?: KernelVerdict;
  readonly throwOnDecide?: boolean;
  readonly status?: KernelStatus;
  readonly tool?: ToolEnforcement;
  readonly routing?: RoutingHint;
}

/** A configurable {@link GovernanceKernelPort} double. */
export function fakeKernel(opts: FakeKernelOpts = {}): GovernanceKernelPort {
  const verdict: KernelVerdict = opts.verdict ?? {
    effect: 'allow',
    tier: 'low',
    reason: 'ok',
    degraded: false,
    engine: 'ts',
  };
  return {
    async decide(_req: KernelRequest): Promise<KernelVerdict> {
      if (opts.throwOnDecide) throw new Error('kernel decide fault');
      return verdict;
    },
    async enforceTool(): Promise<ToolEnforcement> {
      return opts.tool ?? { outcome: 'allowed', reason: 'ok', degraded: false, engine: 'ts' };
    },
    async route(): Promise<RoutingHint> {
      return opts.routing ?? { routable: true, tier: 'low', reason: 'ok' };
    },
    async auditTip(): Promise<string> {
      return AUDIT_GENESIS_HASH;
    },
    async verifyAudit(): Promise<AuditVerification> {
      return { ok: true, entries: 0 };
    },
    status(): KernelStatus {
      return opts.status ?? { engine: 'ts', status: 'up', degraded: true };
    },
  };
}

/** A kernel rung whose every method throws (an infrastructure fault). */
export function throwingKernel(status?: KernelStatus): GovernanceKernelPort {
  const boom = (): never => {
    throw new Error('rung fault');
  };
  return {
    decide: async () => boom(),
    enforceTool: async () => boom(),
    route: async () => boom(),
    auditTip: async () => boom(),
    verifyAudit: async () => boom(),
    status: () => status ?? { engine: 'napi', status: 'up', degraded: false },
  };
}

// --- approvals ---------------------------------------------------------------

/** In-memory {@link ApprovalRepository}. Enforces pending-only decide idempotency. */
export class InMemoryApprovalRepository implements ApprovalRepository {
  readonly rows = new Map<string, ApprovalRecord>();
  private seq = 0;

  async create(input: {
    action: string;
    riskTier: ApprovalRecord['riskTier'];
    requestedBy: string;
    taskId?: string | null;
    runId?: string | null;
    reason?: string | null;
    expiresAt?: string | null;
  }): Promise<ApprovalRecord> {
    const id = `appr_${++this.seq}`;
    const rec: ApprovalRecord = {
      id,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      action: input.action,
      riskTier: input.riskTier,
      status: 'pending',
      requestedBy: input.requestedBy,
      decidedBy: null,
      reason: input.reason ?? null,
      expiresAt: input.expiresAt ?? null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(id, rec);
    return rec;
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async decide(
    id: string,
    input: { decision: 'approved' | 'denied'; decidedBy: string; reason?: string | null },
  ): Promise<ApprovalRecord | null> {
    const rec = this.rows.get(id);
    if (!rec || rec.status !== 'pending') return null; // idempotent: never re-decide
    const updated: ApprovalRecord = {
      ...rec,
      status: input.decision,
      decidedBy: input.decidedBy,
      reason: input.reason ?? rec.reason ?? null,
      decidedAt: new Date().toISOString(),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async list(query: ApprovalQuery = {}): Promise<readonly ApprovalRecord[]> {
    let out = [...this.rows.values()];
    if (query.taskId) out = out.filter((r) => r.taskId === query.taskId);
    if (query.requestedBy) out = out.filter((r) => r.requestedBy === query.requestedBy);
    if (query.status) out = out.filter((r) => r.status === query.status);
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return query.limit ? out.slice(0, query.limit) : out;
  }

  async hasApproval(taskId: string, action: string): Promise<boolean> {
    return [...this.rows.values()].some(
      (r) => r.taskId === taskId && r.action === action && r.status === 'approved',
    );
  }
}

// --- work locks --------------------------------------------------------------

/** In-memory {@link WorkLockRepository} honoring exclusive-conflict + expiry semantics. */
export class InMemoryWorkLockRepository implements WorkLockRepository {
  readonly rows: WorkLock[] = [];
  private seq = 0;
  /** Injectable clock so expiry can be tested deterministically. */
  now: () => number = () => Date.now();

  private isActive(l: WorkLock): boolean {
    return l.releasedAt == null && Date.parse(l.expiresAt) > this.now();
  }

  async acquire(input: WorkLockAcquireInput): Promise<WorkLockAcquireResult> {
    const mode = input.mode ?? 'exclusive';
    const conflict = this.rows.find(
      (l) => l.resourcePath === input.resourcePath && this.isActive(l) && (l.mode === 'exclusive' || mode === 'exclusive'),
    );
    if (conflict) {
      return { acquired: false, lock: conflict, conflictReason: `held by ${conflict.holderAgentId}` };
    }
    const lock: WorkLock = {
      id: `lock_${++this.seq}`,
      resourcePath: input.resourcePath,
      holderAgentId: input.holderAgentId,
      taskId: input.taskId ?? null,
      mode,
      acquiredAt: new Date(this.now()).toISOString(),
      expiresAt: input.expiresAt,
      releasedAt: null,
    };
    this.rows.push(lock);
    return { acquired: true, lock };
  }

  async release(id: string, holderAgentId: string): Promise<boolean> {
    const idx = this.rows.findIndex((l) => l.id === id && l.holderAgentId === holderAgentId && l.releasedAt == null);
    if (idx === -1) return false;
    this.rows[idx] = { ...this.rows[idx]!, releasedAt: new Date(this.now()).toISOString() };
    return true;
  }

  async activeLockFor(resourcePath: string): Promise<WorkLock | null> {
    return this.rows.find((l) => l.resourcePath === resourcePath && this.isActive(l)) ?? null;
  }

  async listActive(query: { holderAgentId?: string; taskId?: string } = {}): Promise<readonly WorkLock[]> {
    return this.rows.filter(
      (l) =>
        this.isActive(l) &&
        (!query.holderAgentId || l.holderAgentId === query.holderAgentId) &&
        (!query.taskId || l.taskId === query.taskId),
    );
  }
}

// --- secrets -----------------------------------------------------------------

/** In-memory {@link SecretRepository} storing ciphertext rows only. */
export class InMemorySecretRepository implements SecretRepository {
  readonly rows = new Map<string, SecretCipherRow>();
  private seq = 0;
  private key(owner: string, ref: string): string {
    return `${owner}::${ref}`;
  }

  async upsert(input: SecretCipherInput): Promise<SecretCipherRow> {
    const k = this.key(input.ownerUserId, input.ref);
    const existing = this.rows.get(k);
    const row: SecretCipherRow = {
      id: existing?.id ?? `sec_${++this.seq}`,
      ref: input.ref,
      ownerUserId: input.ownerUserId,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      keyVersion: input.keyVersion,
      rotatedAt: existing?.rotatedAt ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    this.rows.set(k, row);
    return row;
  }

  async find(ownerUserId: string, ref: string): Promise<SecretCipherRow | null> {
    return this.rows.get(this.key(ownerUserId, ref)) ?? null;
  }

  async rotate(
    ownerUserId: string,
    ref: string,
    ciphertext: Buffer,
    nonce: Buffer,
    keyVersion: number,
  ): Promise<SecretCipherRow | null> {
    const k = this.key(ownerUserId, ref);
    const existing = this.rows.get(k);
    if (!existing) return null;
    const row: SecretCipherRow = {
      ...existing,
      ciphertext,
      nonce,
      keyVersion,
      rotatedAt: new Date().toISOString(),
    };
    this.rows.set(k, row);
    return row;
  }

  async remove(ownerUserId: string, ref: string): Promise<boolean> {
    return this.rows.delete(this.key(ownerUserId, ref));
  }

  async listRefs(ownerUserId: string): Promise<readonly SecretRef[]> {
    return [...this.rows.values()]
      .filter((r) => r.ownerUserId === ownerUserId)
      .map((r) => ({
        id: r.id,
        ref: r.ref,
        ownerUserId: r.ownerUserId,
        keyVersion: r.keyVersion,
        rotatedAt: r.rotatedAt ?? null,
        createdAt: r.createdAt,
      }));
  }
}

/** An in-memory {@link VaultAdapter} using a reversible (non-crypto) transform. */
export function fakeVault(opts: { available?: boolean; keyVersion?: number } = {}): VaultAdapter {
  const available = opts.available ?? true;
  const keyVersion = opts.keyVersion ?? 1;
  const down = (): never => {
    throw new Error('vault unavailable');
  };
  return {
    available,
    keyVersion,
    status: () =>
      available ? { name: 'vault', status: 'up' } : { name: 'vault', status: 'down', reason: 'no master key' },
    async seal(plaintext: string): Promise<SealedSecret> {
      if (!available) down();
      return { ciphertext: Buffer.from(plaintext, 'utf8'), nonce: Buffer.from('nonce') };
    },
    async open(ciphertext: Buffer): Promise<string> {
      if (!available) down();
      return ciphertext.toString('utf8');
    },
  };
}

/** A vault that is available but whose `open` throws (tampered/undecryptable bytes). */
export function undecryptableVault(): VaultAdapter {
  return {
    available: true,
    keyVersion: 1,
    status: () => ({ name: 'vault', status: 'up' }),
    async seal(plaintext: string): Promise<SealedSecret> {
      return { ciphertext: Buffer.from(plaintext, 'utf8'), nonce: Buffer.from('nonce') };
    },
    async open(): Promise<string> {
      throw new Error('bad auth tag');
    },
  };
}

/** A silent logger double for services that require one. */
export const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;
