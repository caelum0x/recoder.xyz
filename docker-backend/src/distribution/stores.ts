/**
 * Durable, persistence-backed implementations of the distribution stores.
 *
 * Device grants are deliberately in-memory (short-lived secrets, 15-min TTL —
 * the package's reference store is correct). Device registrations, orgs, seats,
 * and webhook dedupe ids are long-lived audit state, so they are backed by the
 * existing atomic JSON persistence layer and survive a restart.
 *
 * recoder.xyz remains the identity authority; these stores mirror enterprise
 * binding state (device kill-switch, seat assignment) — they never become the
 * source of truth for who a user is.
 */
import type {
  DeviceRegistration,
  DeviceStore,
  Organization,
  OrgStore,
  Seat,
  SeatStore,
  WebhookDedupeStore,
} from '@recoder/distribution';
import { loadStore, debouncedSave } from '../persistence.js';

const DEVICE_STORE = 'distribution-devices';
const ORG_STORE = 'distribution-orgs';
const SEAT_STORE = 'distribution-seats';
const WEBHOOK_STORE = 'distribution-webhook-dedupe';

const MAX_WEBHOOK_IDS = 5000;

/** Device registrations keyed by deviceId, persisted atomically. */
export function createPersistentDeviceStore(): DeviceStore {
  const state = loadStore<{ devices: DeviceRegistration[] }>(DEVICE_STORE, { devices: [] });
  const byId = new Map<string, DeviceRegistration>(state.devices.map((d) => [d.deviceId, d]));

  function flush(): void {
    debouncedSave(DEVICE_STORE, { devices: [...byId.values()] });
  }

  return {
    put(device) {
      byId.set(device.deviceId, device);
      flush();
    },
    get(deviceId) {
      return byId.get(deviceId);
    },
    findByFingerprint(userId, fingerprintHash) {
      return [...byId.values()].find(
        (d) => d.userId === userId && d.fingerprintHash === fingerprintHash,
      );
    },
    listByUser(userId) {
      return [...byId.values()].filter((d) => d.userId === userId);
    },
    listByOrg(orgId) {
      return [...byId.values()].filter((d) => d.orgId === orgId);
    },
  };
}

/** Organizations keyed by orgId, persisted atomically. */
export function createPersistentOrgStore(): OrgStore {
  const state = loadStore<{ orgs: Organization[] }>(ORG_STORE, { orgs: [] });
  const byId = new Map<string, Organization>(state.orgs.map((o) => [o.orgId, o]));

  return {
    get(orgId) {
      return byId.get(orgId);
    },
    put(org) {
      byId.set(org.orgId, org);
      debouncedSave(ORG_STORE, { orgs: [...byId.values()] });
    },
  };
}

/** Seats keyed by seatId, persisted atomically (active + revoked retained). */
export function createPersistentSeatStore(): SeatStore {
  const state = loadStore<{ seats: Seat[] }>(SEAT_STORE, { seats: [] });
  const byId = new Map<string, Seat>(state.seats.map((s) => [s.seatId, s]));

  function flush(): void {
    debouncedSave(SEAT_STORE, { seats: [...byId.values()] });
  }

  return {
    put(seat) {
      byId.set(seat.seatId, seat);
      flush();
    },
    get(seatId) {
      return byId.get(seatId);
    },
    listByOrg(orgId) {
      return [...byId.values()].filter((s) => s.orgId === orgId);
    },
    findActive(orgId, userId) {
      return [...byId.values()].find(
        (s) => s.orgId === orgId && s.userId === userId && s.status === 'active',
      );
    },
  };
}

/**
 * Webhook dedupe ids, persisted and bounded. A redelivered Polar webhook is
 * recognized across restarts so an entitlement change is never re-applied.
 */
export function createPersistentWebhookDedupeStore(): WebhookDedupeStore {
  const state = loadStore<{ ids: string[] }>(WEBHOOK_STORE, { ids: [] });
  const ids = new Set<string>(state.ids);

  return {
    seen(webhookId) {
      return ids.has(webhookId);
    },
    record(webhookId) {
      ids.add(webhookId);
      if (ids.size > MAX_WEBHOOK_IDS) {
        // Drop the oldest insertion-order ids to stay bounded.
        const trimmed = [...ids].slice(ids.size - MAX_WEBHOOK_IDS);
        ids.clear();
        for (const id of trimmed) ids.add(id);
      }
      debouncedSave(WEBHOOK_STORE, { ids: [...ids] });
    },
  };
}
