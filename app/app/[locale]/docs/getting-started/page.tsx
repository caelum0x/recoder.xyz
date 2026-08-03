'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Download,
  Key,
  Sparkles,
  CheckCircle,
  GitBranch,
  GitMerge,
  Terminal,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Main Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-green-500/20 bg-green-500/10 mb-6">
              <Sparkles className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Getting Started Guide</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              Many agents in parallel.
              <br />
              <span className="text-orange-400">One trusted merge.</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Recoder is a self-hosted desktop workspace that runs your coding
              agents — Claude Code, Codex, opencode, and more — in parallel
              isolated git worktrees, then helps you review and merge the best
              result. Here&apos;s the whole loop in four steps.
            </p>
          </div>

          {/* Quick Start Steps */}
          <div className="space-y-8 mb-16">
            <h2 className="text-3xl font-bold">Quick Start (5 minutes)</h2>

            {/* Step 1 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-orange-500">1</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Download the Desktop App</h3>
                  <p className="text-gray-400 mb-4">
                    Recoder runs on your machine — macOS, Windows, or Linux. It is
                    local-first: your code and your keys never leave your computer
                    unless you turn on team features.
                  </p>
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10 mb-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-400 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>No account required to start</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-400 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>Self-hosted — runs entirely on your machine</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>macOS build is signed and notarized</span>
                    </div>
                  </div>
                  <a
                    href="/download"
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Recoder</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-purple-500">2</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Bring Your Own Agents &amp; Keys</h3>
                  <p className="text-gray-400 mb-4">
                    Recoder drives the coding agents you already use — it does not
                    replace them. Install any agent CLIs you want to run:
                  </p>

                  <div className="grid md:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold">Claude Code</span>
                      </div>
                      <div className="text-sm text-gray-300 font-mono text-xs p-2 rounded bg-black/40 border border-white/10">
                        npm install -g @anthropic-ai/claude-code
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold">Codex</span>
                      </div>
                      <div className="text-sm text-gray-300 font-mono text-xs p-2 rounded bg-black/40 border border-white/10">
                        npm install -g @openai/codex
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold">opencode</span>
                      </div>
                      <div className="text-sm text-gray-300 font-mono text-xs p-2 rounded bg-black/40 border border-white/10">
                        npm install -g opencode-ai
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold">Any other agent CLI</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Cursor CLI, pi, and other terminal agents work too — if it
                        runs in a terminal, Recoder can run it.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-start space-x-2">
                      <Key className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-300">
                        <span className="font-semibold text-white">BYOK — Bring Your Own Keys.</span>{' '}
                        Your agents keep using the provider subscriptions and API
                        keys they already have. Recoder orchestrates; it never
                        proxies or resells tokens, and adds no markup.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-green-500">3</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Run Agents in Parallel</h3>
                  <p className="text-gray-400 mb-4">
                    Open your repository in Recoder and point one or more agents at
                    the same task.
                  </p>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">a</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Open the Recoder desktop app and add your git repository as a workspace
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">b</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Describe the task once, then launch it across several agents — mix and
                        match Claude Code, Codex, opencode, or several runs of the
                        same agent
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">c</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Watch each run live in its own terminal — pause, steer, or
                        stop any of them at any time
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-start space-x-2">
                      <GitBranch className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-300">
                        <span className="font-semibold text-white">Isolated git worktrees.</span>{' '}
                        Every agent works in its own worktree on its own branch, so
                        parallel attempts never collide and your working tree stays
                        clean.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-blue-500">4</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Review &amp; Merge the Best Result</h3>
                  <p className="text-gray-400 mb-6">
                    Fan-out is easy; convergence is the hard part. When the runs
                    finish, Recoder shows you what each agent actually changed.
                  </p>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-blue-400">a</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Compare the divergent diffs side by side instead of
                        hand-refereeing a pile of conflicting branches
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-blue-400">b</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Merge the best attempt into your branch — and discard the
                        rest with one click
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-blue-400">c</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Keep an evidence record of what ran, what changed, and who
                        approved it
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-start space-x-2">
                      <GitMerge className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-300">
                        <span className="font-semibold text-white">Pro tip:</span>{' '}
                        Launch three attempts at a hard task instead of one. Reviewing
                        three finished diffs is faster than babysitting a single agent
                        — that&apos;s the convergence loop.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10">
            <h2 className="text-3xl font-bold mb-6">🎉 You&apos;re All Set!</h2>
            <p className="text-gray-300 mb-6">
              That&apos;s the whole loop: launch, compare, merge. A Recoder account
              is optional for local use — sign in when you want team features.
              Here&apos;s what to explore next:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <a
                href="/download"
                className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Download the App</h3>
                    <p className="text-sm text-gray-400">macOS, Windows &amp; Linux builds</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </a>

              <Link
                href="/docs/faq"
                className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Read the FAQ</h3>
                    <p className="text-sm text-gray-400">Common questions answered</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            </div>
          </div>

          {/* Support */}
          <div className="mt-12 text-center">
            <p className="text-gray-400 mb-4">Need help? We&apos;re here for you!</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="mailto:recoderxyz@gmail.com"
                className="px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
              >
                Email Us
              </a>
              <a
                href="https://twitter.com/recoderxyz"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
              >
                Message on Twitter
              </a>
              <Link
                href="/docs/faq"
                className="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all"
              >
                View FAQ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
