'use client';

import Link from 'next/link';
import { Terminal, Globe, ArrowRight, Github, Sparkles, Copy, Check, Code, Zap, Shield, Cpu } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/lib/session-provider';
import { getRecoderWebUrlClient, getServiceUrlClient } from '@/lib/config/platforms';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslations } from 'next-intl';

export default function HomePage() {
  const [copied, setCopied] = useState(false);
  const { data: session } = useSession();
  const t = useTranslations();

  const copyToClipboard = () => {
    navigator.clipboard.writeText('npm install -g recoder-code');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Minimal Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <img
              src="/logo.png"
              alt="Recoder"
              className="w-8 h-8 rounded-lg transition-transform group-hover:scale-110"
            />
            <span className="text-xl font-bold">recoder</span>
          </Link>

          <nav className="flex items-center space-x-6">
            <Link href="/agents" className="text-sm text-gray-400 hover:text-white transition-colors">
              Agents
            </Link>
            <Link href="/plan" className="text-sm text-gray-400 hover:text-white transition-colors">
              Plan
            </Link>
            <Link href="/platform" className="text-sm text-gray-400 hover:text-white transition-colors">
              Platform
            </Link>
            <Link href="/docs/getting-started" className="text-sm text-gray-400 hover:text-white transition-colors">
              {t('common.gettingStarted')}
            </Link>
            <Link href="/docs/faq" className="text-sm text-gray-400 hover:text-white transition-colors">
              {t('common.faq')}
            </Link>
            {session?.user ? (
              <>
                <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
                  {t('common.dashboard')}
                </Link>
                <LaunchWebIDEButton className="px-4 py-2 text-sm bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg transition-colors flex items-center space-x-2" />
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-white/20 hover:border-white/40 rounded-lg transition-colors"
                >
                  {t('common.signIn')}
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
            <LanguageSwitcher />
          </nav>
        </div>
      </header>

      {/* Hero Section - FREE BETA */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            {/* FREE BETA Badge */}
            <div className="inline-flex items-center space-x-2 px-6 py-3 rounded-full border-2 border-green-500/30 bg-green-500/10 animate-pulse-slow">
              <Sparkles className="w-5 h-5 text-green-400" />
              <span className="text-sm font-bold text-green-400">🎉 {t('home.freeBeta')}</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              {t('home.title')}
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
                {t('home.byok')}
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              The only platform combining <span className="text-orange-500 font-semibold">Web IDE + Terminal CLI</span> with seamless sync.
              <br />
              <span className="text-white font-semibold">100% Free</span> - Just bring your API key.
            </p>

            {/* Value Props */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-400">40+ AI Models</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-400">You Control Costs</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-400">Web ↔ CLI Sync</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-400">No Subscriptions</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              {session?.user ? (
                <>
                  <LaunchWebIDEButton className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center space-x-2 shadow-lg shadow-orange-500/50">
                    Launch Web IDE <ArrowRight className="w-5 h-5 ml-2" />
                  </LaunchWebIDEButton>
                  <Link
                    href="/dashboard"
                    className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                  >
                    Go to Dashboard
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/signup"
                    className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center space-x-2 shadow-lg shadow-orange-500/50"
                  >
                    <span>Get Started Free</span>
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                  <Link
                    href="/docs/getting-started"
                    className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                  >
                    Getting Started Guide
                  </Link>
                </>
              )}
            </div>

            {/* Trust Signal */}
            <p className="text-sm text-gray-500 pt-4">
              No credit card • No trial period • No hidden fees
            </p>
          </div>
        </div>
      </section>

      {/* Installation Section - Prominent Copy/Paste Button */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-purple-500/20 to-orange-500/20 blur-3xl"></div>

            <div className="relative p-12 rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/5 via-purple-500/5 to-transparent backdrop-blur-xl">
              <div className="text-center space-y-6">
                <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20">
                  <Terminal className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium text-orange-500">🚀 Recoder-Code CLI</span>
                </div>

                <h2 className="text-4xl md:text-5xl font-bold">
                  Get Started in Seconds
                </h2>

                <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                  Complete AI-powered development CLI featuring GPT-4, Claude 3.5 Sonnet, Gemini 2.0 Flash,
                  DeepSeek R1, Qwen 2.5, and 35+ more models. Chat, build projects, manage files,
                  create AI agents, and sync with Web IDE - all from your terminal.
                </p>

                {/* Installation Command with Copy Button */}
                <div className="pt-4">
                  <div className="inline-flex items-center space-x-3 p-4 rounded-2xl border border-white/20 bg-black/40 backdrop-blur-sm group hover:border-orange-500/50 transition-all">
                    <code className="text-lg md:text-xl font-mono text-white">
                      npm install -g recoder-code
                    </code>
                    <button
                      onClick={copyToClipboard}
                      className="p-3 rounded-xl bg-orange-500 hover:bg-orange-600 transition-all transform hover:scale-105 active:scale-95"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-white" />
                      ) : (
                        <Copy className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                  {copied && (
                    <p className="mt-3 text-sm text-orange-500 animate-fade-in">
                      ✓ Copied to clipboard!
                    </p>
                  )}
                </div>

                {/* Quick Features */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Cpu className="w-6 h-6 text-orange-500" />
                    </div>
                    <div className="text-sm font-medium">40+ AI Models</div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <Code className="w-6 h-6 text-purple-500" />
                    </div>
                    <div className="text-sm font-medium">Real Code Gen</div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-orange-500" />
                    </div>
                    <div className="text-sm font-medium">Tool Calling</div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-purple-500" />
                    </div>
                    <div className="text-sm font-medium">Sandbox Mode</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Products - Focused */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center mb-16">
            Choose Your Workflow
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Recoder Code (CLI) */}
            <Link href="/cli" className="group">
              <div className="relative h-full p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/5 to-transparent hover:border-orange-500/30 transition-all duration-300">
                <div className="absolute top-8 right-8">
                  <Terminal className="w-12 h-12 text-orange-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                </div>

                <div className="space-y-4">
                  <div className="inline-flex px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <span className="text-xs font-medium text-orange-500">CLI</span>
                  </div>

                  <h3 className="text-3xl font-bold">recoder-code</h3>

                  <p className="text-gray-400 text-lg">
                    Terminal-first AI development with 40+ models including Claude 3.5, GPT-4, Gemini 2.0, DeepSeek R1, and Qwen 2.5. Built-in tool calling, file operations, and specialized AI agents.
                  </p>

                  <div className="space-y-2 pt-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>40+ AI Models with smart routing & consensus</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>17 MCP Servers (GitHub, Slack, PostgreSQL, Redis & more)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Tool Calling & Agentic Workflows with function execution</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Prompt Caching & Context Compression (Save 50-90%)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Image Gen, Audio Support, Vision & Multimodal</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Sandbox Mode (Docker/macOS isolation)</span>
                    </div>
                  </div>

                  <div className="pt-6">
                    <div className="inline-flex items-center space-x-2 text-orange-500 group-hover:text-orange-400 transition-colors">
                      <span className="font-medium">View CLI Docs</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Recoder Web */}
            <Link href={getRecoderWebUrlClient()} target="_blank" className="group">
              <div className="relative h-full p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/5 to-transparent hover:border-purple-500/30 transition-all duration-300">
                <div className="absolute top-8 right-8">
                  <Globe className="w-12 h-12 text-purple-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                </div>

                <div className="space-y-4">
                  <div className="inline-flex px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
                    <span className="text-xs font-medium text-purple-500">WEB</span>
                  </div>

                  <h3 className="text-3xl font-bold">recoder-web</h3>

                  <p className="text-gray-400 text-lg">
                    Visual AI development platform. Build, collaborate, and ship from your browser with built-in terminal.
                  </p>

                  <div className="space-y-2 pt-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>Live code editor with AI assistance</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>WebContainer terminal (npm, node, git)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>Real-time preview & deployment</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>Chat history with PostgreSQL</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>Zero setup required</span>
                    </div>
                  </div>

                  <div className="pt-6">
                    <div className="inline-flex items-center space-x-2 text-purple-500 group-hover:text-purple-400 transition-colors">
                      <span className="font-medium">Launch Platform</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* User Flow - NEW: Shows CLI workflow */}
      <section className="py-20 px-6 border-t border-white/10 bg-gradient-to-b from-transparent via-orange-500/5 to-transparent">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-orange-500/20 bg-orange-500/5 mb-6">
              <Zap className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-500">Your Complete Workflow</span>
            </div>
            <h2 className="text-4xl font-bold mb-4">
              From Terminal to Production in Minutes
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Start in the browser, finish in your editor - with seamless sync between platforms
            </p>
          </div>

          {/* Flow Steps */}
          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 opacity-20"></div>

            <div className="grid md:grid-cols-4 gap-8 relative">
              {/* Step 1: Install */}
              <div className="relative">
                <div className="bg-black border border-orange-500/30 rounded-2xl p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-xl">
                    1
                  </div>
                  <h3 className="text-xl font-bold">Install CLI</h3>
                  <p className="text-sm text-gray-400">
                    Get started with one command
                  </p>
                  <code className="block text-xs bg-black/50 p-3 rounded-lg border border-white/10 text-green-400">
                    npm install -g recoder-code
                  </code>
                  <div className="text-xs text-gray-500">
                    ✓ macOS, Linux, Windows
                  </div>
                </div>
              </div>

              {/* Step 2: Setup */}
              <div className="relative">
                <div className="bg-black border border-purple-500/30 rounded-2xl p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                    2
                  </div>
                  <h3 className="text-xl font-bold">Launch & Configure</h3>
                  <p className="text-sm text-gray-400">
                    Interactive setup wizard
                  </p>
                  <code className="block text-xs bg-black/50 p-3 rounded-lg border border-white/10 text-green-400">
                    recoder-code
                  </code>
                  <div className="text-xs text-gray-500">
                    ✓ Choose models & API keys
                  </div>
                </div>
              </div>

              {/* Step 3: Build */}
              <div className="relative">
                <div className="bg-black border border-orange-500/30 rounded-2xl p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-xl">
                    3
                  </div>
                  <h3 className="text-xl font-bold">Chat & Build</h3>
                  <p className="text-sm text-gray-400">
                    Natural language coding
                  </p>
                  <code className="block text-xs bg-black/50 p-3 rounded-lg border border-white/10 text-blue-400">
                    {`> build a todo app`}
                  </code>
                  <div className="text-xs text-gray-500">
                    ✓ Real code, not templates
                  </div>
                </div>
              </div>

              {/* Step 4: Sync */}
              <div className="relative">
                <div className="bg-black border border-purple-500/30 rounded-2xl p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                    4
                  </div>
                  <h3 className="text-xl font-bold">Sync Anywhere</h3>
                  <p className="text-sm text-gray-400">
                    Web ↔ CLI seamlessly
                  </p>
                  <code className="block text-xs bg-black/50 p-3 rounded-lg border border-white/10 text-purple-400">
                    recoder web sync
                  </code>
                  <div className="text-xs text-gray-500">
                    ✓ Continue in browser/terminal
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CLI Commands Quick Reference */}
          <div className="mt-16 p-8 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">Essential Commands</h3>
              <p className="text-gray-400">Everything you need to start building</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Terminal className="w-3 h-3 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-green-400 block mb-1">recoder-code</code>
                    <p className="text-xs text-gray-500">Launch interactive chat UI with 40+ models</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Code className="w-3 h-3 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-green-400 block mb-1">recoder agent create @expert</code>
                    <p className="text-xs text-gray-500">Create specialized AI agent for tasks</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Sparkles className="w-3 h-3 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-green-400 block mb-1">recoder file create app.ts</code>
                    <p className="text-xs text-gray-500">AI-powered file operations & search</p>
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Globe className="w-3 h-3 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-blue-400 block mb-1">recoder web download &lt;id&gt;</code>
                    <p className="text-xs text-gray-500">Download web project to local machine</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Zap className="w-3 h-3 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-blue-400 block mb-1">recoder web sync &lt;id&gt;</code>
                    <p className="text-xs text-gray-500">Two-way sync between CLI and Web IDE</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Shield className="w-3 h-3 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm text-blue-400 block mb-1">recoder sandbox enable</code>
                    <p className="text-xs text-gray-500">Enable Docker isolation for safe execution</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <Link
                href="/cli"
                className="inline-flex items-center space-x-2 text-orange-500 hover:text-orange-400 transition-colors"
              >
                <span className="text-sm font-medium">View all 40+ commands</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats - Updated */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-orange-500">40+</div>
              <div className="text-sm text-gray-500">AI Models</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-purple-500">17</div>
              <div className="text-sm text-gray-500">MCP Servers</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-orange-500">90%</div>
              <div className="text-sm text-gray-500">Cost Savings</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-purple-500">Free</div>
              <div className="text-sm text-gray-500">Tier Available</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-400">
              Production-ready features built for modern developers
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Specialized AI Agents</h3>
              <p className="text-gray-400 text-sm">
                Create custom AI agents for specific tasks like @backend-expert or @code-reviewer
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Terminal className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Smart File Operations</h3>
              <p className="text-gray-400 text-sm">
                Create, edit, and search files with AI assistance. Full file system integration.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Interactive Chat UI</h3>
              <p className="text-gray-400 text-sm">
                Beautiful terminal interface with autocomplete, shortcuts, and real-time feedback.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Sandbox Mode</h3>
              <p className="text-gray-400 text-sm">
                Optional Docker/macOS isolation for safe execution of AI-generated code.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
                <Code className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Multi-Platform Support</h3>
              <p className="text-gray-400 text-sm">
                Works seamlessly on Windows, macOS, and Linux. Use CLI or Web interface.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Cpu className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Usage Analytics</h3>
              <p className="text-gray-400 text-sm">
                Track costs, tokens, and model performance with built-in analytics dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why BYOK? Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Bring Your Own Key?
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              We built Recoder.xyz on a simple principle: <span className="text-white font-semibold">transparency</span> and <span className="text-white font-semibold">control</span>.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl border border-green-500/20 bg-green-500/5">
              <div className="w-14 h-14 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-6">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">You Control Costs</h3>
              <p className="text-gray-400 leading-relaxed">
                Pay only for what you use. No markups, no hidden fees. $5 on OpenRouter = <span className="text-white font-semibold">500+ AI requests</span>. That's it.
              </p>
              <div className="mt-6 p-4 rounded-lg bg-black/40 border border-green-500/20">
                <div className="text-sm text-gray-500 mb-1">Example cost</div>
                <div className="text-2xl font-bold text-green-400">$0.01</div>
                <div className="text-sm text-gray-400">per chat with Grok Code Fast</div>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-purple-500/20 bg-purple-500/5">
              <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6">
                <span className="text-3xl">🎯</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">You Choose Models</h3>
              <p className="text-gray-400 leading-relaxed">
                Access <span className="text-white font-semibold">40+ AI models</span> from OpenRouter, Anthropic, and OpenAI. Switch between GPT-4, Claude, Gemini, and more instantly.
              </p>
              <div className="mt-6 space-y-2">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-gray-400">Grok Code Fast (fastest)</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-gray-400">Claude Sonnet 4.5 (best quality)</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-gray-400">DeepSeek R1T2 (FREE!)</span>
                </div>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-orange-500/20 bg-orange-500/5">
              <div className="w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6">
                <span className="text-3xl">🔒</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">We're 100% Free</h3>
              <p className="text-gray-400 leading-relaxed">
                No subscriptions. No trials. No paywalls. We encrypt your API keys (AES-256-GCM) and never see your usage or costs. <span className="text-white font-semibold">Forever free</span> during beta.
              </p>
              <div className="mt-6 space-y-2">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-400">No credit card required</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-400">No usage limits</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-400">No expiration</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 p-6 rounded-xl border border-white/10 bg-white/5 text-center">
            <p className="text-gray-400">
              <span className="text-white font-semibold">How it works:</span> Sign up → Add your API key → Select your favorite model → Start building. That's it!
            </p>
          </div>
        </div>
      </section>

      {/* Ecosystem Section */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">The Recoder Ecosystem</h2>
            <p className="text-xl text-gray-400">10 services powering the complete AI development platform</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {([
              { id: 'frontend', name: 'Suna AI IDE', tag: 'Agents' },
              { id: 'web', name: 'Bolt AI IDE', tag: 'Web IDE' },
              { id: 'studio', name: 'Studio', tag: 'Workflows' },
              { id: 'agency', name: 'Agency', tag: 'Multi-Agent' },
              { id: 'pm', name: 'PM', tag: 'Projects' },
              { id: 'openclaw', name: 'OpenClaw', tag: 'Open Source' },
              { id: 'docker-backend', name: 'API Gateway', tag: 'Backend' },
              { id: 'backend', name: 'AI Backend', tag: 'FastAPI' },
            ] as const).map((svc) => (
              <a
                key={svc.id}
                href={getServiceUrlClient(svc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:border-orange-500/30 hover:bg-orange-500/5 transition-all text-center group"
              >
                <div className="text-sm font-medium group-hover:text-orange-400 transition-colors">{svc.name}</div>
                <div className="text-xs text-gray-600 mt-1">{svc.tag}</div>
              </a>
            ))}
            <Link
              href="/platform"
              className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-all text-center flex flex-col items-center justify-center"
            >
              <div className="text-sm font-medium text-orange-400">View All</div>
              <div className="text-xs text-gray-600 mt-1">10 services</div>
            </Link>
          </div>
          <div className="flex justify-center mt-8 space-x-4">
            <Link href="/agents" className="text-sm text-orange-400 hover:text-orange-300 transition-colors flex items-center space-x-1">
              <span>AI Agents</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
            <Link href="/plan" className="text-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center space-x-1">
              <span>Plans & Pricing</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
            <Link href="/status" className="text-sm text-gray-400 hover:text-white transition-colors flex items-center space-x-1">
              <span>System Status</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA - Free Beta */}
      <section className="py-32 px-6">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <div className="inline-flex items-center space-x-2 px-6 py-3 rounded-full border-2 border-green-500/30 bg-green-500/10">
            <Sparkles className="w-5 h-5 text-green-400" />
            <span className="text-sm font-bold text-green-400">🎉 FREE BETA LIVE NOW</span>
          </div>

          <h2 className="text-5xl font-bold">
            Ready to build with AI?
          </h2>
          <p className="text-xl text-gray-400">
            Join the free beta. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            {session?.user ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center space-x-2 shadow-lg shadow-orange-500/50"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <LaunchWebIDEButton className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all flex items-center space-x-2">
                  Launch Web IDE <ArrowRight className="w-5 h-5 ml-2" />
                </LaunchWebIDEButton>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center space-x-2 shadow-lg shadow-orange-500/50"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/docs"
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  View Documentation
                </Link>
              </>
            )}
          </div>
          <p className="text-sm text-gray-500 pt-4">
            No credit card • No trial period • No hidden fees
          </p>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
              <span className="font-bold">recoder</span>
            </div>

            <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
              <Link href="/agents" className="hover:text-white transition-colors">Agents</Link>
              <Link href="/plan" className="hover:text-white transition-colors">Plan</Link>
              <Link href="/platform" className="hover:text-white transition-colors">Platform</Link>
              <Link href="/status" className="hover:text-white transition-colors">Status</Link>
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
              <Link href="/cli" className="hover:text-white transition-colors">CLI</Link>
              <Link href="/legal/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/legal/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="https://github.com/recoderxyz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</Link>
            </div>

            <div className="text-sm text-gray-500">
              © 2024–2026 Recoder.xyz
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
