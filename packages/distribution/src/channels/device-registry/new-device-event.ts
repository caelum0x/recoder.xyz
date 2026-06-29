import type { RunEvent } from '@recoder/agent-os';
import type { DeviceRegistration } from './device-registration';

/**
 * The structured payload emitted on the FIRST registration of a device id. A
 * host surfaces this as a "new device signed in" security signal (email / audit
 * log). It carries no secrets — only the device id, the user/org, the
 * human-facing name, and the timestamp; never the raw fingerprint.
 */
export interface NewDeviceSignal {
  readonly deviceId: string;
  readonly userId: string;
  readonly orgId?: string;
  readonly name: string;
  readonly registeredAt: string;
}

/** Project a freshly-registered device into the new-device signal payload. */
export function toNewDeviceSignal(device: DeviceRegistration): NewDeviceSignal {
  return {
    deviceId: device.deviceId,
    userId: device.userId,
    ...(device.orgId ? { orgId: device.orgId } : {}),
    name: device.name,
    registeredAt: device.registeredAt,
  };
}

/**
 * Build the audit `RunEvent` (`type: 'log'`) for a new-device signal so the
 * control plane has a trail. Distribution emits the event back to Recoder; it
 * never owns the canonical state.
 */
export function buildNewDeviceRunEvent(input: {
  signal: NewDeviceSignal;
  taskId: string;
  eventId: string;
  createdAt: string;
}): RunEvent {
  return {
    eventId: input.eventId,
    type: 'log',
    taskId: input.taskId,
    message: `new device registered: ${input.signal.name} (${input.signal.deviceId})`,
    createdAt: input.createdAt,
    data: {
      signal: 'new_device',
      deviceId: input.signal.deviceId,
      userId: input.signal.userId,
      ...(input.signal.orgId ? { orgId: input.signal.orgId } : {}),
      name: input.signal.name,
      registeredAt: input.signal.registeredAt,
    },
  };
}
