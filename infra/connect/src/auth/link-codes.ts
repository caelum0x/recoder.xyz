/**
 * Device link codes — the MVP "link a desktop" flow.
 *
 * The desktop calls `startLinkCode` (unauthenticated — it has no session of
 * its own yet) and shows the returned code to the user. The user opens
 * connect.recoder.xyz/link on an already-signed-in browser tab and claims it
 * there; `claimLinkCode` resolves the code to the browser's authenticated
 * account (resolved by the caller via `requireAccount` — this module never
 * touches a session itself) and creates the `connect_devices` row.
 *
 * Scope note: this issues NO bearer/DPoP-bound credential back to the
 * desktop yet — `getLinkStatus` only reports whether the code was claimed,
 * so the desktop can show "Linked" and stop polling. Minting a DPoP-bound
 * access token for the desktop to actually call Connect's authenticated
 * endpoints, and opening a live remote session over a managed tunnel, are
 * queued — see infra/connect/README.md's "explicitly out of scope" list.
 */
import { and, eq, lt } from 'drizzle-orm';
import { connectDevices, connectLinkCodes } from '../db/schema.js';
import type { ConnectDb } from '../db/client.js';

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const CODE_LENGTH = 8;

export function generateLinkCode(randomValues: Uint8Array = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = (randomValues[i] ?? 0) % CODE_ALPHABET.length;
    code += CODE_ALPHABET[idx];
  }
  return code;
}

export interface StartLinkInput {
  readonly label: string;
  readonly platform: string;
  readonly dpopPublicKeyThumbprint?: string;
}

export interface StartLinkResult {
  readonly code: string;
  readonly expiresAt: Date;
}

export async function startLinkCode(db: ConnectDb, input: StartLinkInput, now: Date = new Date()): Promise<StartLinkResult> {
  const code = generateLinkCode();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  await db.insert(connectLinkCodes).values({
    code,
    label: input.label,
    platform: input.platform,
    dpopPublicKeyThumbprint: input.dpopPublicKeyThumbprint ?? null,
    expiresAt,
  });
  return { code, expiresAt };
}

export type LinkStatus =
  | { readonly state: 'pending' }
  | { readonly state: 'claimed'; readonly deviceId: string }
  | { readonly state: 'expired' }
  | { readonly state: 'not_found' };

export async function getLinkStatus(db: ConnectDb, code: string, now: Date = new Date()): Promise<LinkStatus> {
  const [row] = await db.select().from(connectLinkCodes).where(eq(connectLinkCodes.code, code)).limit(1);
  if (!row) return { state: 'not_found' };
  if (row.claimedDeviceId) return { state: 'claimed', deviceId: row.claimedDeviceId };
  if (row.expiresAt.getTime() < now.getTime()) return { state: 'expired' };
  return { state: 'pending' };
}

export type ClaimLinkResult =
  | { readonly ok: true; readonly deviceId: string }
  | { readonly ok: false; readonly reason: 'not_found' | 'expired' | 'already_claimed' };

/** Claims an unexpired, unclaimed code into a new `connect_devices` row for
 * `accountId` (already resolved by the caller via `requireAccount`).
 * Single-use: a second claim of the same code fails with `already_claimed`. */
export async function claimLinkCode(db: ConnectDb, code: string, accountId: string, now: Date = new Date()): Promise<ClaimLinkResult> {
  const [row] = await db.select().from(connectLinkCodes).where(eq(connectLinkCodes.code, code)).limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.claimedDeviceId) return { ok: false, reason: 'already_claimed' };
  if (row.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' };

  const deviceId = crypto.randomUUID();
  await db.insert(connectDevices).values({
    id: deviceId,
    accountId,
    label: row.label,
    platform: row.platform,
    dpopPublicKeyThumbprint: row.dpopPublicKeyThumbprint,
    lastSeenAt: now,
  });
  await db
    .update(connectLinkCodes)
    .set({ claimedByAccountId: accountId, claimedDeviceId: deviceId })
    .where(eq(connectLinkCodes.code, code));
  return { ok: true, deviceId };
}

export interface DeviceSummary {
  readonly id: string;
  readonly label: string;
  readonly platform: string;
  readonly lastSeenAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/** Lists every device ever linked to an account (revoked devices included,
 * for audit — callers filter `revokedAt === null` for "active" in the UI). */
export async function listDevices(db: ConnectDb, accountId: string): Promise<readonly DeviceSummary[]> {
  const rows = await db.select().from(connectDevices).where(eq(connectDevices.accountId, accountId));
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    platform: row.platform,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }));
}

/**
 * Revokes a device (sign-out from that device, or an explicit user revoke).
 * Scoped to `accountId` so one account can never revoke another account's
 * device by guessing/enumerating device ids.
 */
export async function revokeDevice(db: ConnectDb, accountId: string, deviceId: string, now: Date = new Date()): Promise<boolean> {
  const result = await db
    .update(connectDevices)
    .set({ revokedAt: now })
    .where(and(eq(connectDevices.id, deviceId), eq(connectDevices.accountId, accountId)));
  return Boolean((result as { rowCount?: number }).rowCount);
}

/** Housekeeping: deletes expired, never-claimed link codes. Call from a
 * scheduled trigger (cron) once one is wired; safe to call on demand too. */
export async function pruneExpiredLinkCodes(db: ConnectDb, now: Date = new Date()): Promise<number> {
  const result = await db.delete(connectLinkCodes).where(lt(connectLinkCodes.expiresAt, now));
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}
