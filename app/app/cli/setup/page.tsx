'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import Link from 'next/link';

export default function CLISetupPage() {
  const { data: session } = useSession();
  const [os, setOS] = useState<'mac' | 'linux' | 'windows'>('mac');
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const installCommands = {
    mac: {
      homebrew: 'brew install recoder-cli',
      npm: 'npm install -g @recoder/cli',
      curl: 'curl -fsSL https://get.recoder.xyz | bash',
    },
    linux: {
      snap: 'snap install recoder-cli',
      npm: 'npm install -g @recoder/cli',
      curl: 'curl -fsSL https://get.recoder.xyz | bash',
    },
    windows: {
      npm: 'npm install -g @recoder/cli',
      scoop: 'scoop install recoder-cli',
      installer: 'Download from https://recoder.xyz/downloads/windows',
    },
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
              <div className="bg-gradient-to-r from-orange-500 to-purple-600 text-white px-3 py-1 rounded-lg font-bold">
                recoder.xyz
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
            Recoder CLI Setup Guide
          </h1>
          <p className="text-xl text-gray-400">
            Get started with the Recoder CLI in minutes
          </p>
        </div>

        {/* OS Selection */}
        <div className="mb-8 flex justify-center gap-4">
          <button
            onClick={() => setOS('mac')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              os === 'mac'
                ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            macOS
          </button>
          <button
            onClick={() => setOS('linux')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              os === 'linux'
                ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Linux
          </button>
          <button
            onClick={() => setOS('windows')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              os === 'windows'
                ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Windows
          </button>
        </div>

        {/* Installation Steps */}
        <div className="space-y-8">
          {/* Step 1: Installation */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-purple-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Install the CLI</h2>
                <p className="text-gray-400">Choose your preferred installation method</p>
              </div>
            </div>

            <div className="space-y-4">
              {os === 'mac' && (
                <>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via Homebrew (Recommended)</h3>
                    <CodeBlock code={installCommands.mac.homebrew} id="brew" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via npm</h3>
                    <CodeBlock code={installCommands.mac.npm} id="npm-mac" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via curl</h3>
                    <CodeBlock code={installCommands.mac.curl} id="curl-mac" />
                  </div>
                </>
              )}

              {os === 'linux' && (
                <>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via Snap (Recommended)</h3>
                    <CodeBlock code={installCommands.linux.snap} id="snap" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via npm</h3>
                    <CodeBlock code={installCommands.linux.npm} id="npm-linux" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via curl</h3>
                    <CodeBlock code={installCommands.linux.curl} id="curl-linux" />
                  </div>
                </>
              )}

              {os === 'windows' && (
                <>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via npm (Recommended)</h3>
                    <CodeBlock code={installCommands.windows.npm} id="npm-windows" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Via Scoop</h3>
                    <CodeBlock code={installCommands.windows.scoop} id="scoop" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Windows Installer</h3>
                    <p className="text-gray-400 text-sm mb-2">{installCommands.windows.installer}</p>
                    <a
                      href="https://recoder.xyz/downloads/windows"
                      className="inline-block bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white font-semibold px-6 py-2 rounded-lg transition-all"
                    >
                      Download Installer
                    </a>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Step 2: Verify Installation */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-purple-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Verify Installation</h2>
                <p className="text-gray-400">Make sure the CLI is installed correctly</p>
              </div>
            </div>

            <CodeBlock code="recoder --version" id="version" />
            <p className="text-gray-400 text-sm mt-2">
              You should see the version number (e.g., v1.0.0)
            </p>
          </section>

          {/* Step 3: Authenticate */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-purple-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                3
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Authenticate</h2>
                <p className="text-gray-400">Connect the CLI to your Recoder account</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-2">Login via Browser (Recommended)</h3>
                <CodeBlock code="recoder auth login" id="login" />
                <p className="text-gray-400 text-sm mt-2">
                  This will open your browser to authorize the CLI
                </p>
              </div>

              <div>
                <h3 className="text-white font-semibold mb-2">Login with API Key</h3>
                <CodeBlock code="recoder auth login --api-key YOUR_API_KEY" id="api-key" />
                <p className="text-gray-400 text-sm mt-2">
                  Create an API key from your{' '}
                  <Link href="/dashboard/api-keys" className="text-orange-500 hover:underline">
                    dashboard
                  </Link>
                </p>
              </div>
            </div>
          </section>

          {/* Step 4: Test It Out */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-purple-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                4
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">Try Your First Command</h2>
                <p className="text-gray-400">Start generating code with AI</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-2">Check Your Status</h3>
                <CodeBlock code="recoder status" id="status" />
              </div>

              <div>
                <h3 className="text-white font-semibold mb-2">Generate Code</h3>
                <CodeBlock
                  code='recoder "create a React component for a todo list"'
                  id="generate"
                />
              </div>

              <div>
                <h3 className="text-white font-semibold mb-2">Start Chat Mode</h3>
                <CodeBlock code="recoder chat" id="chat" />
              </div>
            </div>
          </section>

          {/* Common Commands */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">Common Commands</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <code className="text-orange-500">recoder help</code>
                <p className="text-gray-400 text-sm mt-2">Show all available commands</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <code className="text-orange-500">recoder status</code>
                <p className="text-gray-400 text-sm mt-2">Check your account status</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <code className="text-orange-500">recoder chat</code>
                <p className="text-gray-400 text-sm mt-2">Start interactive chat</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <code className="text-orange-500">recoder generate</code>
                <p className="text-gray-400 text-sm mt-2">Generate code from prompt</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <code className="text-orange-500">recoder plan</code>
                <p className="text-gray-400 text-sm mt-2">Create a project plan</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <code className="text-orange-500">recoder validate</code>
                <p className="text-gray-400 text-sm mt-2">Validate generated code</p>
              </div>
            </div>
          </section>

          {/* Configuration */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">Configuration</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-2">Set Default Model</h3>
                <CodeBlock code="recoder config set model claude-3.5-sonnet" id="config-model" />
              </div>

              <div>
                <h3 className="text-white font-semibold mb-2">Enable Router (Auto-select Best Model)</h3>
                <CodeBlock code="recoder config set router true" id="config-router" />
              </div>

              <div>
                <h3 className="text-white font-semibold mb-2">View All Settings</h3>
                <CodeBlock code="recoder config list" id="config-list" />
              </div>
            </div>
          </section>

          {/* Troubleshooting */}
          <section className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">Troubleshooting</h2>

            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-semibold mb-2">Command not found</h3>
                <p className="text-gray-400 text-sm">
                  Make sure the CLI is in your PATH. Try restarting your terminal or running:
                </p>
                <CodeBlock code="source ~/.bashrc  # or ~/.zshrc" id="reload-path" />
              </div>

              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-semibold mb-2">Authentication fails</h3>
                <p className="text-gray-400 text-sm mb-2">
                  If browser authentication doesn't work, try:
                </p>
                <CodeBlock code="recoder auth logout && recoder auth login" id="reauth" />
              </div>

              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-semibold mb-2">Quota exceeded</h3>
                <p className="text-gray-400 text-sm">
                  Check your usage and consider{' '}
                  <Link href="/pricing" className="text-orange-500 hover:underline">
                    upgrading your plan
                  </Link>
                </p>
              </div>
            </div>
          </section>

          {/* Next Steps */}
          <section className="bg-gradient-to-r from-orange-500/20 to-purple-600/20 rounded-2xl p-8 border border-orange-500/50">
            <h2 className="text-2xl font-bold text-white mb-4">Next Steps</h2>
            <div className="space-y-3">
              <Link
                href="/docs"
                className="block text-orange-400 hover:text-orange-300 transition-colors"
              >
                → Read the full documentation
              </Link>
              <Link
                href="/playground"
                className="block text-orange-400 hover:text-orange-300 transition-colors"
              >
                → Try the API playground
              </Link>
              <Link
                href="/dashboard"
                className="block text-orange-400 hover:text-orange-300 transition-colors"
              >
                → View your dashboard
              </Link>
              <a
                href="https://github.com/recoder-xyz/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-orange-400 hover:text-orange-300 transition-colors"
              >
                → Star us on GitHub ⭐
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
