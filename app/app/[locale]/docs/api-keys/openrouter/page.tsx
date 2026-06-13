import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Key, Sparkles, CheckCircle, AlertCircle, Copy, ArrowRight, DollarSign, Zap } from 'lucide-react';

export const metadata: Metadata = {
  alternates: { canonical: 'https://recoder.xyz/docs/api-keys/openrouter' },
};

export default function OpenRouterSetupPage() {
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
            <Link href="/docs/getting-started" className="text-sm text-gray-400 hover:text-white transition-colors">
              Getting Started
            </Link>
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
              <span className="text-sm text-green-400">Recommended Provider</span>
            </div>
            <div className="flex items-center justify-center space-x-4 mb-4">
              <span className="text-5xl">📦</span>
              <h1 className="text-5xl md:text-6xl font-bold">OpenRouter</h1>
            </div>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Get your OpenRouter API key in under 2 minutes and access 40+ AI models with one key
            </p>
          </div>

          {/* Why OpenRouter */}
          <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10 mb-16">
            <h2 className="text-3xl font-bold mb-6">Why We Recommend OpenRouter</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">One Key, 40+ Models</div>
                    <div className="text-sm text-gray-400">Access GPT-4, Claude, Gemini, Llama, DeepSeek, and more</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Pay-as-You-Go</div>
                    <div className="text-sm text-gray-400">Only pay for what you use, starting at $0.001/chat</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Free Credits</div>
                    <div className="text-sm text-gray-400">New users often get free credits to start</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Model Routing</div>
                    <div className="text-sm text-gray-400">Automatically routes to fastest/cheapest provider</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Transparent Pricing</div>
                    <div className="text-sm text-gray-400">See exact costs for each model before using</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Easy Setup</div>
                    <div className="text-sm text-gray-400">No credit card required to start</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step-by-Step Guide */}
          <div className="space-y-8 mb-16">
            <h2 className="text-3xl font-bold">Step-by-Step Setup Guide</h2>

            {/* Step 1 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-orange-500">1</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Create an OpenRouter Account</h3>
                  <p className="text-gray-400 mb-4">
                    Visit OpenRouter and sign up with your email or GitHub account.
                  </p>
                  <a
                    href="https://openrouter.ai/keys?ref=recoder"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
                  >
                    <span>Go to OpenRouter</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-gray-300">
                      <strong className="text-white">Tip:</strong> Signing up with GitHub is fastest and doesn't require email verification.
                    </p>
                  </div>
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
                  <h3 className="text-2xl font-bold mb-3">Navigate to API Keys</h3>
                  <p className="text-gray-400 mb-4">
                    Once logged in, click on your profile icon in the top right, then select "Keys" from the dropdown menu.
                  </p>
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10 mb-4">
                    <p className="text-sm text-gray-300 mb-2">Or go directly to:</p>
                    <code className="text-xs text-green-400">https://openrouter.ai/keys</code>
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
                  <h3 className="text-2xl font-bold mb-3">Create a New API Key</h3>
                  <p className="text-gray-400 mb-4">
                    Click the "Create Key" button and give your key a name (e.g., "Recoder.xyz").
                  </p>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">a</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Click <strong className="text-white">"Create Key"</strong> or <strong className="text-white">"+ New Key"</strong>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">b</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Enter a name: <code className="text-xs bg-black/40 px-2 py-1 rounded">Recoder.xyz</code>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">c</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        (Optional) Set spending limits to control costs
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">d</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Click <strong className="text-white">"Create"</strong>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-300">
                        <strong className="text-white">Pro tip:</strong> Set a spending limit (e.g., $10/month) to avoid unexpected charges. You can always increase it later!
                      </p>
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
                  <h3 className="text-2xl font-bold mb-3">Copy Your API Key</h3>
                  <p className="text-gray-400 mb-4">
                    Your new API key will be displayed. Click the copy button to copy it to your clipboard.
                  </p>
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10 mb-4">
                    <div className="flex items-center justify-between">
                      <code className="text-sm text-gray-300 font-mono">sk-or-v1-abc123...</code>
                      <button className="p-2 hover:bg-white/10 rounded transition-colors">
                        <Copy className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-300">
                        <strong className="text-white">Important:</strong> This is the only time OpenRouter will show you the full API key.
                        Make sure to copy it now! If you lose it, you'll need to create a new one.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-purple-500">5</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Add Credits (Optional)</h3>
                  <p className="text-gray-400 mb-4">
                    OpenRouter uses a pay-as-you-go model. Add credits to start using the API.
                  </p>
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div className="p-4 rounded-lg border border-white/10 bg-black/40 text-center">
                      <div className="text-2xl font-bold text-green-400 mb-1">$5</div>
                      <div className="text-sm text-gray-400 mb-2">Recommended Start</div>
                      <div className="text-xs text-gray-500">~500 requests</div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-black/40 text-center">
                      <div className="text-2xl font-bold text-green-400 mb-1">$10</div>
                      <div className="text-sm text-gray-400 mb-2">Popular Choice</div>
                      <div className="text-xs text-gray-500">~1,000 requests</div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-black/40 text-center">
                      <div className="text-2xl font-bold text-green-400 mb-1">$25</div>
                      <div className="text-sm text-gray-400 mb-2">Power User</div>
                      <div className="text-xs text-gray-500">~2,500 requests</div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-gray-300">
                      <strong className="text-white">Note:</strong> Some users get free credits when signing up.
                      Check your account balance before adding credits!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 6 */}
            <div className="p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-green-500">6</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">Add Key to Recoder.xyz</h3>
                  <p className="text-gray-400 mb-4">
                    Now, add your OpenRouter API key to Recoder.xyz.
                  </p>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">1</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Go to <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 underline">Dashboard</Link>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">2</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Click <Link href="/settings/ai-providers" className="text-orange-500 hover:text-orange-400 underline">"Manage API Keys"</Link> or go to Settings → AI Providers
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">3</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Find the <strong className="text-white">OpenRouter</strong> section
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-500">4</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        Paste your API key and click <strong className="text-white">"Save"</strong>
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/settings/ai-providers"
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
                  >
                    <Key className="w-5 h-5" />
                    <span>Add API Key Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Information */}
          <div className="p-8 rounded-2xl border border-white/10 bg-white/5 mb-16">
            <h2 className="text-3xl font-bold mb-6">OpenRouter Pricing</h2>
            <p className="text-gray-400 mb-6">
              Here are some popular models and their costs on OpenRouter:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { name: 'Grok Code Fast 1', cost: '$0.001', per: '1K tokens', use: 'Fastest coding', badge: 'Popular' },
                { name: 'DeepSeek R1T2', cost: 'FREE', per: '', use: 'Math & reasoning', badge: 'Free' },
                { name: 'Claude 3.5 Sonnet', cost: '$0.003', per: '1K tokens', use: 'Best quality', badge: 'Premium' },
                { name: 'GPT-4 Turbo', cost: '$0.01', per: '1K tokens', use: 'General purpose', badge: 'Reliable' },
                { name: 'Gemini Flash', cost: '$0.0001', per: '1K tokens', use: 'Budget-friendly', badge: 'Cheap' },
                { name: 'Llama 3.1 405B', cost: '$0.002', per: '1K tokens', use: 'Open source', badge: 'OSS' },
              ].map((model, i) => (
                <div key={i} className="p-4 rounded-lg border border-white/10 bg-black/40">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold">{model.name}</div>
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                      {model.badge}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mb-2">{model.use}</div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-lg font-bold text-green-400">{model.cost}</span>
                    {model.per && <span className="text-xs text-gray-500">{model.per}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-gray-300">
                <strong className="text-white">Pro tip:</strong> Start with budget models like Gemini Flash ($0.0001/chat) to learn, then upgrade to premium models when needed. You can switch models anytime!
              </p>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="space-y-6 mb-16">
            <h2 className="text-3xl font-bold">Troubleshooting</h2>
            <div className="space-y-4">
              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">Error: "Invalid API key"</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li>• Make sure you copied the entire key (starts with <code className="text-xs bg-black/40 px-1 py-0.5 rounded">sk-or-v1-</code>)</li>
                  <li>• Check for extra spaces before or after the key</li>
                  <li>• Try creating a new API key on OpenRouter</li>
                </ul>
              </div>

              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">Error: "Insufficient credits"</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li>• Check your OpenRouter account balance</li>
                  <li>• Add more credits at <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">openrouter.ai/credits</a></li>
                  <li>• Try using free models like DeepSeek R1T2</li>
                </ul>
              </div>

              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">Lost or forgot API key?</h3>
                <p className="text-sm text-gray-300 mb-2">
                  OpenRouter doesn't show API keys after creation for security. You'll need to:
                </p>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li>• Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">openrouter.ai/keys</a></li>
                  <li>• Delete the old key</li>
                  <li>• Create a new one and add it to Recoder</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10 text-center">
            <h2 className="text-3xl font-bold mb-4">🎉 You're All Set!</h2>
            <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
              Your OpenRouter API key is ready to use. Start building with AI now!
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/settings/ai-providers"
                className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all flex items-center space-x-2"
              >
                <Key className="w-5 h-5" />
                <span>Add API Key</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/docs/getting-started"
                className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
              >
                Back to Getting Started
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
