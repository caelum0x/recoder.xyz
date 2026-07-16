'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { Handshake, ArrowRight, Mail } from 'lucide-react';

export default function PartnershipsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Handshake className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Partnerships</h1>
          <p className="text-xl text-gray-400">
            Interested in partnering with Recoder? We&apos;re open to conversations.
          </p>
        </div>

        {/* Current integrations */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Built-In Integrations</h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            Recoder currently integrates with GitHub, Vercel, Supabase, and Neon PostgreSQL.
            We support 40+ AI models through a BYOK architecture with providers like
            OpenAI, Anthropic, Google, and OpenRouter.
          </p>
          <Link
            href="/integrations"
            className="inline-flex items-center space-x-2 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <span>View all integrations</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Partnership interest */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Partner With Us</h2>
          <p className="text-gray-400 leading-relaxed mb-6">
            We&apos;re a beta-stage product and open to exploring partnerships with
            developer tool companies, AI providers, and technology platforms. If you
            think there&apos;s a good fit, reach out.
          </p>
          <a
            href="mailto:partners@recoder.xyz"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Mail className="w-5 h-5" />
            <span>partners@recoder.xyz</span>
          </a>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity text-center"
          >
            Try Recoder Free
          </Link>
          <Link
            href="/about"
            className="px-8 py-3 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <span>About Recoder</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
