import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  alternates: { canonical: 'https://recoder.xyz/docs/api-reference' },
  title: 'API Reference | Recoder',
  description:
    'Complete REST API reference for the Recoder platform. Covers authentication, API key management, CLI device-flow auth, billing, user profiles, and health checks.',
  openGraph: {
    title: 'Recoder API Reference',
    description:
      'REST API documentation for the Recoder AI coding platform.',
    url: 'https://recoder.xyz/docs/api-reference',
    siteName: 'Recoder',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder API Reference',
    description:
      'REST API documentation for the Recoder AI coding platform.',
  },
};

/* ------------------------------------------------------------------ */
/*  Static endpoint data derived from the actual route handlers        */
/* ------------------------------------------------------------------ */

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  auth: string;
  rateLimit?: string;
  requestExample?: object;
  responseExample?: object;
}

interface TagGroup {
  tag: string;
  description: string;
  endpoints: Endpoint[];
}

const API: TagGroup[] = [
  /* ---------- Auth ---------- */
  {
    tag: 'Auth',
    description: 'Authentication endpoints for login, signup, and session management.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/login',
        summary: 'Log in with email and password',
        description:
          'Authenticates a user and returns session tokens. If the account has 2FA enabled a partial response is returned requiring a second verification step. An HTTP-only auth cookie is also set.',
        auth: 'None',
        rateLimit: '5 req/min',
        requestExample: { email: 'user@example.com', password: 's3cureP@ss' },
        responseExample: {
          success: true,
          user: {
            id: 'usr_abc123',
            email: 'user@example.com',
            name: 'Jane Doe',
            plan: 'free',
            apiKeyStatus: { hasKey: true, keyCount: 2 },
            entitlements: { workspaces: 1, connectedAgents: 1, previewDeploysPerMonth: 3, approvalWorkflows: 'single' },
            quota: { remaining: 5, limit: 6, resetDate: '2025-12-31T23:59:59.999Z' },
          },
          session: {
            accessToken: 'rct_AbCdEf1234567890abcdef12345678',
            refreshToken: 'rcr_AbCdEf1234567890abcdef12345678',
            expiresAt: '2026-01-30T12:00:00.000Z',
          },
        },
      },
      {
        method: 'POST',
        path: '/api/auth/signup-email',
        summary: 'Sign up with email',
        description:
          'Creates a new account. A temporary password is generated and emailed to the user. Free tier capacity is initialised with one Space, one connected agent, and private preview access.',
        auth: 'None',
        rateLimit: '5 req/min',
        requestExample: { email: 'newuser@example.com', name: 'Jane Doe' },
        responseExample: {
          success: true,
          message: 'Account created successfully! Check your email for your temporary password and welcome message.',
          email: 'newuser@example.com',
          emailSent: true,
          emailProvider: 'Resend',
        },
      },
      {
        method: 'GET',
        path: '/api/auth/sessions',
        summary: 'List active sessions',
        description:
          'Returns all active sessions for the authenticated user with device and browser information.',
        auth: 'Bearer token (cookie)',
        responseExample: {
          success: true,
          sessions: [
            {
              id: 'sess_xyz789',
              device: 'Chrome on macOS',
              browser: 'Chrome',
              os: 'macOS',
              deviceType: 'desktop',
              ipAddress: '203.0.113.42',
              lastActive: '2025-12-20T08:30:00.000Z',
              createdAt: '2025-12-01T10:00:00.000Z',
              current: true,
            },
          ],
        },
      },
      {
        method: 'DELETE',
        path: '/api/auth/sessions?id={sessionId}',
        summary: 'Revoke a session',
        description:
          'Revokes a specific session by ID. The current session cannot be revoked; use sign-out instead.',
        auth: 'Bearer token (cookie)',
        responseExample: { success: true, message: 'Session revoked successfully' },
      },
    ],
  },

  /* ---------- API Keys ---------- */
  {
    tag: 'API Keys',
    description: 'Create, list, validate, and revoke platform API keys (sk-recoder-...).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/auth/keys',
        summary: 'List API keys',
        description:
          'Returns metadata for all API keys belonging to the authenticated user. The full key value is never returned after initial generation.',
        auth: 'Bearer token',
        responseExample: {
          keys: [
            {
              id: 'key_abc123',
              keyPrefix: 'sk-recoder-abc1...',
              name: 'Production CLI',
              createdAt: '2025-06-01T10:00:00.000Z',
              lastUsedAt: '2025-12-20T08:30:00.000Z',
              usageCount: 1432,
              isActive: true,
            },
          ],
        },
      },
      {
        method: 'POST',
        path: '/api/auth/keys/generate',
        summary: 'Generate a new API key',
        description:
          'Creates a new API key. The full key value is only returned once in this response.',
        auth: 'Bearer token',
        requestExample: { name: 'Production CLI', scopes: ['cli:full', 'profile'] },
        responseExample: {
          success: true,
          keyId: 'key_xyz789',
          apiKey: 'sk-recoder-AbCdEf1234567890abcdef1234567890abcdef12345678',
          message: 'API key generated successfully',
        },
      },
      {
        method: 'POST',
        path: '/api/auth/keys/revoke',
        summary: 'Revoke an API key',
        description:
          'Permanently deactivates an API key owned by the authenticated user.',
        auth: 'Bearer token',
        requestExample: { keyId: 'key_abc123' },
        responseExample: { success: true, message: 'API key revoked successfully' },
      },
      {
        method: 'POST',
        path: '/api/auth/key-validate',
        summary: 'Validate API key (body)',
        description:
          'Validates a platform API key sent in the request body and returns associated user info. Used by the CLI.',
        auth: 'None (key in body)',
        requestExample: { apiKey: 'sk-recoder-AbCdEf1234567890' },
        responseExample: {
          valid: true,
          user: { id: 'usr_abc123', email: 'user@example.com', name: 'Jane Doe', plan: 'pro-monthly' },
          keyInfo: { id: 'key_abc123', name: 'Production CLI', scopes: ['cli:full', 'profile'] },
        },
      },
      {
        method: 'GET',
        path: '/api/auth/key-validate',
        summary: 'Validate API key (header)',
        description:
          'Validates a platform API key sent via the Authorization header as a Bearer token.',
        auth: 'Bearer sk-recoder-...',
        responseExample: {
          valid: true,
          user: { id: 'usr_abc123', email: 'user@example.com', name: 'Jane Doe', plan: 'pro-monthly' },
          keyInfo: { id: 'key_abc123', name: 'Production CLI', scopes: ['cli:full', 'profile'] },
        },
      },
    ],
  },

  /* ---------- CLI ---------- */
  {
    tag: 'CLI',
    description: 'OAuth 2.0 Device Authorization flow for the Recoder CLI.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/cli/device',
        summary: 'Generate device code',
        description:
          'Step 1 -- generates a device code and human-readable user code. The CLI displays the user code and opens the verification URI.',
        auth: 'None',
        requestExample: { client_id: 'recoder-cli' },
        responseExample: {
          device_code: 'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6',
          user_code: 'ABCD-1234',
          verification_uri: 'https://recoder.xyz/cli/auth',
          verification_uri_complete: 'https://recoder.xyz/cli/auth?code=ABCD-1234',
          expires_in: 600,
          interval: 5,
        },
      },
      {
        method: 'POST',
        path: '/api/auth/cli/authorize',
        summary: 'Authorize or deny device code',
        description:
          'Step 2 -- the logged-in user approves or denies the device code from their browser.',
        auth: 'Bearer token (cookie)',
        requestExample: { user_code: 'ABCD-1234', action: 'approve' },
        responseExample: {
          success: true,
          user: { email: 'user@example.com', name: 'Jane Doe', plan: 'free' },
        },
      },
      {
        method: 'POST',
        path: '/api/auth/cli/verify',
        summary: 'Verify access token',
        description:
          'Verifies a CLI access token (via header or body) and returns user info.',
        auth: 'Bearer rct_...',
        requestExample: { access_token: 'rct_AbCdEf1234567890abcdef12345678' },
        responseExample: {
          valid: true,
          user: { userId: 'usr_abc123', email: 'user@example.com', name: 'Jane Doe', plan: 'free', status: 'active' },
        },
      },
      {
        method: 'GET',
        path: '/api/auth/cli/validate',
        summary: 'Validate CLI session',
        description:
          'Validates the CLI access token via Authorization header and returns user info plus the session ID.',
        auth: 'Bearer rct_...',
        responseExample: {
          valid: true,
          user: { id: 'usr_abc123', email: 'user@example.com', name: 'Jane Doe', plan: 'pro-monthly', status: 'active' },
          sessionId: 'sess_xyz789',
        },
      },
    ],
  },

  /* ---------- Billing ---------- */
  {
    tag: 'Billing',
    description: 'Subscription plans, invoices, and subscription lifecycle management.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/billing/plans',
        summary: 'List subscription plans',
        description:
          'Returns all available plans with pricing, feature lists, and usage limits. No authentication required.',
        auth: 'None',
        responseExample: {
          success: true,
          plans: [
            {
              id: 'free',
              name: 'Free',
              price: 0,
              currency: 'USD',
              interval: 'month',
              features: ['Access to recoder.xyz/dashboard', 'Access to recoder-code CLI', 'All AI models', 'Must provide own OpenRouter API key'],
              limits: { workspaces: 1, connectedAgents: 1, artifactRetentionDays: 7, previewDeploysPerMonth: 3, approvalWorkflows: 'single', governance: 'basic' },
            },
            {
              id: 'pro-monthly',
              name: 'Pro (Monthly)',
              price: 29,
              currency: 'USD',
              interval: 'month',
              features: ['Everything in Free', 'More Spaces and connected agents', 'Shared approvals and artifact history', 'Preview deployment workflows'],
              limits: { workspaces: 10, connectedAgents: 5, artifactRetentionDays: 30, previewDeploysPerMonth: 50, approvalWorkflows: 'shared', governance: 'team' },
            },
          ],
        },
      },
      {
        method: 'GET',
        path: '/api/billing/invoices',
        summary: 'List invoices',
        description:
          'Returns all invoices for the authenticated user, ordered by creation date descending.',
        auth: 'Bearer token',
        responseExample: {
          success: true,
          invoices: [
            {
              id: 'inv_abc123',
              invoiceNumber: 'inv_abc123',
              date: '2025-12-01T00:00:00.000Z',
              amount: 29,
              currency: 'USD',
              status: 'paid',
              description: 'Subscription Invoice',
            },
          ],
        },
      },
      {
        method: 'POST',
        path: '/api/billing/subscription/cancel',
        summary: 'Cancel subscription',
        description:
          'Cancels the active subscription immediately or at the end of the billing period. Also propagates the cancellation to the upstream payment provider.',
        auth: 'Bearer token',
        requestExample: { reason: 'Too expensive', feedback: 'Would return if pricing were lower', cancelImmediate: false },
        responseExample: {
          success: true,
          message: 'Subscription will be cancelled on 1/31/2026',
          cancellationDate: '2026-01-31T00:00:00.000Z',
        },
      },
      {
        method: 'POST',
        path: '/api/billing/subscription/reactivate',
        summary: 'Reactivate subscription',
        description:
          'Reactivates a subscription that was set to cancel at end of period. Only works while the current period is still active.',
        auth: 'Bearer token',
        responseExample: { success: true, message: 'Subscription reactivated successfully' },
      },
    ],
  },

  /* ---------- User ---------- */
  {
    tag: 'User',
    description: 'User profile retrieval and updates.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/user/profile',
        summary: 'Get user profile',
        description:
          'Returns the user profile including subscription plan, quota usage, and account metadata.',
        auth: 'Bearer rct_...',
        responseExample: {
          success: true,
          user: {
            id: 'usr_abc123',
            email: 'user@example.com',
            name: 'Jane Doe',
            subscriptionPlan: 'pro-monthly',
            subscriptionStatus: 'active',
            hasOwnApiKey: true,
            onboardingStep: null,
            createdAt: '2025-01-15T10:00:00.000Z',
            entitlements: { workspaces: 10, connectedAgents: 5, artifactRetentionDays: 30, previewDeploysPerMonth: 50, approvalWorkflows: 'shared' },
            quota: { remaining: 10, limit: 15, resetDate: '2025-01-16T23:59:59.999Z' },
          },
        },
      },
      {
        method: 'PUT',
        path: '/api/user/profile',
        summary: 'Update user profile',
        description:
          'Updates the user profile. Allowed fields: name, username, bio, location, company, avatar_url.',
        auth: 'Bearer token',
        requestExample: { name: 'Jane Smith', bio: 'Full-stack developer', location: 'Berlin, Germany' },
        responseExample: {
          id: 'usr_abc123',
          email: 'user@example.com',
          name: 'Jane Smith',
          bio: 'Full-stack developer',
          location: 'Berlin, Germany',
        },
      },
    ],
  },

  /* ---------- Health ---------- */
  {
    tag: 'Health',
    description: 'Service health check used by monitoring tools and the CLI.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        summary: 'Health check',
        description:
          'Returns the current health status of the Recoder API service. No authentication required.',
        auth: 'None',
        responseExample: {
          status: 'healthy',
          service: 'recoder-api',
          timestamp: '2025-12-20T12:00:00.000Z',
          version: '1.0.0',
          endpoints: { ai: '/api/ai/chat', auth: '/api/auth/login', health: '/api/health' },
        },
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helper components                                                  */
/* ------------------------------------------------------------------ */

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase w-[4.5rem] shrink-0 ${METHOD_STYLES[method] ?? ''}`}
    >
      {method}
    </span>
  );
}

function JsonBlock({ data, label }: { data: object; label: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{label}</p>
      <pre className="overflow-x-auto rounded-lg bg-black/60 border border-white/5 p-4 text-xs leading-relaxed text-gray-300 font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      {/* Header row */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <MethodBadge method={ep.method} />
        <div className="min-w-0 flex-1">
          <code className="text-sm text-white font-mono break-all">{ep.path}</code>
          <p className="mt-1 text-sm font-medium text-gray-200">{ep.summary}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 space-y-3">
        <p className="text-sm text-gray-400 leading-relaxed">{ep.description}</p>

        {/* Meta pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-gray-400">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            {ep.auth}
          </span>
          {ep.rateLimit && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-amber-400">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {ep.rateLimit}
            </span>
          )}
        </div>

        {/* JSON examples */}
        <div className="grid gap-4 lg:grid-cols-2">
          {ep.requestExample && <JsonBlock data={ep.requestExample} label="Request body" />}
          {ep.responseExample && <JsonBlock data={ep.responseExample} label="Response (200)" />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* Title */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight">API Reference</h1>
          <p className="mt-3 text-lg text-gray-400 max-w-2xl">
            Complete REST API documentation for the Recoder platform. All endpoints accept and return JSON. Authenticated endpoints require a Bearer token in the{' '}
            <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-sm">Authorization</code> header.
          </p>
        </div>

        {/* Base URL */}
        <section className="mb-12 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Base URL</h2>
          <code className="text-base text-emerald-400 font-mono">https://recoder.xyz</code>
        </section>

        {/* Authentication overview */}
        <section className="mb-12 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Authentication</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/5 bg-black/40 p-4">
              <h3 className="text-sm font-semibold text-white mb-1">Bearer Token</h3>
              <p className="text-xs text-gray-400 mb-2">
                CLI access tokens (<code className="text-gray-300">rct_...</code>) or JWT session tokens from the login endpoint.
              </p>
              <pre className="text-xs text-gray-300 font-mono bg-black/60 rounded px-3 py-2">
                Authorization: Bearer rct_...
              </pre>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/40 p-4">
              <h3 className="text-sm font-semibold text-white mb-1">API Key</h3>
              <p className="text-xs text-gray-400 mb-2">
                Platform API keys (<code className="text-gray-300">sk-recoder-...</code>) for programmatic access.
              </p>
              <pre className="text-xs text-gray-300 font-mono bg-black/60 rounded px-3 py-2">
                Authorization: Bearer sk-recoder-...
              </pre>
            </div>
          </div>
        </section>

        {/* Quick nav */}
        <nav className="mb-12">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Sections</h2>
          <div className="flex flex-wrap gap-2">
            {API.map((group) => (
              <a
                key={group.tag}
                href={`#${group.tag.toLowerCase().replace(/\s+/g, '-')}`}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                {group.tag}
                <span className="ml-1.5 text-xs text-gray-500">({group.endpoints.length})</span>
              </a>
            ))}
          </div>
        </nav>

        {/* Endpoint groups */}
        {API.map((group) => (
          <section
            key={group.tag}
            id={group.tag.toLowerCase().replace(/\s+/g, '-')}
            className="mb-16 scroll-mt-24"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold">{group.tag}</h2>
              <p className="mt-1 text-sm text-gray-400">{group.description}</p>
            </div>
            <div className="space-y-4">
              {group.endpoints.map((ep) => (
                <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
              ))}
            </div>
          </section>
        ))}

        {/* Machine-readable link */}
        <section className="mt-20 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-gray-400 mb-3">
            Need the raw specification for code generation or tooling?
          </p>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Download openapi.json (OpenAPI 3.0)
          </a>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
