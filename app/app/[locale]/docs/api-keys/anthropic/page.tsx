import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Key, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
  alternates: { canonical: 'https://recoder.xyz/docs/api-keys/anthropic' },
};

export default function AnthropicAPIKeyGuidePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <Link href="/docs/getting-started" className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors">
            Back to Docs
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          {/* Breadcrumb */}
          <div className="mb-8 flex items-center space-x-2 text-sm text-gray-400">
            <Link href="/docs/getting-started" className="hover:text-orange-500 transition-colors">
              Documentation
            </Link>
            <span>/</span>
            <Link href="/docs/getting-started#api-keys" className="hover:text-orange-500 transition-colors">
              API Keys
            </Link>
            <span>/</span>
            <span className="text-white">Anthropic</span>
          </div>

          {/* Title Section */}
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-orange-500/30">
                <Key className="w-8 h-8 text-orange-500" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">
                Anthropic API Key Setup
              </h1>
            </div>
            <p className="text-xl text-gray-400 leading-relaxed">
              Get your Claude API key from Anthropic and start building with the most advanced AI reasoning models.
            </p>
          </div>

          {/* Why Anthropic Section */}
          <section className="mb-12 p-8 rounded-2xl bg-gradient-to-br from-purple-500/10 to-orange-500/10 border border-purple-500/30">
            <div className="flex items-start space-x-4 mb-6">
              <Sparkles className="w-6 h-6 text-purple-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-bold mb-3 text-purple-400">Why Use Anthropic?</h2>
                <p className="text-gray-300 leading-relaxed mb-4">
                  Anthropic's Claude models are renowned for their exceptional reasoning, code generation,
                  and safety features. Perfect for complex development tasks.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-purple-400 mb-2">🧠 Best-in-Class Reasoning</h3>
                <p className="text-sm text-gray-400">
                  Claude excels at complex logic, analysis, and understanding nuanced requirements.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-purple-400 mb-2">💻 Superior Code Generation</h3>
                <p className="text-sm text-gray-400">
                  Generates clean, well-structured code with excellent documentation.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-purple-400 mb-2">🛡️ Safety & Reliability</h3>
                <p className="text-sm text-gray-400">
                  Built with Constitutional AI for helpful, harmless, and honest responses.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-purple-400 mb-2">📚 200K Context Window</h3>
                <p className="text-sm text-gray-400">
                  Work with massive codebases and long conversations without losing context.
                </p>
              </div>
            </div>
          </section>

          {/* Setup Steps */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Setup Guide
              </span>
            </h2>

            <div className="space-y-8">
              {/* Step 1 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Visit Anthropic Console</h3>
                    <p className="text-gray-400 mb-4">
                      Go to the Anthropic Console to manage your API keys:
                    </p>
                    <a
                      href="https://console.anthropic.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                    >
                      <span>Open Anthropic Console</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Create Account or Sign In</h3>
                    <div className="space-y-3 text-gray-400">
                      <p>If you don't have an account yet:</p>
                      <ul className="list-disc list-inside space-y-2 ml-4">
                        <li>Click "Sign Up" on the Anthropic Console</li>
                        <li>Provide your email address</li>
                        <li>Verify your email</li>
                        <li>Complete your profile information</li>
                      </ul>
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-blue-300 font-semibold mb-1">Free Credits Available</p>
                            <p className="text-gray-400">
                              New Anthropic accounts receive <strong className="text-white">$5 in free credits</strong> to
                              test Claude API. Perfect for trying out Recoder.xyz!
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Navigate to API Keys</h3>
                    <div className="space-y-3 text-gray-400">
                      <p>Once logged in to the Console:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-4">
                        <li>Look for the sidebar menu</li>
                        <li>Click on <strong className="text-white">"API Keys"</strong></li>
                        <li>You'll see your API keys management page</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    4
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Create New API Key</h3>
                    <div className="space-y-3 text-gray-400">
                      <p>Generate a new API key for Recoder.xyz:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-4">
                        <li>Click <strong className="text-white">"Create Key"</strong> button</li>
                        <li>Give it a descriptive name (e.g., "Recoder.xyz Development")</li>
                        <li>Click "Create Key"</li>
                      </ol>
                      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-yellow-300 font-semibold mb-1">⚠️ Important</p>
                            <p className="text-gray-400">
                              Your API key will only be shown <strong className="text-white">once</strong>.
                              Make sure to copy it before closing the dialog!
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    5
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Copy Your API Key</h3>
                    <div className="space-y-3 text-gray-400">
                      <p>Your new API key will be displayed on screen:</p>
                      <ul className="list-disc list-inside space-y-2 ml-4">
                        <li>It will start with <code className="px-2 py-1 rounded bg-black/30 text-purple-400">sk-ant-</code></li>
                        <li>Click the copy button to copy the entire key</li>
                        <li>Store it safely - you won't be able to see it again!</li>
                      </ul>
                      <div className="p-3 rounded-lg bg-black/30 border border-purple-500/30 font-mono text-sm mt-4">
                        <span className="text-purple-400">sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxx</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 6 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    6
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Add to Recoder.xyz</h3>
                    <div className="space-y-3 text-gray-400">
                      <p>Now add your Anthropic API key to Recoder.xyz:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-4">
                        <li>
                          Go to{' '}
                          <Link href="/settings/ai-providers" className="text-orange-500 hover:text-orange-400 underline">
                            Settings → AI Providers
                          </Link>
                        </li>
                        <li>Find the "Anthropic" card</li>
                        <li>Click <strong className="text-white">"Add API Key"</strong></li>
                        <li>Paste your API key (the one starting with <code className="px-2 py-1 rounded bg-black/30 text-purple-400">sk-ant-</code>)</li>
                        <li>Give it a friendly name (optional)</li>
                        <li>Click "Save"</li>
                      </ol>
                      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-green-300 font-semibold mb-1">✅ All Set!</p>
                            <p className="text-gray-400">
                              Your API key is encrypted with AES-256-GCM and stored securely. You can now use
                              Claude models in Recoder.xyz!
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing Information */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-6 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Pricing
              </span>
            </h2>
            <p className="text-gray-400 mb-6">
              Anthropic charges per token (input and output). Here are the current rates for popular Claude models:
            </p>

            <div className="grid gap-6">
              {/* Claude 3.5 Sonnet */}
              <div className="p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-purple-400 mb-1">Claude 3.5 Sonnet</h3>
                    <p className="text-sm text-gray-400">Best for code generation and complex reasoning</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Recommended
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$3.00</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Output</div>
                    <div className="text-2xl font-bold text-white">$15.00</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-sm text-gray-400">
                    <strong className="text-white">Example:</strong> A typical coding session (20 prompts, 10K tokens total)
                    costs approximately <strong className="text-green-400">$0.10 - $0.30</strong>
                  </p>
                </div>
              </div>

              {/* Claude 3 Opus */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">Claude 3 Opus</h3>
                    <p className="text-sm text-gray-400">Most powerful for extremely complex tasks</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                    Premium
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$15.00</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Output</div>
                    <div className="text-2xl font-bold text-white">$75.00</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                </div>
              </div>

              {/* Claude 3 Haiku */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">Claude 3 Haiku</h3>
                    <p className="text-sm text-gray-400">Fastest and most affordable for simple tasks</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30">
                    Budget
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$0.25</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Output</div>
                    <div className="text-2xl font-bold text-white">$1.25</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-6 rounded-xl bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30">
              <h3 className="font-semibold text-green-400 mb-3 flex items-center space-x-2">
                <Sparkles className="w-5 h-5" />
                <span>Cost Savings with BYOK</span>
              </h3>
              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="text-gray-400 mb-2">Traditional AI Subscription</div>
                  <div className="text-3xl font-bold text-red-400 mb-1">$20-50/mo</div>
                  <div className="text-xs text-gray-500">Flat rate, limited usage</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-2">Recoder.xyz + Your Anthropic Key</div>
                  <div className="text-3xl font-bold text-green-400 mb-1">$3-10/mo</div>
                  <div className="text-xs text-gray-500">Pay only for what you use</div>
                </div>
              </div>
              <p className="text-gray-400 mt-4 text-sm">
                For typical development usage (100-200 AI interactions per month), you'll spend
                <strong className="text-green-400"> 70-90% less</strong> with BYOK compared to traditional subscriptions.
              </p>
            </div>
          </section>

          {/* Troubleshooting */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-6 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Troubleshooting
              </span>
            </h2>

            <div className="space-y-4">
              {/* Issue 1 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>❌ "Invalid API Key" Error</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you're seeing an invalid API key error:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Make sure you copied the <strong className="text-white">entire key</strong> (including <code className="px-2 py-1 rounded bg-black/30 text-purple-400">sk-ant-</code> prefix)</li>
                    <li>Check for extra spaces at the beginning or end</li>
                    <li>Verify the key hasn't been deleted in Anthropic Console</li>
                    <li>Try regenerating a new API key</li>
                  </ul>
                </div>
              </details>

              {/* Issue 2 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>💳 "Insufficient Credits" Error</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If your requests are failing due to insufficient credits:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Check your <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">billing settings</a> in Anthropic Console</li>
                    <li>Add a payment method to continue using Claude after free credits</li>
                    <li>Monitor your usage in the Anthropic Console dashboard</li>
                  </ul>
                </div>
              </details>

              {/* Issue 3 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>⚠️ Rate Limit Errors</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you're hitting rate limits:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Anthropic has default rate limits for new accounts</li>
                    <li>Wait a few seconds between requests</li>
                    <li>For higher limits, contact Anthropic support or upgrade your account tier</li>
                    <li>Consider using a less expensive model (Haiku) for simple tasks</li>
                  </ul>
                </div>
              </details>

              {/* Issue 4 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>🔄 Key Not Working After Adding</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If your key was added but isn't working:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Try refreshing the page</li>
                    <li>Make sure you selected "Anthropic" as your provider in the chat interface</li>
                    <li>Check that a specific Claude model is selected (Sonnet, Opus, or Haiku)</li>
                    <li>Verify the key is active in Anthropic Console</li>
                  </ul>
                </div>
              </details>
            </div>
          </section>

          {/* Next Steps */}
          <section className="p-8 rounded-2xl bg-gradient-to-br from-orange-500/10 to-purple-600/10 border border-orange-500/30">
            <h2 className="text-2xl font-bold mb-4 flex items-center space-x-2">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <span>Next Steps</span>
            </h2>
            <p className="text-gray-400 mb-6">
              Now that you have your Anthropic API key set up, you're ready to start building with Claude!
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <Link
                href="/dashboard"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  Start Building →
                </h3>
                <p className="text-sm text-gray-400">
                  Go to your dashboard and create your first AI-powered project
                </p>
              </Link>
              <Link
                href="/docs/getting-started"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  View Documentation →
                </h3>
                <p className="text-sm text-gray-400">
                  Learn more about Recoder.xyz features and capabilities
                </p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
