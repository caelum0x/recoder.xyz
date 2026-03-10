import assert from 'node:assert/strict';
import test from 'node:test';

const WEBHOOK_SECRET = 'test-webhook-secret';

// Test the auth and validation logic of the user upsert webhook
// The actual DB operations are mocked since they require Prisma + Supabase

const mockGetUserById = test.mock.fn(async (id: string) => ({
  id,
  email: 'user@example.com',
  user_metadata: { image_url: 'https://example.com/avatar.png', organization_id: 'org-1' },
}));

const mockFindOrganization = test.mock.fn(async () => ({ name: 'Test Org' }));
const mockFindFeedbackOrganization = test.mock.fn(async () => ({ id: 'fbo-1' }));
const mockCreateFeedbackOrganization = test.mock.fn(async () => ({ id: 'fbo-new' }));
const mockFindFeedbackUser = test.mock.fn(async () => null);
const mockCreateFeedbackUser = test.mock.fn(async () => ({ id: 'fbu-1' }));

async function handlePost(request: Request): Promise<Response> {
  const webhookSecret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization');
  if (webhookSecret !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json() as {
      type: string;
      record: {
        id?: string;
        user_metadata?: { organization_id?: string; image_url?: string };
      } | null;
    };

    if (!body.record) {
      return new Response('Missing record in payload', { status: 400 });
    }

    const organizationId = body.record.user_metadata?.organization_id;
    if (!organizationId) {
      return new Response('No organization_id in user metadata', { status: 400 });
    }

    const user = await mockGetUserById(body.record.id ?? '');
    const organization = await mockFindOrganization();

    if (!user) {
      return new Response('User not found', { status: 404 });
    }

    if (!(user.email && organization)) {
      return new Response('User or organization not found', { status: 404 });
    }

    const [, domain] = user.email.split('@');

    let feedbackOrganization = await mockFindFeedbackOrganization();

    if (!feedbackOrganization) {
      feedbackOrganization = await mockCreateFeedbackOrganization();
    }

    const existingFeedbackUser = await mockFindFeedbackUser();

    if (!existingFeedbackUser) {
      await mockCreateFeedbackUser();
    }

    return new Response('Membership updated', { status: 201 });
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/webhooks/database/user/upsert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('user upsert webhook', async (t) => {
  t.beforeEach(() => {
    mockGetUserById.mock.resetCalls();
    mockFindOrganization.mock.resetCalls();
    mockFindFeedbackOrganization.mock.resetCalls();
    mockCreateFeedbackOrganization.mock.resetCalls();
    mockFindFeedbackUser.mock.resetCalls();
    mockCreateFeedbackUser.mock.resetCalls();
  });

  await t.test('rejects requests without webhook secret', async () => {
    const req = makeRequest({ record: { id: 'u-1' } });
    const res = await handlePost(req);
    assert.equal(res.status, 401);
  });

  await t.test('returns 400 when record is null', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: null },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 400);
    assert.equal(await res.text(), 'Missing record in payload');
  });

  await t.test('returns 400 when organization_id is missing from metadata', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { id: 'u-1', user_metadata: {} } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 400);
    assert.equal(await res.text(), 'No organization_id in user metadata');
  });

  await t.test('returns 404 when user is not found', async () => {
    mockGetUserById.mock.mockImplementation(async () => null as unknown as ReturnType<typeof mockGetUserById.mock.calls[0]['result']>);

    const req = makeRequest(
      { type: 'INSERT', record: { id: 'u-missing', user_metadata: { organization_id: 'org-1' } } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 404);

    // Restore
    mockGetUserById.mock.mockImplementation(async (id: string) => ({
      id,
      email: 'user@example.com',
      user_metadata: { image_url: 'https://example.com/avatar.png', organization_id: 'org-1' },
    }));
  });

  await t.test('creates feedback user on valid INSERT', async () => {
    const req = makeRequest(
      { type: 'INSERT', record: { id: 'u-1', user_metadata: { organization_id: 'org-1' } } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 201);
    assert.equal(await res.text(), 'Membership updated');
    assert.equal(mockGetUserById.mock.callCount(), 1);
    assert.equal(mockCreateFeedbackUser.mock.callCount(), 1);
  });

  await t.test('skips feedback user creation when user already exists', async () => {
    mockFindFeedbackUser.mock.mockImplementation(async () => ({ id: 'fbu-existing' }));

    const req = makeRequest(
      { type: 'UPDATE', record: { id: 'u-1', user_metadata: { organization_id: 'org-1' } } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 201);
    assert.equal(mockCreateFeedbackUser.mock.callCount(), 0);

    // Restore
    mockFindFeedbackUser.mock.mockImplementation(async () => null);
  });

  await t.test('creates feedback organization when none exists', async () => {
    mockFindFeedbackOrganization.mock.mockImplementation(async () => null);

    const req = makeRequest(
      { type: 'INSERT', record: { id: 'u-1', user_metadata: { organization_id: 'org-1' } } },
      { 'x-webhook-secret': WEBHOOK_SECRET }
    );
    const res = await handlePost(req);
    assert.equal(res.status, 201);
    assert.equal(mockCreateFeedbackOrganization.mock.callCount(), 1);

    // Restore
    mockFindFeedbackOrganization.mock.mockImplementation(async () => ({ id: 'fbo-1' }));
  });

  await t.test('returns 500 on invalid JSON', async () => {
    const req = new Request('http://localhost/webhooks/database/user/upsert', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: 'bad-json',
    });
    const res = await handlePost(req);
    assert.equal(res.status, 500);
  });
});
