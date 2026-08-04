/**
 * The /api/proxy/* routes forwarded traffic to the retired cloud-IDE plane
 * (docker.recoder.xyz). They are gated behind 410 Gone with an explicit
 * machine-readable reason instead of being deleted, so stale clients get a
 * truthful retirement signal rather than a generic 404.
 */

async function expectGone(response: Response) {
  expect(response.status).toBe(410);
  const json = await response.json();
  expect(json.success).toBe(false);
  expect(json.reason).toBe('cloud_ide_retired');
}

describe('retired proxy routes return 410 Gone', () => {
  it('git proxy GET/POST', async () => {
    const { GET, POST } = await import('@/app/api/proxy/git/[...path]/route');
    await expectGone(await GET());
    await expectGone(await POST());
  });

  it('subscriptions proxy GET/POST/PUT/DELETE', async () => {
    const { GET, POST, PUT, DELETE } = await import(
      '@/app/api/proxy/subscriptions/[...path]/route'
    );
    await expectGone(await GET());
    await expectGone(await POST());
    await expectGone(await PUT());
    await expectGone(await DELETE());
  });
});
