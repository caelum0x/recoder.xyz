import Link from 'next/link';
import { ArrowLeft, CheckCircle, Key, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';

export default function OpenAIAPIKeyGuidePage() {
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
            <span className="text-white">OpenAI</span>
          </div>

          {/* Title Section */}
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-orange-500/30">
                <Key className="w-8 h-8 text-orange-500" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">
                OpenAI API Key Setup
              </h1>
            </div>
            <p className="text-xl text-gray-400 leading-relaxed">
              Get your GPT API key from OpenAI and unlock the power of the world's most well-known AI models.
            </p>
          </div>

          {/* Why OpenAI Section */}
          <section className="mb-12 p-8 rounded-2xl bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30">
            <div className="flex items-start space-x-4 mb-6">
              <Sparkles className="w-6 h-6 text-green-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-bold mb-3 text-green-400">Why Use OpenAI?</h2>
                <p className="text-gray-300 leading-relaxed mb-4">
                  OpenAI's GPT models pioneered modern AI and remain the most widely-used and battle-tested
                  models for code generation, problem-solving, and creative tasks.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-green-400 mb-2">🏆 Industry Standard</h3>
                <p className="text-sm text-gray-400">
                  GPT models are the most recognized and widely-adopted AI technology globally.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-green-400 mb-2">⚡ Fast & Reliable</h3>
                <p className="text-sm text-gray-400">
                  OpenAI's infrastructure provides consistent, low-latency responses at scale.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-green-400 mb-2">🎯 Versatile Performance</h3>
                <p className="text-sm text-gray-400">
                  From quick code fixes to complex system design - GPT handles it all.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                <h3 className="font-semibold text-green-400 mb-2">🔄 Regular Updates</h3>
                <p className="text-sm text-gray-400">
                  OpenAI continuously improves models with new capabilities and optimizations.
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
                    <h3 className="text-xl font-semibold mb-3">Visit OpenAI Platform</h3>
                    <p className="text-gray-400 mb-4">
                      Go to the OpenAI Platform to manage your API keys:
                    </p>
                    <a
                      href="https://platform.openai.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    >
                      <span>Open OpenAI Platform</span>
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
                      <p>If you don't have an OpenAI account yet:</p>
                      <ul className="list-disc list-inside space-y-2 ml-4">
                        <li>Click "Sign Up" on the OpenAI Platform</li>
                        <li>Provide your email address or use Google/Microsoft sign-in</li>
                        <li>Verify your email address</li>
                        <li>Complete your profile (phone verification required)</li>
                      </ul>
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-blue-300 font-semibold mb-1">Free Credits for New Users</p>
                            <p className="text-gray-400">
                              New OpenAI accounts receive <strong className="text-white">$5 in free credits</strong> (valid for 3 months)
                              to test GPT models. Perfect for getting started with Recoder.xyz!
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
                      <p>Once logged in to the Platform:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-4">
                        <li>Click on your profile icon (top-right corner)</li>
                        <li>Select <strong className="text-white">"View API Keys"</strong> from the dropdown</li>
                        <li>Or directly navigate to: <code className="px-2 py-1 rounded bg-black/30 text-green-400">platform.openai.com/api-keys</code></li>
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
                    <h3 className="text-xl font-semibold mb-3">Create New Secret Key</h3>
                    <div className="space-y-3 text-gray-400">
                      <p>Generate a new API key for Recoder.xyz:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-4">
                        <li>Click <strong className="text-white">"+ Create new secret key"</strong> button</li>
                        <li>Give it a descriptive name (e.g., "Recoder.xyz Development")</li>
                        <li>Set permissions (select "All" for full access, or customize as needed)</li>
                        <li>Click "Create secret key"</li>
                      </ol>
                      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-yellow-300 font-semibold mb-1">⚠️ Critical Warning</p>
                            <p className="text-gray-400">
                              Your API key will only be displayed <strong className="text-white">once</strong>.
                              You MUST copy it immediately - you won't be able to see it again!
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
                      <p>Your new API key will be displayed in a modal:</p>
                      <ul className="list-disc list-inside space-y-2 ml-4">
                        <li>It will start with <code className="px-2 py-1 rounded bg-black/30 text-green-400">sk-proj-</code> (new format) or <code className="px-2 py-1 rounded bg-black/30 text-green-400">sk-</code> (legacy)</li>
                        <li>Click the copy button to copy the entire key</li>
                        <li>Store it securely - this is your only chance to see it!</li>
                      </ul>
                      <div className="p-3 rounded-lg bg-black/30 border border-green-500/30 font-mono text-sm mt-4">
                        <span className="text-green-400">sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span>
                      </div>
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-red-300 font-semibold mb-1">🔐 Security Notice</p>
                            <p className="text-gray-400">
                              Never share your API key publicly or commit it to version control.
                              Anyone with your key can use your OpenAI credits!
                            </p>
                          </div>
                        </div>
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
                      <p>Now add your OpenAI API key to Recoder.xyz:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-4">
                        <li>
                          Go to{' '}
                          <Link href="/settings/ai-providers" className="text-orange-500 hover:text-orange-400 underline">
                            Settings → AI Providers
                          </Link>
                        </li>
                        <li>Find the "OpenAI" card</li>
                        <li>Click <strong className="text-white">"Add API Key"</strong></li>
                        <li>Paste your API key (the one starting with <code className="px-2 py-1 rounded bg-black/30 text-green-400">sk-proj-</code> or <code className="px-2 py-1 rounded bg-black/30 text-green-400">sk-</code>)</li>
                        <li>Give it a friendly name (optional)</li>
                        <li>Click "Save"</li>
                      </ol>
                      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 mt-4">
                        <div className="flex items-start space-x-3">
                          <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="text-green-300 font-semibold mb-1">✅ Success!</p>
                            <p className="text-gray-400">
                              Your API key is encrypted with military-grade AES-256-GCM encryption and stored securely.
                              You can now use GPT models in Recoder.xyz!
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
              OpenAI charges per token (input and output). Here are the current rates for popular GPT models:
            </p>

            <div className="grid gap-6">
              {/* GPT-4o */}
              <div className="p-6 rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-green-400 mb-1">GPT-4o</h3>
                    <p className="text-sm text-gray-400">Latest GPT-4 optimized model - best balance of speed & intelligence</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30">
                    Recommended
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$5.00</div>
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
                    costs approximately <strong className="text-green-400">$0.15 - $0.35</strong>
                  </p>
                </div>
              </div>

              {/* GPT-4o mini */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">GPT-4o mini</h3>
                    <p className="text-sm text-gray-400">Fast and affordable - great for most development tasks</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Budget
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$0.15</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Output</div>
                    <div className="text-2xl font-bold text-white">$0.60</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <p className="text-sm text-gray-400">
                    <strong className="text-green-400">💡 Best Value:</strong> GPT-4o mini is <strong className="text-white">90% cheaper</strong> than
                    GPT-4o while still delivering excellent results for code generation!
                  </p>
                </div>
              </div>

              {/* GPT-4 Turbo */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">GPT-4 Turbo</h3>
                    <p className="text-sm text-gray-400">Previous generation - still powerful for complex tasks</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$10.00</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Output</div>
                    <div className="text-2xl font-bold text-white">$30.00</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                </div>
              </div>

              {/* GPT-3.5 Turbo */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">GPT-3.5 Turbo</h3>
                    <p className="text-sm text-gray-400">Ultra-fast and extremely affordable for simple tasks</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30">
                    Cheapest
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Input</div>
                    <div className="text-2xl font-bold text-white">$0.50</div>
                    <div className="text-xs text-gray-500">per million tokens</div>
                  </div>
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">Output</div>
                    <div className="text-2xl font-bold text-white">$1.50</div>
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
                  <div className="text-gray-400 mb-2">ChatGPT Plus Subscription</div>
                  <div className="text-3xl font-bold text-red-400 mb-1">$20/mo</div>
                  <div className="text-xs text-gray-500">Flat rate, rate limits, no API access</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-2">Recoder.xyz + Your OpenAI Key</div>
                  <div className="text-3xl font-bold text-green-400 mb-1">$2-8/mo</div>
                  <div className="text-xs text-gray-500">Pay only for what you use, full control</div>
                </div>
              </div>
              <p className="text-gray-400 mt-4 text-sm">
                For typical development usage (100-200 AI interactions per month with GPT-4o mini), you'll spend
                <strong className="text-green-400"> 80-90% less</strong> with BYOK compared to ChatGPT Plus!
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
                  <span>❌ "Incorrect API key provided" Error</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you're seeing an invalid API key error:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Make sure you copied the <strong className="text-white">entire key</strong> (including <code className="px-2 py-1 rounded bg-black/30 text-green-400">sk-proj-</code> or <code className="px-2 py-1 rounded bg-black/30 text-green-400">sk-</code> prefix)</li>
                    <li>Check for extra spaces at the beginning or end</li>
                    <li>Verify the key hasn't been revoked in OpenAI Platform</li>
                    <li>If you regenerated a key, make sure you're using the new one</li>
                  </ul>
                </div>
              </details>

              {/* Issue 2 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>💳 "You exceeded your current quota" Error</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If your requests are failing due to quota limits:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Check your <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">usage dashboard</a> to see your remaining credits</li>
                    <li>Add a payment method in <a href="https://platform.openai.com/account/billing/overview" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">billing settings</a></li>
                    <li>For new accounts: Free $5 credits expire after 3 months</li>
                    <li>Set up usage limits to avoid unexpected charges</li>
                  </ul>
                </div>
              </details>

              {/* Issue 3 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>⚠️ Rate Limit Errors (429 status)</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you're hitting rate limits:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>OpenAI has tiered rate limits based on your usage history</li>
                    <li>Wait a few seconds and try again</li>
                    <li>For higher limits, increase your <a href="https://platform.openai.com/account/billing/overview" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">usage tier</a> (automatically happens as you spend more)</li>
                    <li>Consider using a cheaper model (GPT-3.5) for less critical tasks</li>
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
                    <li>Refresh the Recoder.xyz page</li>
                    <li>Make sure you selected "OpenAI" as your provider in the chat interface</li>
                    <li>Verify a specific GPT model is selected (GPT-4o, GPT-3.5, etc.)</li>
                    <li>Check that the key is still active in OpenAI Platform</li>
                    <li>Try removing and re-adding the key</li>
                  </ul>
                </div>
              </details>

              {/* Issue 5 */}
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>🛡️ "Access denied" or Permission Errors</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you're seeing permission errors:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Check if your OpenAI account is in good standing</li>
                    <li>Verify your payment method is valid and not expired</li>
                    <li>Some regions may have restricted access - check <a href="https://platform.openai.com/docs/supported-countries" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">supported countries</a></li>
                    <li>Ensure you've completed phone verification</li>
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
              Now that you have your OpenAI API key set up, you're ready to start building with GPT!
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
