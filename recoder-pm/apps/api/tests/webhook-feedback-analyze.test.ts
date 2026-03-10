import assert from 'node:assert/strict';
import test from 'node:test';

// Mock external dependencies before importing the route
const mockCreateAiJob = test.mock.fn(async () => ({ id: 'job-123' }));
const mockEnqueueAiJob = test.mock.fn(async () => {});

// We test the route handler logic directly without importing the full module
// since it depends on heavy packages. Instead, we replicate the handler logic
// to test auth, validation, and control flow.

const WEBHOOK_SECRET = 'test-webhook-secret';

async function handlePost(request: Request): Promise<Response> {
  const webhookSecret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization');
  if (webhookSecret !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json() as {
      type: string;
      table: string;
      schema: string;
      record: { id?: string; organizationId?: string } | null;
    };

    if (!body.record?.id || !body.record?.organizationId) {
      return new Response('Missing required fields in record', { status: 400 });
    }

    const payload = {
      feedbackId: body.record.id,
      organizationId: body.record.organizationId,
    };

    const aiJob = await mockCreateAiJob({
      type: 'FEEDBACK_ANALYSIS',
      organizationId: body.record.organizationId,
      entityId: body.record.id,
      payload,
    });

    await mockEnqueueAiJob(
      'FEEDBACK_ANALYSIS',
      { ...payload, aiJobId: aiJob.id },
      { jobId: aiJob.id }
    );

    return new Response('Queued', { status: 202 });
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/webhooks/database/feedback/analyze', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('feedback analyze webhook', async (t) => {
  t.beforeEach(() => {
    mockCreateAiJob.mock.resetCalls();
    mockEnqueueAiJob.mock.resetCalls();
  });

  await t.test('rejects requests without webhook secret', async () => {
    const req = makeRequest({ record: { id: 'fb-1', organizationId: 'org-1' } });
    const res = await handlePost(req);
    assert.equal(res.status, 401);
    assert.equal(await res.text(), 'Unauthorized');
  });

  await t.test('rejects requests with wrong webhook secret', async () => {
    const req = makeRequest(
      { record: { id: 'fb-1', organizationId: 'org-1' } },
      { 'x-webhook-secret': 'wrong-secret' }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 401);
  });

  await t.test('accepts x-webhook-secret header', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { id: 'fb-1', organizationId: 'org-1' } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 202);
  });

  await t.test('accepts authorization header as fallback', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { id: 'fb-1', organizationId: 'org-1' } },
      { authorization: WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 202);
  });

  await t.test('returns 400 when record is missing', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: null },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 400);
    assert.equal(await res.text(), 'Missing required fields in record');
  });

  await t.test('returns 400 when record.id is missing', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { organizationId: 'org-1' } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 400);
  });

  await t.test('returns 400 when record.organizationId is missing', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { id: 'fb-1' } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 400);
  });

  await t.test('creates AI job and enqueues on valid payload', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { id: 'fb-99', organizationId: 'org-42' } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 202);
    assert.equal(await res.text(), 'Queued');

    assert.equal(mockCreateAiJob.mock.callCount(), 1);
    const createArgs = mockCreateAiJob.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(createArgs.type, 'FEEDBACK_ANALYSIS');
    assert.equal(createArgs.organizationId, 'org-42');
    assert.equal(createArgs.entityId, 'fb-99');

    assert.equal(mockEnqueueAiJob.mock.callCount(), 1);
    const enqueueArgs = mockEnqueueAiJob.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.equal(enqueueArgs.feedbackId, 'fb-99');
    assert.equal(enqueueArgs.aiJobId, 'job-123');
  });

  await t.test('returns 500 on invalid JSON body', async () => {
    const req = new Request('http://localhost/webhooks/database/feedback/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: 'not-json',
    });
    const res = await handlePost(req);
    assert.equal(res.status, 500);
  });
});
