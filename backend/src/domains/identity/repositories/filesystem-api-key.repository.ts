/**
 * `FilesystemApiKeyStore` — a durable {@link ApiKeyStore} backed by a single JSON
 * file, for the EMBEDDED / DB-less desktop backend (no `DATABASE_URL`, so
 * `PgApiKeyStore` can't validate the minted conductor key). It is the SAME port
 * the {@link ApiKeyService} already depends on, so mint AND validate share one
 * store and the desktop can run fail-closed (STRICT_AUTH) instead of relaxing
 * auth on loopback.
 *
 * Security invariants (identical to the Pg store — the service hashes, the store
 * only persists):
 *  - the raw key is NEVER given to the store; only `keyHash` (sha256(pepper||raw))
 *    + an indexed `keyPrefix` are persisted;
 *  - the file is written atomically (temp + rename) with `0600` perms so the
 *    hashes are not world-readable;
 *  - `revoke` is owner-scoped + idempotent; `touchLastUsed` is best-effort and
 *    never throws into the hot validation path.
 *
 * Single-process only (the desktop backend) — there is no cross-process locking.
 * A corrupt/absent file reads as an empty store (never a throw).
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../../../shared/logger.js';
import type { ApiKeyStore, NewApiKeyRecord } from '../ports/api-key.port.js';
import type { PlatformApiKey } from '../types.js';

/** The persisted shape (dates as ISO strings; revived on read). */
interface StoredKey {
  id: string;
  userId: string;
  orgId?: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Injectable file seam (tests pass an in-memory fake). */
export interface KeyFileFs {
  read(): string | null;
  write(content: string): void;
}

export interface FilesystemApiKeyStoreDeps {
  readonly logger: Logger;
  /** Absolute path to the JSON key file (e.g. <userData>/api-keys.json). */
  readonly filePath?: string;
  /** Test seam; defaults to a real atomic-write fs bound to `filePath`. */
  readonly fs?: KeyFileFs;
  readonly now?: () => Date;
}

export class FilesystemApiKeyStore implements ApiKeyStore {
  private readonly log: Logger;
  private readonly fs: KeyFileFs;
  private readonly now: () => Date;
  private cache: PlatformApiKey[] | null = null;

  constructor(deps: FilesystemApiKeyStoreDeps) {
    this.log = deps.logger;
    this.now = deps.now ?? (() => new Date());
    this.fs = deps.fs ?? makeFileFs(deps.filePath ?? '');
  }

  /** The filesystem store is always "available" — no pool to connect. */
  isAvailable(): boolean {
    return true;
  }

  async insert(record: NewApiKeyRecord): Promise<PlatformApiKey> {
    const keys = this.load();
    const created: PlatformApiKey = {
      id: record.id,
      userId: record.userId,
      ...(record.orgId != null ? { orgId: record.orgId } : {}),
      name: record.name,
      keyPrefix: record.keyPrefix,
      keyHash: record.keyHash,
      scopes: [...record.scopes],
      lastUsedAt: null,
      expiresAt: record.expiresAt ?? null,
      revokedAt: null,
      createdAt: this.now(),
    };
    keys.push(created);
    this.persist(keys);
    return created;
  }

  async findByPrefix(keyPrefix: string): Promise<readonly PlatformApiKey[]> {
    return this.load().filter((k) => k.keyPrefix === keyPrefix && k.revokedAt == null);
  }

  async listForUser(userId: string): Promise<readonly PlatformApiKey[]> {
    return this.load()
      .filter((k) => k.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const keys = this.load();
    const target = keys.find((k) => k.id === id && k.userId === userId && k.revokedAt == null);
    if (!target) {
      return false;
    }
    const next = keys.map((k) => (k === target ? { ...k, revokedAt: this.now() } : k));
    this.persist(next);
    return true;
  }

  async touchLastUsed(id: string): Promise<void> {
    try {
      const keys = this.load();
      let changed = false;
      const next = keys.map((k) => {
        if (k.id === id) {
          changed = true;
          return { ...k, lastUsedAt: this.now() };
        }
        return k;
      });
      if (changed) {
        this.persist(next);
      }
    } catch (err) {
      // Best-effort: a failed touch must never fail a validation.
      this.log.warn({ err: msg(err), id }, 'filesystem api-key touchLastUsed failed (ignored)');
    }
  }

  /** Lazily read + revive the file into the in-memory cache (empty on any fault). */
  private load(): PlatformApiKey[] {
    if (this.cache != null) {
      return this.cache;
    }
    let parsed: PlatformApiKey[] = [];
    try {
      const raw = this.fs.read();
      if (raw != null && raw.trim() !== '') {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          parsed = arr.map(reviveKey).filter((k): k is PlatformApiKey => k != null);
        }
      }
    } catch (err) {
      this.log.warn({ err: msg(err) }, 'filesystem api-key store read faulted — starting empty');
      parsed = [];
    }
    this.cache = parsed;
    return parsed;
  }

  private persist(keys: PlatformApiKey[]): void {
    this.cache = keys;
    this.fs.write(JSON.stringify(keys.map(serializeKey), null, 2));
  }
}

function serializeKey(k: PlatformApiKey): StoredKey {
  return {
    id: k.id,
    userId: k.userId,
    ...(k.orgId != null ? { orgId: k.orgId } : {}),
    name: k.name,
    keyPrefix: k.keyPrefix,
    keyHash: k.keyHash,
    scopes: [...k.scopes],
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  };
}

/** Revive one persisted record; returns null when the shape is unusable. */
function reviveKey(raw: unknown): PlatformApiKey | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.userId !== 'string' || typeof r.keyHash !== 'string') return null;
  return {
    id: r.id,
    userId: r.userId,
    ...(typeof r.orgId === 'string' ? { orgId: r.orgId } : {}),
    name: typeof r.name === 'string' ? r.name : '',
    keyPrefix: typeof r.keyPrefix === 'string' ? r.keyPrefix : '',
    keyHash: r.keyHash,
    scopes: Array.isArray(r.scopes) ? r.scopes.map((s) => String(s)) : [],
    lastUsedAt: toDate(r.lastUsedAt),
    expiresAt: toDate(r.expiresAt),
    revokedAt: toDate(r.revokedAt),
    createdAt: toDate(r.createdAt) ?? new Date(0),
  };
}

/** The real atomic-write, 0600-perm file seam bound to a path. */
function makeFileFs(filePath: string): KeyFileFs {
  return {
    read: () => {
      try {
        return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
      } catch {
        return null;
      }
    },
    write: (content: string) => {
      mkdirSync(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      writeFileSync(tmp, content, { mode: 0o600 });
      renameSync(tmp, filePath);
      try {
        chmodSync(filePath, 0o600);
      } catch {
        // best-effort perms hardening; a failure here doesn't lose the write
      }
    },
  };
}

function toDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
