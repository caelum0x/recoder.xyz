import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('/api/billing/plans route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function req(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init);
  }

  it('returns 200 with success: true', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('returns plans as an array', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    expect(Array.isArray(json.plans)).toBe(true);
  });

  it('returns exactly 4 plans', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    expect(json.plans).toHaveLength(4);
  });

  it('includes free, pro-monthly, pro-yearly, and enterprise plan IDs', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    const planIds = json.plans.map((p: { id: string }) => p.id);
    expect(planIds).toContain('free');
    expect(planIds).toContain('pro-monthly');
    expect(planIds).toContain('pro-yearly');
    expect(planIds).toContain('enterprise');
  });

  it('each plan has required fields: id, name, price, features, limits', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    for (const plan of json.plans) {
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('price');
      expect(plan).toHaveProperty('features');
      expect(plan).toHaveProperty('limits');
      expect(typeof plan.id).toBe('string');
      expect(typeof plan.name).toBe('string');
      expect(typeof plan.price).toBe('number');
      expect(Array.isArray(plan.features)).toBe(true);
      expect(typeof plan.limits).toBe('object');
    }
  });

  it('each plan has currency and interval fields', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    for (const plan of json.plans) {
      expect(plan).toHaveProperty('currency');
      expect(plan).toHaveProperty('interval');
      expect(plan.currency).toBe('USD');
      expect(['month', 'year']).toContain(plan.interval);
    }
  });

  it('each plan limits has workspace-centric commercial fields', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    for (const plan of json.plans) {
      expect(plan.limits).toHaveProperty('workspaces');
      expect(plan.limits).toHaveProperty('connectedAgents');
      expect(plan.limits).toHaveProperty('artifactRetentionDays');
      expect(plan.limits).toHaveProperty('previewDeploysPerMonth');
      expect(plan.limits).toHaveProperty('approvalWorkflows');
      expect(plan.limits).toHaveProperty('governance');
      expect(typeof plan.limits.workspaces).toBe('number');
      expect(typeof plan.limits.connectedAgents).toBe('number');
      expect(typeof plan.limits.artifactRetentionDays).toBe('number');
      expect(typeof plan.limits.previewDeploysPerMonth).toBe('number');
      expect(typeof plan.limits.approvalWorkflows).toBe('string');
      expect(typeof plan.limits.governance).toBe('string');
    }
  });

  it('free plan has price 0', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    const freePlan = json.plans.find((p: { id: string }) => p.id === 'free');
    expect(freePlan).toBeDefined();
    expect(freePlan.price).toBe(0);
  });

  it('pro-monthly plan has price 29', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    const proMonthly = json.plans.find((p: { id: string }) => p.id === 'pro-monthly');
    expect(proMonthly).toBeDefined();
    expect(proMonthly.price).toBe(29);
  });

  it('pro-yearly plan has yearly interval', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    const proYearly = json.plans.find((p: { id: string }) => p.id === 'pro-yearly');
    expect(proYearly).toBeDefined();
    expect(proYearly.interval).toBe('year');
    expect(proYearly.price).toBe(290);
  });

  it('enterprise plan has price 99', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    const enterprise = json.plans.find((p: { id: string }) => p.id === 'enterprise');
    expect(enterprise).toBeDefined();
    expect(enterprise.price).toBe(99);
  });

  it('each plan features is a non-empty array of strings', async () => {
    const { GET } = await import('@/app/api/billing/plans/route');
    const response = await GET(req('http://localhost/api/billing/plans'));
    const json = await response.json();

    for (const plan of json.plans) {
      expect(plan.features.length).toBeGreaterThan(0);
      for (const feature of plan.features) {
        expect(typeof feature).toBe('string');
      }
    }
  });
});
