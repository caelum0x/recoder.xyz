import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeviceSessionsList } from '@/app/[locale]/account/revoke-lists';
import type { AccountDeviceRow } from '@/app/[locale]/account/account-view';

/**
 * DeviceSessionsList: the "most recent" chip and the revoke guard.
 *
 * The guard exists because the most-recently-active session is the closest
 * (still non-certain) proxy for the device the user is on — so we confirm
 * before cutting it, and we only ever claim recency, never "current".
 */

function device(overrides: Partial<AccountDeviceRow> = {}): AccountDeviceRow {
  return {
    id: 'sess-1',
    deviceName: 'MacBook Pro',
    deviceType: 'cli',
    tokenPrefix: 'rct_abc123…',
    createdAt: '2026-08-01T00:00:00.000Z',
    lastUsedAt: '2026-08-02T00:00:00.000Z',
    revoked: false,
    isMostRecent: false,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeviceSessionsList — most-recent chip', () => {
  it('shows a neutral "Most recent" chip on the most-recent active device only', () => {
    render(
      <DeviceSessionsList
        initialDevices={[
          device({ id: 'a', deviceName: 'Studio', isMostRecent: true }),
          device({ id: 'b', deviceName: 'Laptop', isMostRecent: false }),
        ]}
      />
    );
    expect(screen.getByText('Most recent')).toBeInTheDocument();
    // Honest copy: recency, never "current device".
    expect(screen.queryByText(/current device/i)).not.toBeInTheDocument();
  });

  it('does not show the chip on a most-recent row that is already revoked', () => {
    render(
      <DeviceSessionsList
        initialDevices={[device({ id: 'a', isMostRecent: true, revoked: true })]}
      />
    );
    expect(screen.queryByText('Most recent')).not.toBeInTheDocument();
  });
});

describe('DeviceSessionsList — revoke guard', () => {
  it('aborts the revoke of the most-recent device when the user cancels the confirm', async () => {
    confirmMock.mockReturnValue(false);
    render(
      <DeviceSessionsList
        initialDevices={[device({ id: 'a', deviceName: 'Studio', isMostRecent: true })]}
      />
    );

    fireEvent.click(screen.getByLabelText('Revoke Studio'));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    // The row is untouched — still revocable, not flipped to "Revoked".
    expect(screen.getByLabelText('Revoke Studio')).toBeInTheDocument();
    expect(screen.queryByText('Revoked')).not.toBeInTheDocument();
  });

  it('proceeds with the revoke of the most-recent device when the user confirms', async () => {
    confirmMock.mockReturnValue(true);
    render(
      <DeviceSessionsList
        initialDevices={[device({ id: 'a', deviceName: 'Studio', isMostRecent: true })]}
      />
    );

    fireEvent.click(screen.getByLabelText('Revoke Studio'));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/cli-sessions?id=a',
      expect.objectContaining({ method: 'DELETE' })
    );
    await waitFor(() => expect(screen.getByText('Revoked')).toBeInTheDocument());
  });

  it('does not confirm when revoking a device that is not the most recent', async () => {
    render(
      <DeviceSessionsList
        initialDevices={[device({ id: 'b', deviceName: 'Laptop', isMostRecent: false })]}
      />
    );

    fireEvent.click(screen.getByLabelText('Revoke Laptop'));

    expect(confirmMock).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
