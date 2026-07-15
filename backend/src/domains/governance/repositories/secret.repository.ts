/**
 * Concrete `SecretRepository` over the persistence `QueryExecutor`
 * (`governance_secrets`). Stores CIPHERTEXT + nonce + key_version ONLY — never
 * plaintext. App-layer scoped by `owner_user_id` (no Supabase RLS). All SQL is
 * parameterized `:param`; `bytea` columns bind Node `Buffer`s.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  SecretRepository,
  SecretCipherRow,
  SecretCipherInput,
} from '../ports/secrets.port.js';
import type { SecretRef } from '../types.js';

class SqlSecretRepository implements SecretRepository {
  constructor(private readonly qe: QueryExecutor) {}

  async upsert(input: SecretCipherInput): Promise<SecretCipherRow> {
    const row = await this.qe.one<QueryRow>(
      `insert into governance_secrets (ref, owner_user_id, ciphertext, nonce, key_version)
       values (:ref, :owner_user_id, :ciphertext, :nonce, :key_version)
       on conflict (owner_user_id, ref) do update
         set ciphertext = excluded.ciphertext,
             nonce = excluded.nonce,
             key_version = excluded.key_version
       returning *`,
      {
        ref: input.ref,
        owner_user_id: input.ownerUserId,
        ciphertext: input.ciphertext,
        nonce: input.nonce,
        key_version: input.keyVersion,
      },
    );
    if (!row) throw new Error('governance secret upsert returned no row');
    return mapCipherRow(row);
  }

  async find(ownerUserId: string, ref: string): Promise<SecretCipherRow | null> {
    const row = await this.qe.one<QueryRow>(
      'select * from governance_secrets where owner_user_id = :owner_user_id and ref = :ref',
      { owner_user_id: ownerUserId, ref },
    );
    return row ? mapCipherRow(row) : null;
  }

  async rotate(
    ownerUserId: string,
    ref: string,
    ciphertext: Buffer,
    nonce: Buffer,
    keyVersion: number,
  ): Promise<SecretCipherRow | null> {
    const row = await this.qe.one<QueryRow>(
      `update governance_secrets
          set ciphertext = :ciphertext, nonce = :nonce, key_version = :key_version, rotated_at = now()
        where owner_user_id = :owner_user_id and ref = :ref
      returning *`,
      { owner_user_id: ownerUserId, ref, ciphertext, nonce, key_version: keyVersion },
    );
    return row ? mapCipherRow(row) : null;
  }

  async remove(ownerUserId: string, ref: string): Promise<boolean> {
    const count = await this.qe.mutate(
      'delete from governance_secrets where owner_user_id = :owner_user_id and ref = :ref',
      { owner_user_id: ownerUserId, ref },
    );
    return count > 0;
  }

  async listRefs(ownerUserId: string): Promise<readonly SecretRef[]> {
    // Metadata only — the ciphertext/nonce bytes are never selected here.
    const rows = await this.qe.read<QueryRow>(
      `select id, ref, owner_user_id, key_version, rotated_at, created_at
         from governance_secrets where owner_user_id = :owner_user_id order by ref asc`,
      { owner_user_id: ownerUserId },
    );
    return rows.map(mapSecretRef);
  }
}

/** Build the secret repository over a `QueryExecutor`. */
export function createSecretRepository(qe: QueryExecutor): SecretRepository {
  return new SqlSecretRepository(qe);
}

// --- row mapping -------------------------------------------------------------

function mapCipherRow(row: QueryRow): SecretCipherRow {
  return {
    id: String(row.id),
    ref: String(row.ref),
    ownerUserId: String(row.owner_user_id),
    ciphertext: toBuffer(row.ciphertext),
    nonce: toBuffer(row.nonce),
    keyVersion: Number(row.key_version),
    rotatedAt: toIsoOrNull(row.rotated_at),
    createdAt: toIso(row.created_at),
  };
}

function mapSecretRef(row: QueryRow): SecretRef {
  return {
    id: String(row.id),
    ref: String(row.ref),
    ownerUserId: String(row.owner_user_id),
    keyVersion: Number(row.key_version),
    rotatedAt: toIsoOrNull(row.rotated_at),
    createdAt: toIso(row.created_at),
  };
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.alloc(0);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return toIso(value);
}
