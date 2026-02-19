'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Terminal, Copy, Check, ArrowRight, Zap, Shield, Globe,
  Sparkles, Code2, Rocket, Download, Repeat, Package, Lock
} from 'lucide-react';

export default function CLIPage() {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = async (text: string, stepIndex: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepIndex);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const installMethods = [
    {
      title: "Quick Install (Recommended)",
      code: "curl -fsSL https://recoder.xyz/api/install | bash",
      description: "One-line installer for macOS/Linux"
    },
    {
      title: "npm",
      code: "npm install -g recoder-code-cli",
      description: "Install via npm (all platforms)"
    },
    {
      title: "Homebrew",
      code: "brew install https://recoder.xyz/api/brew/recoder-code.rb",
      description: "Install via Homebrew (macOS/Linux)"
    },
    {
      title: "pnpm",
      code: "pnpm add -g recoder-code-cli",
      description: "Install via pnpm"
    },
    {
      title: "yarn",
      code: "yarn global add recoder-code-cli",
      description: "Install via yarn"
    }
  ];

  const installSteps = [
    {
      title: "Install Recoder CLI",
      code: "curl -fsSL https://recoder.xyz/api/install | bash",
      description: "One-line install (or use npm/brew below)"
    },
    {
      title: "Authenticate",
      code: "recoder auth login",
      description: "Device-flow authentication (like GitHub CLI)"
    },
    {
      title: "Start Building",
      code: 'recoder "create a Next.js dashboard with auth"',
      description: "Generate production-ready code instantly"
    }
  ];

  const webCliFeatures = [
    {
      icon: Globe,
      title: "Start in Web IDE",
      description: "Build projects visually with AI assistance in your browser"
    },
    {
      icon: Download,
      title: "Download to Local",
      description: "Use 'recoder web download' to get your project files locally"
    },
    {
      icon: Code2,
      title: "Edit with Any Editor",
      description: "Use VSCode, Cursor, or any editor you prefer"
    },
    {
      icon: Repeat,
      title: "Sync Back to Web",
      description: "Push changes back with 'recoder web sync' for two-way flow"
    }
  ];

  const features = [
    {
      icon: Sparkles,
      title: "100% FREE Beta",
      description: "No credit card, no payment. Just bring your own API key (BYOK)."
    },
    {
      icon: Zap,
      title: "40+ AI Models",
      description: "Access Claude, GPT-4, Gemini, Groq, and more with one tool"
    },
    {
      icon: Shield,
      title: "Production Ready",
      description: "Real code that works, not mock implementations"
    },
    {
      icon: Lock,
      title: "Secure & Private",
      description: "Your API keys are encrypted. We never see your conversations."
    },
    {
      icon: Rocket,
      title: "Web ↔ CLI Sync",
      description: "Only platform offering seamless browser + terminal workflow"
    },
    {
      icon: Package,
      title: "Multi-Provider",
      description: "OpenRouter, Anthropic, OpenAI, Groq - all in one CLI"
    }
  ];

  const cliCommands = [
    {
      command: 'recoder "build a REST API with auth"',
      description: "Full backend with authentication and database"
    },
    {
      command: 'recoder web list',
      description: "List all your Web IDE projects"
    },
    {
      command: 'recoder web download <urlId>',
      description: "Download a web project to your local machine"
    },
    {
      command: 'recoder web sync <urlId>',
      description: "Two-way sync between local and web"
    },
    {
      command: 'recoder auth status',
      description: "Check authentication and API key status"
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>

          <nav className="flex items-center space-x-8">
            <Link href="/projects" className="text-sm text-gray-400 hover:text-white transition-colors">
              My Projects
            </Link>
            <Link href="/settings/ai-providers" className="text-sm text-gray-400 hover:text-white transition-colors">
              API Keys
            </Link>
            <Link
              href="/auth/signin"
              className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border-2 border-green-500/20 bg-green-500/10">
              <Sparkles className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400 font-semibold">🎉 FREE BETA - No Credit Card Required</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              Terminal + Web
              <br />
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                In One Platform
              </span>
            </h1>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              The only AI coding platform with <span className="text-orange-500 font-semibold">seamless Web IDE + CLI sync</span>. Start in browser, continue in terminal.
            </p>

            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-2xl mx-auto">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-white">BYOK (Bring Your Own Key):</span> Use your own API keys from OpenRouter, Anthropic, OpenAI, or Groq. We encrypt them with AES-256-GCM.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-4 pt-8">
              <Link
                href="/auth/signup"
                className="group px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Download className="w-5 h-5" />
                <span>Get Started Free</span>
              </Link>
              <Link
                href="/projects"
                className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
              >
                View My Projects
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Web ↔ CLI Flow */}
      <section className="py-20 px-6 border-t border-white/10 bg-gradient-to-b from-transparent to-orange-500/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">The Web ↔ CLI Workflow</h2>
            <p className="text-gray-400">Nobody else offers this. Start anywhere, work everywhere.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {webCliFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="relative p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-orange-500/30 transition-all"
                >
                  <div className="absolute -top-3 left-6 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold text-black">
                    {index + 1}
                  </div>
                  <Icon className="w-10 h-10 text-orange-500 mb-4 mt-2" />
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Installation */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Install in 60 Seconds</h2>
            <p className="text-gray-400">Three commands to start building with AI</p>
          </div>

          <div className="space-y-6">
            {installSteps.map((step, index) => (
              <div
                key={index}
                className="relative p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/5 to-transparent hover:border-orange-500/30 transition-all"
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">{step.title}</h3>
                    <p className="text-gray-400">{step.description}</p>
                    <div className="flex items-center space-x-2 p-4 bg-black border border-white/10 rounded-lg font-mono text-sm">
                      <code className="flex-1 text-green-400">{step.code}</code>
                      <button
                        onClick={() => copyToClipboard(step.code, index)}
                        className="p-2 hover:bg-white/5 rounded transition-colors"
                      >
                        {copiedStep === index ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-yellow-400">📦 Package Name:</span> The CLI is published as <code className="font-mono text-yellow-400">recoder-code-cli</code> on npm
            </p>
          </div>

          {/* Alternative Installation Methods */}
          <div className="mt-12">
            <h3 className="text-2xl font-bold mb-6 text-center">Alternative Installation Methods</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {installMethods.map((method, index) => (
                <div
                  key={index}
                  className="p-4 rounded-xl border border-white/10 bg-black/30 hover:border-white/20 transition-all"
                >
                  <h4 className="font-semibold text-white mb-1">{method.title}</h4>
                  <p className="text-xs text-gray-500 mb-2">{method.description}</p>
                  <div className="flex items-center space-x-2 p-2 bg-black border border-white/10 rounded font-mono text-xs">
                    <code className="flex-1 text-green-400 overflow-x-auto">{method.code}</code>
                    <button
                      onClick={() => copyToClipboard(method.code, 200 + index)}
                      className="p-1 hover:bg-white/5 rounded transition-colors flex-shrink-0"
                    >
                      {copiedStep === 200 + index ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center mb-16">Why Recoder CLI?</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-orange-500/30 transition-all"
                >
                  <Icon className="w-10 h-10 text-orange-500 mb-4" />
                  <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Command Reference */}
      <section className="py-20 px-6 border-t border-white/10 bg-gradient-to-b from-transparent to-purple-500/5">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Command Reference</h2>
            <p className="text-gray-400">Essential commands to master the CLI</p>
          </div>

          <div className="space-y-4">
            {cliCommands.map((item, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-purple-500/30 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 p-3 bg-black border border-white/10 rounded-lg font-mono text-sm">
                    <Terminal className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <code className="flex-1 text-green-400 overflow-x-auto">{item.command}</code>
                    <button
                      onClick={() => copyToClipboard(item.command, 100 + index)}
                      className="p-2 hover:bg-white/5 rounded transition-colors flex-shrink-0"
                    >
                      {copiedStep === 100 + index ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm pl-4">→ {item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <h3 className="font-semibold text-white mb-3">💡 Pro Tip: BYOK Setup</h3>
            <ol className="space-y-2 text-sm text-gray-300">
              <li>1. Sign up at <a href="/auth/signup" className="text-orange-500 hover:underline">recoder.xyz</a></li>
              <li>2. Add your API key at <Link href="/settings/ai-providers" className="text-orange-500 hover:underline">Settings → AI Providers</Link></li>
              <li>3. Run <code className="font-mono bg-black/50 px-2 py-1 rounded">recoder auth login</code> in terminal</li>
              <li>4. Start building! Your API key is securely synced.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border-2 border-green-500/20 bg-green-500/10 mb-4">
            <Sparkles className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400 font-semibold">100% FREE During Beta</span>
          </div>
          <h2 className="text-5xl font-bold">
            Ready to Build Faster?
          </h2>
          <p className="text-xl text-gray-400">
            Install the CLI and start building with 40+ AI models. No credit card needed.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <Download className="w-5 h-5" />
              <span>Get Started Free</span>
            </Link>
            <Link
              href="/settings/ai-providers"
              className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
            >
              Setup API Keys
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
              <span className="font-bold">recoder</span>
            </div>

            <div className="flex items-center space-x-8 text-sm text-gray-500">
              <Link href="/projects" className="hover:text-white transition-colors">My Projects</Link>
              <Link href="/settings/ai-providers" className="hover:text-white transition-colors">API Keys</Link>
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              <a href="https://github.com/recoder-xyz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            </div>

            <div className="text-sm text-gray-500">
              © 2024–2026 Recoder.xyz
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
