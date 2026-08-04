/**
 * /account — the ONE truthful account surface for the desktop-app company.
 *
 * Server component: resolves the session, reads the user's own rows directly
 * (owner-scoped WHERE userId), assembles a plain view via buildAccountView,
 * and renders five calm sections. No dashboard grid, no faked metrics —
 * anything we cannot read is shown as absent, not simulated.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { UNLIMITED } from '@/lib/entitlements';
import { buildAccountView } from './account-view';
import { ApiKeysList, DeviceSessionsList } from './revoke-lists';

export const dynamic = 'force-dynamic';

// The shipped desktop build this page offers; /download carries the artifact.
const CURRENT_VERSION = 'v0.15.0';

function featureValue(value: number): string {
  return value === UNLIMITED ? 'Unlimited' : String(value);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-800 py-8">
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
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
    <div className="min-h-screen bg-neutral-950 text-white">
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-3xl font-bold">Account</h1>
        <p className="mb-10 text-neutral-400">
          {user.name} · {user.email}
        </p>

        <Section title="Plan">
          <p className="text-sm text-neutral-300">
            <span className="font-semibold capitalize text-white">{view.plan.plan}</span>
            <span className="ml-2 text-neutral-500">({view.plan.status})</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm text-neutral-400">
            <li>Parallel agents: {featureValue(view.plan.features.parallel_agents)}</li>
            <li>Team members: {featureValue(view.plan.features.team_members)}</li>
            <li>
              Evidence retention:{' '}
              {view.plan.features.evidence_retention_days === UNLIMITED
                ? 'Unlimited'
                : `${view.plan.features.evidence_retention_days} days`}
            </li>
            <li>Assisted synthesize: {view.plan.features.assisted_synthesize ? 'Yes' : 'No'}</li>
          </ul>
          <Link
            href="/billing"
            className="mt-4 inline-block text-sm text-neutral-300 underline hover:text-white"
          >
            Manage billing
          </Link>
        </Section>

        <Section title="Usage">
          {view.usage ? (
            <ul className="space-y-1 text-sm text-neutral-400">
              <li>
                Sessions today: {view.usage.sessionsUsedToday} of {view.usage.sessionsPerDay} (
                {view.usage.remaining} remaining)
              </li>
              <li>Tokens per session: {view.usage.tokensPerSession.toLocaleString()}</li>
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No usage recorded yet.</p>
          )}
        </Section>

        <Section title="Devices & sessions">
          <DeviceSessionsList initialDevices={view.devices} />
        </Section>

        <Section title="API keys">
          <ApiKeysList initialKeys={view.apiKeys} />
        </Section>

        <Section title="Download">
          <p className="text-sm text-neutral-400">
            Recoder {CURRENT_VERSION} for macOS (Apple Silicon).
          </p>
          <div className="mt-3 flex gap-4 text-sm">
            <Link
              href="/download"
              className="rounded-lg bg-white px-4 py-2 font-semibold text-black hover:bg-neutral-200"
            >
              Download DMG
            </Link>
            <Link
              href="/changelog"
              className="px-4 py-2 text-neutral-300 underline hover:text-white"
            >
              Changelog
            </Link>
          </div>
        </Section>
      </main>
    </div>
  );
}
