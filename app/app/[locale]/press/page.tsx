'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { Newspaper, Mail, ExternalLink } from 'lucide-react';

export default function PressPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Newspaper className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Press &amp; Media</h1>
          <p className="text-xl text-gray-400">
            Resources for journalists and media covering Recoder.
          </p>
        </div>

        {/* About */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">About Recoder</h2>
          <p className="text-gray-400 leading-relaxed">
            Recoder is the control plane for external coding agents. It connects tools
            like Claude Code and Codex to runtime execution, preview, task state,
            artifacts, approvals, and handoff. The platform is BYOK (Bring Your Own Key)
            by default, so teams keep their own model budget and provider choice.
          </p>
        </div>

        {/* Brand */}
        <div className="mb-12 p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Brand</h2>
          <div className="space-y-3 text-gray-400">
            <div className="flex justify-between">
              <span>Name</span>
              <span className="text-white font-medium">Recoder.xyz</span>
            </div>
            <div className="flex justify-between">
              <span>Website</span>
              <a href="https://recoder.xyz" className="text-orange-400 hover:text-orange-300">recoder.xyz</a>
            </div>
            <div className="flex justify-between">
              <span>Stage</span>
              <span className="text-white font-medium">Public Beta</span>
            </div>
            <div className="flex justify-between">
              <span>Category</span>
              <span className="text-white font-medium">AI Developer Tools</span>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Media Contact</h2>
          <p className="text-gray-400 mb-6">
            For press inquiries, interviews, or brand asset requests:
          </p>
          <a
            href="mailto:press@recoder.xyz"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Mail className="w-5 h-5" />
            <span>press@recoder.xyz</span>
          </a>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
