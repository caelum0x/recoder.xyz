import { NextRequest } from 'next/server';

const mockSendVerificationEmail = vi.fn();
const mockSendWelcomeEmail = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockSendTemporaryPasswordEmail = vi.fn();
const mockSendGettingStartedEmail = vi.fn();
const mockSendFeatureDeepDiveEmail = vi.fn();
const mockSendEngagementEmail = vi.fn();
const mockGetEmailProviderStatus = vi.fn();
const mockGetOnboardingEmailOperationsStatus = vi.fn();
const mockGetOnboardingEmailTemplateCatalog = vi.fn();

vi.mock('@/lib/email', () => ({
  getEmailProviderStatus: (...args: unknown[]) => mockGetEmailProviderStatus(...args),
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
  sendWelcomeEmail: (...args: unknown[]) => mockSendWelcomeEmail(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
  sendTemporaryPasswordEmail: (...args: unknown[]) => mockSendTemporaryPasswordEmail(...args),
  sendGettingStartedEmail: (...args: unknown[]) => mockSendGettingStartedEmail(...args),
  sendFeatureDeepDiveEmail: (...args: unknown[]) => mockSendFeatureDeepDiveEmail(...args),
  sendEngagementEmail: (...args: unknown[]) => mockSendEngagementEmail(...args),
}));

vi.mock('@/lib/services/onboarding-email.service', () => ({
  getOnboardingEmailOperationsStatus: (...args: unknown[]) => mockGetOnboardingEmailOperationsStatus(...args),
  getOnboardingEmailTemplateCatalog: (...args: unknown[]) => mockGetOnboardingEmailTemplateCatalog(...args),
}));

describe('/api/admin/test-email route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'test-admin-secret';

    mockGetEmailProviderStatus.mockReturnValue({
      provider: 'smtp',
      hasSmtp: true,
      hasResend: false,
      fromEmail: 'noreply@recoder.xyz',
    });
    mockGetOnboardingEmailOperationsStatus.mockResolvedValue({
      tableAvailable: true,
      cronSecretConfigured: true,
      maxAttempts: 3,
      counts: { pending: 2, dueNow: 1, sent: 4, failed: 0 },
      nextScheduledAt: null,
      oldestPendingAt: null,
      recentFailures: [],
      templates: [],
    });
    mockGetOnboardingEmailTemplateCatalog.mockReturnValue([
      { type: 'welcome', label: 'Welcome', timing: 'signup', description: 'Immediate welcome email.' },
    ]);
    mockSendGettingStartedEmail.mockResolvedValue({ success: true, messageId: 'msg-123' });
  });

  function req(url: string, init?: RequestInit) {
    return new NextRequest(url, init);
  }

  it('returns pipeline and rollout details for authorized GET', async () => {
    const { GET } = await import('@/app/api/admin/test-email/route');
    const response = await GET(req('http://localhost/api/admin/test-email', {
      headers: { 'x-admin-secret': 'test-admin-secret' },
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.config.activeProvider).toBe('SMTP');
    expect(json.pipeline.counts.pending).toBe(2);
    expect(json.templates.testableTypes).toContain('getting-started');
    expect(json.endpoints.cronStatus).toContain('/api/cron/process-emails?mode=status');
  });

  it('can send onboarding template test emails', async () => {
    const { POST } = await import('@/app/api/admin/test-email/route');
    const response = await POST(req('http://localhost/api/admin/test-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-secret': 'test-admin-secret',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        type: 'getting-started',
        name: 'Test User',
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockSendGettingStartedEmail).toHaveBeenCalledWith('test@example.com', 'Test User');
  });
});
