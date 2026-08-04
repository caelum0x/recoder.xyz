'use client';

/**
 * Client halves of the /account page: the two lists whose rows carry a
 * Revoke action. Rows arrive pre-redacted from the server (token prefixes
 * only); revocation goes through the owner-scoped API routes.
 *
 * Presentation matches the marketing surface — hairline-bordered rows, mono
 * prefixes, three-tier text ramp. Revoke is optimistic-quiet: the row flips to
 * "Revoked" on success and surfaces a truthful, specific line on failure.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { AccountApiKeyRow, AccountDeviceRow } from './account-view';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/20">
      {children}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  // Quiet + specific per design reference: a small desaturated marker, no red banner.
  return (
    <p className="flex items-center gap-2 text-sm text-red-300" role="alert">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
      {children}
    </p>
  );
}

function RevokeButton({
  busy,
  revoked,
  label,
  onClick,
}: {
  busy: boolean;
  revoked: boolean;
  label: string;
  onClick: () => void;
}) {
  if (revoked) {
    return <span className="text-sm text-gray-500">Revoked</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className={`text-sm text-red-400 transition-colors hover:text-red-300 disabled:cursor-default disabled:opacity-50 ${FOCUS_RING}`}
    >
      {busy ? 'Revoking…' : 'Revoke'}
    </button>
  );
}

/**
 * Quiet "most recent" chip. Deliberately NOT labelled "current device": the
 * web viewer and these desktop cli_sessions share no join key, so the only
 * truthful claim is recency, not presence (see AccountDeviceRow.isMostRecent).
 */
function MostRecentChip() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-white/15 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-gray-300">
      Most recent
    </span>
  );
}

export function DeviceSessionsList({ initialDevices }: { initialDevices: AccountDeviceRow[] }) {
  const [devices, setDevices] = useState(initialDevices);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function revoke(id: string) {
    // Guard the most-recently-active session: it is most likely (never
    // certainly) the device you are on, so confirm before cutting it. Copy
    // stays truthful about what we actually know — recency, not presence.
    const target = devices.find((row) => row.id === id);
    if (target?.isMostRecent && !target.revoked) {
      const proceed =
        typeof window === 'undefined' ||
        window.confirm('This is your most recently active device. Revoke anyway?');
      if (!proceed) return;
    }

    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/user/cli-sessions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Couldn't revoke this device (${res.status}). Try again.`);
      }
      setDevices((rows) => rows.map((row) => (row.id === id ? { ...row, revoked: true } : row)));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Couldn't revoke this device.");
    } finally {
      setBusyId(null);
    }
  }

  if (devices.length === 0) {
    return <EmptyLine>No devices have signed in yet.</EmptyLine>;
  }

  return (
    <div className="space-y-3">
      {error && <ErrorLine>{error}</ErrorLine>}
      {devices.map((device) => (
        <Row key={device.id}>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">
              {device.deviceName}
              <span className="ml-2 text-xs text-gray-500">{device.deviceType}</span>
              {device.isMostRecent && !device.revoked && <MostRecentChip />}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              <code className="font-mono">{device.tokenPrefix}</code>
              {' · created '}
              {formatDate(device.createdAt)}
              {' · last used '}
              {formatDate(device.lastUsedAt)}
            </p>
          </div>
          <RevokeButton
            busy={busyId === device.id}
            revoked={device.revoked}
            label={`Revoke ${device.deviceName}`}
            onClick={() => revoke(device.id)}
          />
        </Row>
      ))}
    </div>
  );
}

export function ApiKeysList({ initialKeys }: { initialKeys: AccountApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function revoke(id: string) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/user/api-keys?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Couldn't revoke this key (${res.status}). Try again.`);
      }
      setKeys((rows) => rows.map((row) => (row.id === id ? { ...row, isActive: false } : row)));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Couldn't revoke this key.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorLine>{error}</ErrorLine>}
      {keys.length === 0 ? (
        <EmptyLine>No API keys yet.</EmptyLine>
      ) : (
        keys.map((key) => (
          <Row key={key.id}>
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{key.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                <code className="font-mono">{key.keyPrefix}</code>
                {' · created '}
                {formatDate(key.createdAt)}
                {' · last used '}
                {formatDate(key.lastUsedAt)}
              </p>
            </div>
            <RevokeButton
              busy={busyId === key.id}
              revoked={!key.isActive}
              label={`Revoke ${key.name}`}
              onClick={() => revoke(key.id)}
            />
          </Row>
        ))
      )}
      <p className="pt-1 text-xs text-gray-500">
        Manage keys in{' '}
        <Link
          href="/settings/api"
          className={`text-gray-300 underline transition-colors hover:text-white ${FOCUS_RING}`}
        >
          API settings
        </Link>
        .
      </p>
    </div>
  );
}
