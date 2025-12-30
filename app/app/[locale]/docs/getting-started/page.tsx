'use client';

import Link from 'next/link';
import { ArrowRight, Terminal, Globe, Key, Sparkles, CheckCircle, Code, Zap } from 'lucide-react';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="flex items-center space-x-6">
            <Link href="/docs/faq" className="text-sm text-gray-400 hover:text-white transition-colors">
              FAQ
            </Link>
            <Link href="/" className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </header>

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
              Get Started with
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
                Recoder.xyz
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Start building with AI in under 5 minutes. This guide will walk you through everything you need to know.
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
                  <h3 className="text-2xl font-bold mb-3">Create Your Account</h3>
                  <p className="text-gray-400 mb-4">
                    Sign up with GitHub or Google - no credit card required!
                  </p>
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10 mb-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-400 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>No payment information needed</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-400 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>No trial period - it's free forever (during beta)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>Takes 30 seconds</span>
                    </div>
                  </div>
                  <Link
                    href="/auth/signin"
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all"
                  >
                    <span>Sign Up Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
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
                  <h3 className="text-2xl font-bold mb-3">Get Your API Key</h3>
                  <p className="text-gray-400 mb-4">
                    Choose an AI provider and get your API key. We recommend <span className="text-orange-500 font-semibold">OpenRouter</span> for beginners.
                  </p>

                  {/* Provider Options */}
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">📦</span>
                        <span className="font-semibold text-green-400">OpenRouter</span>
                      </div>
                      <div className="text-xs text-gray-400 mb-3">Recommended for beginners</div>
                      <div className="text-sm text-gray-300 mb-3">
                        • 40+ models in one key<br />
                        • $5 = 500+ requests<br />
                        • Easy to set up
                      </div>
                      <a
                        href="https://openrouter.ai/keys?ref=recoder"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-green-400 hover:text-green-300"
                      >
                        <span>Get OpenRouter Key</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">🤖</span>
                        <span className="font-semibold">Anthropic</span>
                      </div>
                      <div className="text-xs text-gray-400 mb-3">Best for Claude models</div>
                      <div className="text-sm text-gray-300 mb-3">
                        • Claude 3.5 Sonnet<br />
                        • Great for coding<br />
                        • $5 free credit
                      </div>
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-gray-400 hover:text-white"
                      >
                        <span>Get Anthropic Key</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">🔷</span>
                        <span className="font-semibold">OpenAI</span>
                      </div>
                      <div className="text-xs text-gray-400 mb-3">For GPT models</div>
                      <div className="text-sm text-gray-300 mb-3">
                        • GPT-4 & GPT-4 Turbo<br />
                        • Most popular<br />
                        • $5 free credit
                      </div>
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-gray-400 hover:text-white"
                      >
                        <span>Get OpenAI Key</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-start space-x-2">
                      <Key className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-300">
                        <span className="font-semibold text-white">Why do I need my own API key?</span><br />
                        This is the BYOK (Bring Your Own Key) model. You pay AI providers directly, so there are no markups. We encrypt your key with AES-256-GCM and never see your usage.
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
                  <h3 className="text-2xl font-bold mb-3">Add Your API Key to Recoder</h3>
                  <p className="text-gray-400 mb-4">
                    Navigate to your dashboard and add your API key.
                  </p>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">a</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Go to <Link href="/dashboard" className="text-orange-500 hover:text-orange-400">Dashboard</Link> after signing in
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">b</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Click <Link href="/settings/ai-providers" className="text-orange-500 hover:text-orange-400">"Manage API Keys"</Link>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">c</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Select your provider (OpenRouter/Anthropic/OpenAI)
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">d</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Paste your API key and save
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-start space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-300">
                        <span className="font-semibold text-white">Your key is encrypted!</span><br />
                        We encrypt your API key with AES-256-GCM before storing it. Even we can't see your key in plain text.
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
                  <h3 className="text-2xl font-bold mb-3">Start Building!</h3>
                  <p className="text-gray-400 mb-6">
                    Choose your workflow: Web IDE or Terminal CLI (or both!)
                  </p>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="p-6 rounded-xl border border-purple-500/30 bg-purple-500/5">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-purple-400" />
                        </div>
                        <h4 className="text-xl font-bold">Web IDE</h4>
                      </div>
                      <p className="text-sm text-gray-400 mb-4">
                        Code in your browser with AI assistance. Perfect for quick projects and prototyping.
                      </p>
                      <ul className="space-y-2 mb-4 text-sm text-gray-300">
                        <li className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                          <span>Real-time preview</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                          <span>No setup required</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                          <span>Works on any device</span>
                        </li>
                      </ul>
                      <LaunchWebIDEButton className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-all">
                        <span>Launch Web IDE</span>
                        <ArrowRight className="w-4 h-4" />
                      </LaunchWebIDEButton>
                    </div>

                    <div className="p-6 rounded-xl border border-orange-500/30 bg-orange-500/5">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                          <Terminal className="w-5 h-5 text-orange-400" />
                        </div>
                        <h4 className="text-xl font-bold">Terminal CLI</h4>
                      </div>
                      <p className="text-sm text-gray-400 mb-4">
                        Build from your terminal with full file system access. Perfect for local development.
                      </p>
                      <ul className="space-y-2 mb-4 text-sm text-gray-300">
                        <li className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                          <span>Local file access</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                          <span>Sync with Web IDE</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                          <span>40+ AI models</span>
                        </li>
                      </ul>
                      <div className="p-3 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-gray-300">
                        npm install -g recoder-code
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-start space-x-2">
                      <Zap className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-300">
                        <span className="font-semibold text-white">Pro tip:</span> Use both! Start in Web IDE, download to local machine, edit with CLI, and sync back. That's the power of Recoder!
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10">
            <h2 className="text-3xl font-bold mb-6">🎉 You're All Set!</h2>
            <p className="text-gray-300 mb-6">
              You now have everything you need to start building with AI. Here's what to explore next:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
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

              <a
                href="https://twitter.com/recoderxyz"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Follow on Twitter</h3>
                    <p className="text-sm text-gray-400">Updates, tips & community</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </a>
            </div>
          </div>

          {/* Support */}
          <div className="mt-12 text-center">
            <p className="text-gray-400 mb-4">Need help? We're here for you!</p>
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
