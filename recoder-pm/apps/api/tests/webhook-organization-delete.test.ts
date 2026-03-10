import assert from 'node:assert/strict';
import test from 'node:test';

const mockPolarSubscriptionsUpdate = test.mock.fn(async () => {});

const WEBHOOK_SECRET = 'test-webhook-secret';

async function handlePost(request: Request): Promise<Response> {
  const webhookSecret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization');
  if (webhookSecret !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json() as {
      type: string;
      old_record: { id?: string; polarSubscriptionId?: string } | null;
    };

    if (!body.old_record) {
      return new Response('Missing old_record in payload', { status: 400 });
    }

    if (body.old_record.polarSubscriptionId) {
      await mockPolarSubscriptionsUpdate({
        id: body.old_record.polarSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
      });
    }

    return new Response('Organization deleted', { status: 201 });
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/webhooks/database/organization/delete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('organization delete webhook', async (t) => {
  t.beforeEach(() => {
    mockPolarSubscriptionsUpdate.mock.resetCalls();
  });

  await t.test('rejects requests without webhook secret', async () => {
    const req = makeRequest({ old_record: { id: 'org-1' } });
    const res = await handlePost(req);
    assert.equal(res.status, 401);
  });

  await t.test('returns 400 when old_record is null', async () => {
    const req = makeRequest(
      { type: 'DELETE', old_record: null },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 400);
    assert.equal(await res.text(), 'Missing old_record in payload');
  });

  await t.test('succeeds without canceling subscription when no polarSubscriptionId', async () => {
    const req = makeRequest(
      { type: 'DELETE', old_record: { id: 'org-1' } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 201);
    assert.equal(mockPolarSubscriptionsUpdate.mock.callCount(), 0);
  });

  await t.test('cancels Polar subscription when polarSubscriptionId is present', async () => {
    const req = makeRequest(
      { type: 'DELETE', old_record: { id: 'org-1', polarSubscriptionId: 'sub-123' } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 201);
    assert.equal(await res.text(), 'Organization deleted');

    assert.equal(mockPolarSubscriptionsUpdate.mock.callCount(), 1);
    const args = mockPolarSubscriptionsUpdate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(args.id, 'sub-123');
    assert.deepEqual(args.subscriptionUpdate, { cancelAtPeriodEnd: true });
  });

  await t.test('returns 500 on invalid JSON', async () => {
    const req = new Request('http://localhost/webhooks/database/organization/delete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: '{invalid',
    });
    const res = await handlePost(req);
    assert.equal(res.status, 500);
  });
});
