import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Mail, Github, Twitter, BookOpen, ShieldCheck, ArrowUpRight } from 'lucide-react';

const CONTACT_EMAIL = 'contact@recoder.xyz';

export const metadata: Metadata = {
  title: 'Contact Us | Recoder.xyz',
  description:
    'Get in touch with the Recoder team. Email us at contact@recoder.xyz for support, billing, and general questions.',
  openGraph: {
    title: 'Contact Us | Recoder.xyz',
    description: 'Reach the Recoder team at contact@recoder.xyz for support, billing, and general questions.',
    url: 'https://recoder.xyz/contact',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Contact Recoder' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Us | Recoder.xyz',
    description: 'Reach the Recoder team at contact@recoder.xyz.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/contact',
  },
};

const CHANNELS = [
  {
    icon: Github,
    title: 'GitHub',
    description: 'Report bugs, request features, and follow development in the open.',
    action: 'github.com/recoderxyz',
    href: 'https://github.com/recoderxyz',
    external: true,
  },
  {
    icon: BookOpen,
    title: 'Documentation',
    description: 'Guides, API reference, and answers to common setup questions.',
    action: 'Read the docs',
    href: '/docs',
    external: false,
  },
  {
    icon: Twitter,
    title: 'Twitter / X',
    description: 'Product updates and quick questions.',
    action: '@recoderxyz',
    href: 'https://twitter.com/recoderxyz',
    external: true,
  },
] as const;

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-black text-white antialiased">
      <SiteHeader />

      {/* Hero */}
      <section className="px-6 pt-20 pb-12">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">Contact us</h1>
          <p className="text-lg text-gray-400">
            Questions about Recoder, your subscription, or a technical issue? We read every message.
            The fastest way to reach us is by email.
          </p>
        </div>
      </section>

      {/* Primary email */}
      <section className="px-6 pb-10">
        <div className="container mx-auto max-w-3xl">
          <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/[0.06] to-transparent p-8 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
              <Mail className="h-6 w-6 text-orange-400" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Email support</h2>
            <p className="text-gray-400 mb-5">
              Support, billing, and general inquiries. We aim to reply within 2 business days.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-orange-400"
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
            <p className="mt-4 text-sm text-gray-500">
              Or copy our address:{' '}
              <span className="font-mono text-gray-300">{CONTACT_EMAIL}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Other channels */}
      <section className="px-6 pb-16">
        <div className="container mx-auto max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              const inner = (
                <>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                    <Icon className="h-5 w-5 text-orange-400" aria-hidden="true" />
                  </div>
                  <h3 className="mb-1 font-semibold">{c.title}</h3>
                  <p className="mb-3 text-sm leading-relaxed text-gray-400">{c.description}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-300">
                    {c.action}
                    {c.external && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                </>
              );
              const className =
                'flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/25';
              return c.external ? (
                <a key={c.title} href={c.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {inner}
                </a>
              ) : (
                <Link key={c.title} href={c.href} className={className}>
                  {inner}
                </Link>
              );
            })}
          </div>

          {/* Security note */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-gray-400">
              <span className="font-semibold text-gray-200">Security reports:</span> found a
              vulnerability? Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-400 underline hover:text-orange-300">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject line &ldquo;Security&rdquo; and we&rsquo;ll prioritize it.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
