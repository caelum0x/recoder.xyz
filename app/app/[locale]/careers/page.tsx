'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { Briefcase, ArrowRight, Mail } from 'lucide-react';

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Careers at Recoder</h1>
          <p className="text-xl text-gray-400">
            We&apos;re a small, early-stage team building the control plane for external coding agents.
          </p>
        </div>

        {/* About */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Who We Are</h2>
          <p className="text-gray-400 leading-relaxed">
            Recoder is currently in public beta. We&apos;re building the workflow layer around
            external coding agents so teams can execute real software work across runtime,
            preview, task state, approvals, and handoff. We&apos;re remote-first and move fast.
          </p>
        </div>

        {/* Open Roles */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Open Roles</h2>
          <p className="text-gray-400 leading-relaxed mb-6">
            We don&apos;t have formal job listings right now. As we grow, positions will
            be posted here. If you&apos;re passionate about AI developer tools and want to
            be considered for future openings, reach out directly.
          </p>
          <a
            href="mailto:careers@recoder.xyz"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Mail className="w-5 h-5" />
            <span>careers@recoder.xyz</span>
          </a>
        </div>

        {/* What we value */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">What We Value</h2>
          <ul className="space-y-3 text-gray-400">
            <li className="flex items-start space-x-3">
              <span className="text-orange-400 mt-1">-</span>
              <span>Ship fast, iterate in the open</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-orange-400 mt-1">-</span>
              <span>Honest products — no fake metrics or inflated claims</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-orange-400 mt-1">-</span>
              <span>Developer experience above everything</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-orange-400 mt-1">-</span>
              <span>Remote-first, async-friendly, low-meeting culture</span>
            </li>
          </ul>
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
