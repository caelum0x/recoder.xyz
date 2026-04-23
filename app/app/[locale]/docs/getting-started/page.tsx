'use client';

import Link from 'next/link';
import { ArrowRight, Terminal, Globe, Key, Sparkles, CheckCircle, FolderOpen, Bot } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-green-500/20 bg-green-500/10 mb-6">
              <Sparkles className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Getting Started Guide</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              Start with Recoder in
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
                four practical steps
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              This is the real activation path: sign in, connect your provider, choose the right surface, and ship work without changing systems.
            </p>
          </div>

          <div className="space-y-8 mb-16">
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-orange-500">1</span>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-3">Create your account</h2>
                  <p className="text-gray-400 mb-4">
                    Sign in with GitHub or Google. The public site is OAuth-first and does not force a pricing decision before you can start.
                  </p>
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10 mb-4 space-y-2 text-sm text-gray-300">
                    <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> No credit card gate</div>
                    <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Shared account across product surfaces</div>
                    <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Fastest path into real work</div>
                  </div>
                  <Link href="/auth/signup" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all">
                    <span>Create account</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-purple-500">2</span>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-3">Connect your provider keys</h2>
                  <p className="text-gray-400 mb-6">
                    Recoder is BYOK-first. Connect OpenRouter, OpenAI, Anthropic, or Google and keep model choice and cost visibility under your control.
                  </p>
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    {[
                      ['OpenRouter', 'Recommended for broad model access', 'https://openrouter.ai/keys?ref=recoder'],
                      ['Anthropic', 'Strong option when Claude is your default', 'https://console.anthropic.com/settings/keys'],
                      ['OpenAI', 'Use when GPT models are central to your workflow', 'https://platform.openai.com/api-keys'],
                    ].map(([name, text, href]) => (
                      <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="p-4 rounded-xl border border-white/10 bg-white/5 hover:border-white/20 transition-colors">
                        <div className="font-semibold text-white mb-2">{name}</div>
                        <div className="text-sm text-gray-400">{text}</div>
                      </a>
                    ))}
                  </div>
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-start gap-2 text-sm text-gray-300">
                      <Key className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-white">Why BYOK?</span><br />
                        You pay the provider directly, keep vendor flexibility, and avoid being boxed into one hosted model policy.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-cyan-400">3</span>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-3">Choose the surface that matches the job</h2>
                  <p className="text-gray-400 mb-6">
                    You do not need to commit to one mode forever. Pick the fastest surface for the work in front of you.
                  </p>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-5 rounded-xl border border-orange-500/20 bg-orange-500/5">
                      <Bot className="w-6 h-6 text-orange-400 mb-3" />
                      <h3 className="font-semibold mb-2">Agents</h3>
                      <p className="text-sm text-gray-400">Best for multi-turn implementation, tool use, and preview-oriented work.</p>
                    </div>
                    <div className="p-5 rounded-xl border border-purple-500/20 bg-purple-500/5">
                      <Globe className="w-6 h-6 text-purple-400 mb-3" />
                      <h3 className="font-semibold mb-2">Browser projects</h3>
                      <p className="text-sm text-gray-400">Fastest way to prototype, inspect previews, and manage projects visually.</p>
                    </div>
                    <div className="p-5 rounded-xl border border-orange-500/20 bg-orange-500/5">
                      <Terminal className="w-6 h-6 text-orange-400 mb-3" />
                      <h3 className="font-semibold mb-2">CLI</h3>
                      <p className="text-sm text-gray-400">Use local terminal flow when the work belongs on your machine and in your editor.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-green-400">4</span>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-3">Start building and keep momentum</h2>
                  <p className="text-gray-400 mb-6">
                    Once your account and provider are set, the main goal is activation: get to a real project, real prompt, or real workflow quickly.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mb-6">
                    <Link href="/projects" className="p-5 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition-colors">
                      <FolderOpen className="w-6 h-6 text-purple-400 mb-3" />
                      <h3 className="font-semibold mb-2">Open Projects</h3>
                      <p className="text-sm text-gray-400">Use the browser project surface for previews, files, and first-run builds.</p>
                    </Link>
                    <Link href="/dashboard" className="p-5 rounded-xl border border-orange-500/20 bg-orange-500/5 hover:border-orange-500/40 transition-colors">
                      <Sparkles className="w-6 h-6 text-orange-400 mb-3" />
                      <h3 className="font-semibold mb-2">Go to Dashboard</h3>
                      <p className="text-sm text-gray-400">Use the dashboard as the cross-surface launch point for the rest of the ecosystem.</p>
                    </Link>
                  </div>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-gray-300">
                    <span className="font-semibold text-white">Practical tip:</span> Start where you can get the first successful result fastest, then move across Agents, Projects, CLI, PM, and Agency as the work expands.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10 mb-12">
            <h2 className="text-3xl font-bold mb-6">What to explore next</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Link href="/docs/faq" className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Read the FAQ</h3>
                    <p className="text-sm text-gray-400">Common product and BYOK questions answered</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
              <Link href="/customers" className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">See customer workflows</h3>
                    <p className="text-sm text-gray-400">Proof-oriented examples of how teams use Recoder</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            </div>
          </div>

          <div className="text-center">
            <p className="text-gray-400 mb-4">Need help?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="mailto:support@recoder.xyz" className="px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all">
                Email support
              </a>
              <Link href="/contact" className="px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all">
                Contact team
              </Link>
              <Link href="/learn" className="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all">
                Explore learn hub
              </Link>
            </div>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
