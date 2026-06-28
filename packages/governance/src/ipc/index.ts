/**
 * ipc — the typed Unix-domain-socket transport between the TS governance facade
 * and the owned Rust governance daemon.
 *
 * The wire format is length-prefixed JSON lines (4-byte big-endian length +
 * UTF-8 JSON), with a pinned `IpcEnvelope` request/response contract. The client
 * is hostile-by-default and fail-closed: any transport, framing, or validation
 * failure surfaces as `DaemonUnavailableError` so the facade falls back to the
 * pure-TS deny-biased path. No external dependency (node:net + JSON only).
 */

export {
  LENGTH_PREFIX_BYTES,
  MAX_FRAME_BYTES,
  FrameError,
  FrameDecoder,
  encodeFrame,
  decodeFrame,
  type DecodeStep,
} from './codec';

export {
  IPC_METHODS,
  IPC_PROTOCOL_VERSION,
  type IpcMethod,
  type IpcError,
  type IpcRequestEnvelope,
  type IpcResponseEnvelope,
  isIpcMethod,
  makeRequestEnvelope,
  parseResponseEnvelope,
} from './envelope';

export {
  GovernanceDaemonClient,
  type GovernanceDaemonClientOptions,
} from './daemon-client';
