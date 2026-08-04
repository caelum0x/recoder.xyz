'use client';

/**
 * Client halves of the /account page: the two lists whose rows carry a
 * Revoke action. Rows arrive pre-redacted from the server (token prefixes
 * only); revocation goes through the owner-scoped API routes.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { AccountApiKeyRow, AccountDeviceRow } from './account-view';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function RevokeButton({ busy, revoked, onClick }: { busy: boolean; revoked: boolean; onClick: () => void }) {
  if (revoked) {
    return <span className="text-sm text-neutral-500">Revoked</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
    >
      {busy ? 'Revoking…' : 'Revoke'}
    </button>
  );
}

export function DeviceSessionsList({ initialDevices }: { initialDevices: AccountDeviceRow[] }) {
  const [devices, setDevices] = useState(initialDevices);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function revoke(id: string) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/user/cli-sessions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Revoke failed (${res.status})`);
      }
      setDevices((rows) => rows.map((row) => (row.id === id ? { ...row, revoked: true } : row)));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Revoke failed');
    } finally {
      setBusyId(null);
    }
  }

  if (devices.length === 0) {
    return <p className="text-sm text-neutral-500">No devices have signed in yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {devices.map((device) => (
        <div
          key={device.id}
          className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
        >
          <div>
            <p className="text-sm text-white">
              {device.deviceName}
              <span className="ml-2 text-xs text-neutral-500">{device.deviceType}</span>
            </p>
            <p className="text-xs text-neutral-500">
              <code>{device.tokenPrefix}</code>
              {' · created '}{formatDate(device.createdAt)}
              {' · last used '}{formatDate(device.lastUsedAt)}
            </p>
          </div>
          <RevokeButton
            busy={busyId === device.id}
            revoked={device.revoked}
            onClick={() => revoke(device.id)}
          />
        </div>
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
        throw new Error(`Revoke failed (${res.status})`);
      }
      setKeys((rows) => rows.map((row) => (row.id === id ? { ...row, isActive: false } : row)));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Revoke failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {keys.length === 0 ? (
        <p className="text-sm text-neutral-500">No API keys yet.</p>
      ) : (
        keys.map((key) => (
          <div
            key={key.id}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <div>
              <p className="text-sm text-white">{key.name}</p>
              <p className="text-xs text-neutral-500">
                <code>{key.keyPrefix}</code>
                {' · created '}{formatDate(key.createdAt)}
                {' · last used '}{formatDate(key.lastUsedAt)}
              </p>
            </div>
            <RevokeButton
              busy={busyId === key.id}
              revoked={!key.isActive}
              onClick={() => revoke(key.id)}
            />
          </div>
        ))
      )}
      <p className="text-xs text-neutral-500">
        Manage keys in{' '}
        <Link href="/settings/api" className="text-neutral-300 underline hover:text-white">
          API settings
        </Link>
        .
      </p>
    </div>
  );
}
