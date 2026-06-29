import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeviceFlowConfig,
  requestDeviceAuthorization,
  interpretTokenResponse,
  pollDeviceTokenOnce,
  runDeviceFlow,
  type DeviceAuthorizationResponse,
} from '../../../../src/channels/cli-dist/device-flow/index';
import type {
  HttpRequest,
  HttpResponse,
  HttpTransportPort,
} from '../../../../src/ports/http-transport-port';
import { DistributionError } from '../../../../src/errors/index';

const RECODER = 'https://recoder.xyz';

/** A scripted transport: returns canned responses in order, records requests. */
function scriptedTransport(responses: HttpResponse[]): {
  transport: HttpTransportPort;
  requests: HttpRequest[];
} {
  const requests: HttpRequest[] = [];
  let i = 0;
  return {
    requests,
    transport: {
      async post(req) {
        requests.push(req);
        const res = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return res!;
      },
    },
  };
}

function res(status: number, body: unknown): HttpResponse {
  return { status, body };
}

test('requestDeviceAuthorization POSTs to recoder.xyz and parses the grant (no localhost)', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport, requests } = scriptedTransport([
    res(200, {
      device_code: 'dc_123',
      user_code: 'BCDF-GHJK',
      verification_uri: 'https://recoder.xyz/auth/cli',
      verification_uri_complete: 'https://recoder.xyz/auth/cli?user_code=BCDF-GHJK',
      expires_in: 900,
      interval: 5,
    }),
  ]);

  const grant = await requestDeviceAuthorization(config, transport);
  assert.equal(grant.deviceCode, 'dc_123');
  assert.equal(grant.userCode, 'BCDF-GHJK');
  assert.equal(grant.expiresIn, 900);
  assert.equal(grant.interval, 5);
  assert.ok(grant.verificationUri.startsWith('https://recoder.xyz'));
  assert.ok(!grant.verificationUri.includes('localhost'));

  // The request body is RFC 8628 form-encoded with the client id.
  assert.equal(requests[0]?.method, 'POST');
  assert.ok(requests[0]?.url.endsWith('/api/auth/cli/device-authorization'));
  assert.ok(requests[0]?.body.includes('client_id=recoder-code'));
});

test('requestDeviceAuthorization fails safe on HTTP error and on a malformed body', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });

  const bad = scriptedTransport([res(503, { error: 'down' })]);
  await assert.rejects(
    () => requestDeviceAuthorization(config, bad.transport),
    (e) => e instanceof DistributionError && e.code === 'provider_unavailable',
  );

  const malformed = scriptedTransport([res(200, { not: 'a grant' })]);
  await assert.rejects(
    () => requestDeviceAuthorization(config, malformed.transport),
    (e) => e instanceof DistributionError && e.code === 'invalid_input',
  );
});

test('interpretTokenResponse: pending keeps the interval', () => {
  const r = interpretTokenResponse(res(400, { error: 'authorization_pending' }), 5);
  assert.equal(r.status, 'pending');
  if (r.status === 'pending') assert.equal(r.interval, 5);
});

test('interpretTokenResponse: slow_down backs off the interval', () => {
  const r = interpretTokenResponse(res(400, { error: 'slow_down' }), 5);
  assert.equal(r.status, 'slow_down');
  if (r.status === 'slow_down') assert.equal(r.interval, 10); // +5
});

test('interpretTokenResponse: slow_down honors a larger server-sent interval', () => {
  const r = interpretTokenResponse(res(400, { error: 'slow_down', interval: 30 }), 5);
  assert.equal(r.status, 'slow_down');
  if (r.status === 'slow_down') assert.equal(r.interval, 30);
});

test('interpretTokenResponse: access_denied and expired_token are terminal', () => {
  const denied = interpretTokenResponse(
    res(400, { error: 'access_denied', error_description: 'user said no' }),
    5,
  );
  assert.equal(denied.status, 'denied');
  if (denied.status === 'denied') assert.equal(denied.description, 'user said no');

  const expired = interpretTokenResponse(res(400, { error: 'expired_token' }), 5);
  assert.equal(expired.status, 'expired');
});

