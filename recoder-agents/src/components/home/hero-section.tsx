'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plug,
  ClipboardList,
  Play,
  ShieldCheck,
  GitPullRequest,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { trackCtaSignup } from '@/lib/analytics/gtm';

const GoogleSignIn = lazy(() => import('@/components/GoogleSignIn'));

const BlurredDialogOverlay = () => (
  <DialogOverlay className="bg-background/40 backdrop-blur-md" />
);

// The Agent OS loop — what users actually do with Recoder.
const LOOP = [
  { icon: Plug, label: 'Connect an agent', detail: 'Claude Code, Codex, Recoder Code, or your own runtime' },
  { icon: ClipboardList, label: 'Assign a task', detail: 'Recoder compiles a task spec + instruction bundle' },
  { icon: Play, label: 'Agent runs under policy', detail: 'Sandboxed work, verification, runtime evidence' },
  { icon: GitPullRequest, label: 'PR + preview', detail: 'Real delivery artifacts, not chat replies' },
  { icon: ShieldCheck, label: 'You approve', detail: 'First-class approval gates + full audit trail' },
];

export function HeroSection() {
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  useEffect(() => {
    if (authDialogOpen && user && !isLoading) {
      setAuthDialogOpen(false);
      router.push('/agent-os');
    }
  }, [user, isLoading, authDialogOpen, router]);

  // Primary CTA: into the control plane when signed in, else open auth.
  const openControlPlane = () => {
    if (user) {
      router.push('/agent-os');
    } else {
      trackCtaSignup();
      setAuthDialogOpen(true);
    }
  };

  return (
    <section id="hero" className="w-full min-h-dvh relative overflow-hidden">
      {/* Low-contrast product mark background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <img
          src="/icon.png"
          alt=""
          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[120vw] min-w-[640px] h-auto object-contain select-none opacity-[0.05] dark:opacity-[0.07]"
          draggable={false}
        />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-4 py-1.5 text-sm text-muted-foreground">
          Agent OS · the control plane for AI agents
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
          Not another chat box.<br className="hidden sm:block" /> A control plane for agent work.
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Connect the coding agents your team trusts, assign real software tasks, and ship through
          PRs, previews, and human approvals — with durable identity, policy, and a full audit trail.
          Recoder owns the task, runtime, and delivery state; the agents are just the runtime.
        </p>

        {/* The loop — how users actually use Recoder */}
        <div className="mt-10 grid w-full gap-3 sm:grid-cols-5">
          {LOOP.map((step, i) => (
            <div key={step.label} className="relative rounded-xl border border-border bg-background/40 p-4 text-left">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/40 text-xs font-semibold text-foreground">{i + 1}</span>
                <step.icon className="h-4 w-4 text-foreground/80" />
              </div>
              <div className="text-sm font-semibold text-foreground">{step.label}</div>
              <div className="mt-1 text-xs leading-snug text-muted-foreground">{step.detail}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={openControlPlane}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open the control plane <ArrowRight className="h-4 w-4" />
          </button>
          <Link
            href="/agents-101"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-7 py-3.5 text-base font-medium hover:bg-accent/40"
          >
            How it works
          </Link>
        </div>
      </div>

      {/* Auth Dialog */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <BlurredDialogOverlay />
        <DialogContent className="sm:max-w-md rounded-xl bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium">{tAuth('signInToContinue')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {tAuth('signInOrCreateAccountToTalk')}
            </DialogDescription>
          </DialogHeader>

          <div className="w-full space-y-3 mt-8">
            <Suspense fallback={<div className="h-12 bg-muted/20 rounded-full animate-pulse" />}>
              <GoogleSignIn returnUrl="/agent-os" />
            </Suspense>
          </div>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-background text-muted-foreground font-medium">{tAuth('orContinueWithEmail')}</span>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href={`/auth?returnUrl=${encodeURIComponent('/agent-os')}`}
              className="flex h-12 items-center justify-center w-full text-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm font-medium"
              onClick={() => { trackCtaSignup(); setAuthDialogOpen(false); }}
            >
              {tAuth('signInWithEmail')}
            </Link>
            <Link
              href={`/auth?mode=signup&returnUrl=${encodeURIComponent('/agent-os')}`}
              className="flex h-12 items-center justify-center w-full text-center rounded-full border border-border bg-background hover:bg-accent/50 transition-all font-medium"
              onClick={() => { trackCtaSignup(); setAuthDialogOpen(false); }}
            >
              {tAuth('createNewAccount')}
            </Link>
          </div>

          <div className="mt-8 text-center text-[13px] text-muted-foreground leading-relaxed">
            {tAuth('byContinuingYouAgreeSimple')}{' '}
            <a href="https://www.recoder.xyz/legal?tab=terms" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">{tAuth('termsOfService')}</a>{' '}
            and{' '}
            <a href="https://www.recoder.xyz/legal?tab=privacy" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">{tAuth('privacyPolicy')}</a>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
