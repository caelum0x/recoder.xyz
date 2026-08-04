/**
 * /account — the ONE truthful account surface for the desktop-app company.
 *
 * Server component: resolves the session, reads the user's own rows directly
 * (owner-scoped WHERE userId), assembles a plain view via buildAccountView,
 * and renders calm section cards that match the marketing surface (black
 * canvas, hairline-bordered cards, one white accent). Nothing we cannot read
 * is faked — absent data reads as a quiet single-voice line, not a broken blank.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { UNLIMITED } from '@/lib/entitlements';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { buildAccountView } from './account-view';
import { ApiKeysList, DeviceSessionsList } from './revoke-lists';

export const dynamic = 'force-dynamic';

// The shipped desktop build this page offers; /download carries the artifact.
const CURRENT_VERSION = 'v0.15.0';

// Statuses that read as healthy; anything else gets the attention-toned badge.
const HEALTHY_STATUSES = new Set(['active', 'trialing']);

function featureValue(value: number): string {
  return value === UNLIMITED ? 'Unlimited' : String(value);
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const healthy = HEALTHY_STATUSES.has(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
        healthy ? 'border-white/15 text-gray-200' : 'border-red-500/30 text-red-300'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-gray-300' : 'bg-red-400'}`}
      />
      {status}
    </span>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2">
      <dt className="text-sm text-gray-400">{label}</dt>
      <dd className="text-sm text-white">{value}</dd>
    </div>
  );
}

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user?.email) {
    redirect('/auth/signin?redirect=%2Faccount');
  }

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
    },
  });
  if (!user) {
    redirect('/auth/signin?redirect=%2Faccount');
  }

  const [subscription, quota, cliSessions, apiKeys] = await Promise.all([
    prisma.subscriptions.findUnique({
      where: { userId: user.id },
      select: { planId: true, status: true },
    }),
    prisma.user_quota.findUnique({
      where: { userId: user.id },
      select: {
        sessionsPerDay: true,
        sessionsUsedToday: true,
        tokensPerSession: true,
        periodEnd: true,
      },
    }),
    prisma.cli_sessions.findMany({
      where: { userId: user.id },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        accessToken: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        isActive: true,
      },
    }),
    prisma.api_keys.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        isActive: true,
      },
    }),
  ]);

  const view = buildAccountView({ user, subscription, quota, cliSessions, apiKeys });

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      <main className="container mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">Account</h1>
          <p className="mt-2 text-gray-400">
            {user.name ? `${user.name} · ${user.email}` : user.email}
          </p>
        </header>

        <div className="space-y-6">
          <Section
            title="Plan"
            subtitle="Your subscription and what it unlocks in the desktop app."
            action={<StatusBadge status={view.plan.status} />}
          >
            <p className="text-sm text-gray-300">
              <span className="text-2xl font-semibold capitalize text-white">
                {view.plan.plan}
              </span>
            </p>
            <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              <FeatureRow
                label="Parallel agents"
                value={featureValue(view.plan.features.parallel_agents)}
              />
              <FeatureRow
                label="Team members"
                value={featureValue(view.plan.features.team_members)}
              />
              <FeatureRow
                label="Evidence retention"
                value={
                  view.plan.features.evidence_retention_days === UNLIMITED
                    ? 'Unlimited'
                    : `${view.plan.features.evidence_retention_days} days`
                }
              />
              <FeatureRow
                label="Assisted synthesize"
                value={view.plan.features.assisted_synthesize ? 'Included' : 'Not included'}
              />
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {view.canUpgrade && (
                <Link
                  href="/plan"
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  Upgrade plan
                </Link>
              )}
              <Link
                href="/billing"
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-white/40 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Manage billing
              </Link>
            </div>
          </Section>

          <Section title="Usage" subtitle="Today's activity against your plan limits.">
            {view.usage ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-400">Sessions today</span>
                    <span className="text-sm text-white">
                      <span className="font-semibold">{view.usage.sessionsUsedToday}</span>
                      <span className="text-gray-500"> / {view.usage.sessionsPerDay}</span>
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-valuenow={view.usage.usedPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Sessions used today"
                  >
                    <div
                      className="h-full rounded-full bg-white transition-all"
                      style={{ width: `${view.usage.usedPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {view.usage.remaining} remaining today
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="text-sm text-gray-400">Tokens per session</span>
                  <span className="text-sm text-white">
                    {view.usage.tokensPerSession.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No usage recorded yet.</p>
            )}
          </Section>

          <Section
            title="Devices & sessions"
            subtitle="Where you're signed in to the desktop and CLI."
          >
            <DeviceSessionsList initialDevices={view.devices} />
          </Section>

          <Section title="API keys" subtitle="Keys that authenticate the CLI and integrations.">
            <ApiKeysList initialKeys={view.apiKeys} />
          </Section>

          <Section title="Download" subtitle="Get the latest desktop build.">
            <p className="text-sm text-gray-400">
              Recoder{' '}
              <span className="font-mono text-gray-300">{CURRENT_VERSION}</span> for macOS
              (Apple Silicon).
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/download"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Download DMG
              </Link>
              <Link
                href="/changelog"
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-white/40 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Changelog
              </Link>
            </div>
          </Section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
