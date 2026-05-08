'use client';

import React from 'react';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';
import { getStoredUTMParams } from '@/lib/utm';

interface LeadCaptureFormProps {
  source: string;
  title?: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
}

export function LeadCaptureForm({
  source,
  title = 'Not ready to sign up yet?',
  description = 'Get product updates, launch notes, and first access to agent workflow improvements without going through OAuth first.',
  placeholder = 'you@company.com',
  submitLabel = 'Get updates',
}: LeadCaptureFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }

    setError('');
    setStatus('submitting');
    trackEvent(AnalyticsEvents.CTA_CLICKED, {
      ctaLabel: 'Lead Capture Submit',
      destination: '/api/newsletter/subscribe',
      location: source,
      source: 'homepage',
    });

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          source,
          ...getStoredUTMParams(),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Subscription failed');
      }

      setStatus('success');
      setEmail('');
      trackEvent(AnalyticsEvents.CTA_CLICKED, {
        ctaLabel: 'Lead Capture Success',
        destination: '/api/newsletter/subscribe',
        location: source,
        source: 'homepage',
      });
    } catch (submitError) {
      setStatus('idle');
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to subscribe. Please try again.'
      );
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-left">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
          <div>
            <p className="font-semibold text-white">You&apos;re on the list.</p>
            <p className="mt-1 text-sm text-emerald-100/80">
              We&apos;ll send product updates and launch notes. If you want to jump in now, you can still{' '}
              <Link href="/auth/signup" className="font-medium text-white underline underline-offset-4">
                create an account
              </Link>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4">
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">{description}</p>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={placeholder}
            autoComplete="email"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-orange-500/60"
            aria-label="Email address"
            required
          />
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              <>
                {submitLabel}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-xs text-gray-500">
            Low-friction path for people who want to watch the product before connecting GitHub or Google.
          </p>
        )}
      </form>
    </div>
  );
}
