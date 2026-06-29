import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeviceFlowConfig,
  createFetchTransport,
  signInWithDeviceFlow,
  type DeviceSignInPrompt,
} from '../../../../src/channels/cli-dist/device-flow/index';
import type {
  HttpRequest,
  HttpResponse,
  HttpTransportPort,
} from '../../../../src/ports/http-transport-port';
import { DistributionError } from '../../../../src/errors/index';

const RECODER = 'https://recoder.xyz';

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
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return r!;
      },
    },
  };
}

function res(status: number, body: unknown): HttpResponse {
  return { status, body };
}

const AUTH_OK = res(200, {
  device_code: 'dc_1',
  user_code: 'BCDF-GHJK',
  verification_uri: 'https://recoder.xyz/auth/cli',
  verification_uri_complete: 'https://recoder.xyz/auth/cli?user_code=BCDF-GHJK',
  expires_in: 900,
  interval: 1,
});

test('signInWithDeviceFlow: prompts the user, polls, and returns the token (full happy path)', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport, requests } = scriptedTransport([
    AUTH_OK,
    res(400, { error: 'authorization_pending' }),
    res(200, { access_token: 'at_final', token_type: 'Bearer', refresh_token: 'rt_1' }),
  ]);

  let prompt: DeviceSignInPrompt | undefined;
  const result = await signInWithDeviceFlow(config, transport, {
    sleep: async () => undefined,
    onPrompt: (p) => {
      prompt = p;
    },
  });

  // The user was prompted with the code + URI from recoder.xyz.
  assert.equal(prompt?.userCode, 'BCDF-GHJK');
  assert.equal(prompt?.verificationUri, 'https://recoder.xyz/auth/cli');
  assert.equal(prompt?.verificationUriComplete, 'https://recoder.xyz/auth/cli?user_code=BCDF-GHJK');
  assert.equal(prompt?.expiresIn, 900);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.token.accessToken, 'at_final');
    assert.equal(result.authorization.deviceCode, 'dc_1');
  }
  // authorize + 2 polls.
  assert.equal(requests.length, 3);
});

test('signInWithDeviceFlow: a denial after authorization is returned, not thrown', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport } = scriptedTransport([
    AUTH_OK,
    res(400, { error: 'access_denied', error_description: 'user declined' }),
  ]);

  const result = await signInWithDeviceFlow(config, transport, {
    sleep: async () => undefined,
    onPrompt: () => undefined,
  });
  assert.equal(result.status, 'denied');
  if (result.status === 'denied') {
    assert.equal(result.description, 'user declined');
    assert.equal(result.authorization.userCode, 'BCDF-GHJK');
  }
});

test('signInWithDeviceFlow: a failed authorization throws a typed error (never a fake prompt)', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport } = scriptedTransport([res(503, { error: 'down' })]);

  let prompted = false;
  await assert.rejects(
    () =>
      signInWithDeviceFlow(config, transport, {
        sleep: async () => undefined,
        onPrompt: () => {
          prompted = true;
        },
      }),
    (e) => e instanceof DistributionError && e.code === 'provider_unavailable',
  );
  // No authorization → the user is never prompted with a fabricated code.
  assert.equal(prompted, false);
});

test('signInWithDeviceFlow: truthful timeout — expires at the grant deadline, never spins forever', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const { transport } = scriptedTransport([
    res(200, {
      device_code: 'dc_1',
      user_code: 'BCDF-GHJK',
      verification_uri: 'https://recoder.xyz/auth/cli',
      expires_in: 3,
      interval: 1,
    }),
    res(400, { error: 'authorization_pending' }),
  ]);

  let nowMs = Date.parse('2026-06-29T00:00:00Z');
  const result = await signInWithDeviceFlow(config, transport, {
    now: () => new Date(nowMs),
    sleep: async (s) => {
      nowMs += s * 1000;
    },
    onPrompt: () => undefined,
  });
  assert.equal(result.status, 'expired');
});

test('createFetchTransport: posts via the injected fetch and parses JSON', async () => {
  let seenUrl = '';
  let seenInit: { method: string; headers: Record<string, string>; body: string } | undefined;
  const transport = createFetchTransport({
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return { status: 200, async text() { return JSON.stringify({ ok: true }); } };
    },
  });

  const out = await transport.post({
    url: 'https://recoder.xyz/api/auth/cli/token',
    method: 'POST',
    headers: { accept: 'application/json' },
    body: 'grant_type=device_code',
  });

  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true });
  assert.equal(seenUrl, 'https://recoder.xyz/api/auth/cli/token');
  assert.equal(seenInit?.method, 'POST');
  assert.equal(seenInit?.body, 'grant_type=device_code');
});

test('createFetchTransport: an empty/non-JSON body yields body:null (a 2xx is never faked into success)', async () => {
  const transport = createFetchTransport({
    fetchImpl: async () => ({ status: 200, async text() { return ''; } }),
  });
  const out = await transport.post({
    url: 'https://recoder.xyz/x',
    method: 'POST',
    headers: {},
    body: '',
  });
  assert.equal(out.status, 200);
  assert.equal(out.body, null);
});

test('createFetchTransport: a transport failure becomes a typed provider_unavailable error', async () => {
  const transport = createFetchTransport({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(
    () => transport.post({ url: 'https://recoder.xyz/x', method: 'POST', headers: {}, body: '' }),
    (e) => e instanceof DistributionError && e.code === 'provider_unavailable',
  );
});

test('createFetchTransport: a full sign-in runs over the fetch adapter end to end', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const bodies = [
    JSON.stringify({
      device_code: 'dc_1',
      user_code: 'WXYZ-1234',
      verification_uri: 'https://recoder.xyz/auth/cli',
      expires_in: 900,
      interval: 1,
    }),
    JSON.stringify({ access_token: 'at_e2e', token_type: 'Bearer' }),
  ];
  let i = 0;
  const transport = createFetchTransport({
    fetchImpl: async () => {
      const body = bodies[Math.min(i, bodies.length - 1)]!;
      const status = i === 0 ? 200 : 200;
      i += 1;
      return { status, async text() { return body; } };
    },
  });

  const result = await signInWithDeviceFlow(config, transport, {
    sleep: async () => undefined,
    onPrompt: () => undefined,
  });
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.token.accessToken, 'at_e2e');
});