test('interpretTokenResponse: success parses the token; a 2xx we cannot parse is NOT a success', () => {
  const okRes = interpretTokenResponse(
    res(200, { access_token: 'at_1', token_type: 'Bearer', refresh_token: 'rt_1', expires_in: 3600 }),
    5,
  );
  assert.equal(okRes.status, 'success');
  if (okRes.status === 'success') {
    assert.equal(okRes.token.accessToken, 'at_1');
    assert.equal(okRes.token.refreshToken, 'rt_1');
  }

  // A 2xx with garbage body must not be trusted as auth success (fail safe).
  const garbage = interpretTokenResponse(res(200, { nope: true }), 5);
  assert.equal(garbage.status, 'denied');
});

test('interpretTokenResponse: an unknown error code is a terminal denial (never poll blindly)', () => {
  const r = interpretTokenResponse(res(400, { error: 'teapot' }), 5);
  assert.equal(r.status, 'denied');
});

test('pollDeviceTokenOnce posts the device_code grant exchange', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport, requests } = scriptedTransport([res(400, { error: 'authorization_pending' })]);
  const r = await pollDeviceTokenOnce(config, transport, { deviceCode: 'dc_123', currentInterval: 5 });
  assert.equal(r.status, 'pending');
  assert.ok(requests[0]?.url.endsWith(config.tokenPath));
  assert.ok(
    requests[0]?.body.includes(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code',
    ),
  );
  assert.ok(requests[0]?.body.includes('device_code=dc_123'));
});

function grant(expiresIn = 900, interval = 1): DeviceAuthorizationResponse {
  return {
    deviceCode: 'dc_123',
    userCode: 'BCDF-GHJK',
    verificationUri: 'https://recoder.xyz/auth/cli',
    expiresIn,
    interval,
  };
}

test('runDeviceFlow: pending → slow_down → success, honoring backoff between polls', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport, requests } = scriptedTransport([
    res(400, { error: 'authorization_pending' }),
    res(400, { error: 'slow_down' }),
    res(400, { error: 'authorization_pending' }),
    res(200, { access_token: 'at_final', token_type: 'Bearer' }),
  ]);

  const slept: number[] = [];
  const outcome = await runDeviceFlow(config, transport, grant(), {
    sleep: async (s) => {
      slept.push(s);
    },
  });

  assert.equal(outcome.status, 'success');
  if (outcome.status === 'success') assert.equal(outcome.token.accessToken, 'at_final');
  assert.equal(requests.length, 4);
  // After the slow_down (interval 1 → 6) the loop slept longer.
  assert.deepEqual(slept, [1, 6, 6]);
});

test('runDeviceFlow: access_denied stops immediately (no fake success)', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport } = scriptedTransport([res(400, { error: 'access_denied', error_description: 'no' })]);
  const outcome = await runDeviceFlow(config, transport, grant(), { sleep: async () => undefined });
  assert.equal(outcome.status, 'denied');
  if (outcome.status === 'denied') assert.equal(outcome.description, 'no');
});

test('runDeviceFlow: truthful timeout — expires when the grant deadline passes, never spins forever', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  // Always pending: the loop must terminate via the deadline, not the server.
  const { transport } = scriptedTransport([res(400, { error: 'authorization_pending' })]);

  // A fake clock that advances by the slept seconds, so the deadline is real.
  let nowMs = Date.parse('2026-06-28T00:00:00Z');
  const outcome = await runDeviceFlow(config, transport, grant(3, 1), {
    now: () => new Date(nowMs),
    sleep: async (s) => {
      nowMs += s * 1000;
    },
  });
  assert.equal(outcome.status, 'expired');
});

test('runDeviceFlow: a server expired_token is surfaced as expired', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport } = scriptedTransport([res(400, { error: 'expired_token' })]);
  const outcome = await runDeviceFlow(config, transport, grant(), { sleep: async () => undefined });
  assert.equal(outcome.status, 'expired');
});
