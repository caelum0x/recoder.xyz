'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { Smartphone, Monitor, ArrowRight, Terminal } from 'lucide-react';

export default function MobileAppPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Mobile & Desktop Apps</h1>
          <p className="text-xl text-gray-400">
            Use Recoder across your devices.
          </p>
        </div>

        {/* Desktop App */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center space-x-3 mb-4">
            <Monitor className="w-6 h-6 text-orange-400" />
            <h2 className="text-xl font-semibold">Desktop App</h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400 font-medium">
              Available
            </span>
          </div>
          <p className="text-gray-400 leading-relaxed mb-6">
            The Recoder desktop app is built with Electron and gives you a native
            experience on macOS, Windows, and Linux. It wraps the full Web IDE with
            system-level integrations like file access and notifications.
          </p>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center space-x-2 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <span>Getting started guide</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* CLI */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center space-x-3 mb-4">
            <Terminal className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-semibold">CLI Tool</h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 font-medium">
              Available
            </span>
          </div>
          <p className="text-gray-400 leading-relaxed mb-6">
            recoder-code is our terminal-based coding tool. It connects to 40+ AI
            models through your own API keys and works anywhere you have a terminal —
            including on mobile via SSH clients.
          </p>
          <Link
            href="/cli"
            className="inline-flex items-center space-x-2 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <span>Learn about the CLI</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mobile — coming soon */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center space-x-3 mb-4">
            <Smartphone className="w-6 h-6 text-gray-500" />
            <h2 className="text-xl font-semibold">Native Mobile Apps</h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-gray-400 font-medium">
              Planned
            </span>
          </div>
          <p className="text-gray-400 leading-relaxed mb-6">
            Native iOS and Android apps are on our roadmap. In the meantime, the Web
            IDE is fully responsive and works in mobile browsers, and the CLI works on
            any device with SSH access.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center space-x-2 text-gray-400 hover:text-gray-300 transition-colors"
          >
            <span>Request early access</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try Recoder Free
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
