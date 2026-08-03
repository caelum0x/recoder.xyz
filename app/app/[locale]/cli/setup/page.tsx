'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-provider';
import Link from 'next/link';

export default function CLISetupPage() {
  const { data: session } = useSession();
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const CodeBlock = ({ code, id }: { code: string; id: string }) => (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto font-mono text-sm border border-gray-700">
        {code}
      </pre>
      <button
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied === id ? '✓ Copied!' : 'Copy'}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-white text-black flex items-center justify-center font-bold text-sm">R</div>
                <span className="text-white font-semibold tracking-tight">Recoder</span>
              </div>
            </Link>
            {session ? (
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/auth/signin"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Set Up Your Coding Agents
          </h1>
          <p className="text-xl text-gray-400">
            Recoder is a desktop app that runs the agent CLIs you already use —
            in parallel, in isolated git worktrees.
          </p>
        </div>

        {/* Setup Steps */}
        <div className="space-y-8">
          {/* Step 1: Download the desktop app */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-neutral-800 border border-neutral-700 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Download the Recoder Desktop App</h2>
                <p className="text-gray-400 mb-4">
                  Recoder runs on macOS, Windows, and Linux. It is local-first —
                  your code and your keys stay on your machine.
                </p>
                <a
                  href="/download"
                  className="inline-block bg-white text-black hover:bg-neutral-200 font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  Download Recoder
                </a>
              </div>
            </div>
          </section>

          {/* Step 2: Install agent CLIs */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-neutral-800 border border-neutral-700 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Install the Agent CLIs You Want to Run</h2>
                <p className="text-gray-400">
                  Recoder does not replace your coding agents — it orchestrates
                  them. Install any of these (or any other terminal agent):
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-2">Claude Code</h3>
                <CodeBlock code="npm install -g @anthropic-ai/claude-code" id="claude" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">Codex</h3>
                <CodeBlock code="npm install -g @openai/codex" id="codex" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-2">opencode</h3>
                <CodeBlock code="npm install -g opencode-ai" id="opencode" />
              </div>
              <p className="text-gray-400 text-sm">
                Cursor CLI, pi, and other terminal agents work too — if it runs
                in a terminal, Recoder can run it.
              </p>
            </div>
          </section>

          {/* Step 3: BYOK */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-neutral-800 border border-neutral-700 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                3
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Bring Your Own Keys</h2>
                <p className="text-gray-400">
                  Your agents keep using the provider subscriptions and API keys
                  they already have. Recoder orchestrates; it never proxies or
                  resells tokens, and adds no markup. No Recoder account is
                  required for local use.
                </p>
              </div>
            </div>
          </section>

          {/* Step 4: Run in parallel */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-neutral-800 border border-neutral-700 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                4
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Run Agents in Parallel, Then Merge the Best</h2>
                <p className="text-gray-400 mb-4">
                  Open your repository in Recoder, describe the task once, and
                  launch it across as many agents as you want. Each runs in its own isolated git
                  worktree, so attempts never collide. When they finish, compare
                  the diffs side by side and merge the strongest one.
                </p>
              </div>
            </div>
          </section>

          {/* Next Steps */}
          <section className="bg-white/[0.02] rounded-2xl p-8 border border-neutral-800">
            <h2 className="text-2xl font-bold text-white mb-4">Next Steps</h2>
            <div className="space-y-3">
              <Link
                href="/docs/getting-started"
                className="block text-neutral-300 hover:text-white transition-colors"
              >
                → Read the getting-started guide
              </Link>
              <Link
                href="/docs"
                className="block text-neutral-300 hover:text-white transition-colors"
              >
                → Browse the full documentation
              </Link>
              <Link
                href="/docs/faq"
                className="block text-neutral-300 hover:text-white transition-colors"
              >
                → View the FAQ
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
