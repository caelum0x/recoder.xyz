import Link from 'next/link';
import { DollarSign, Target, Shield, TrendingUp, Users, Zap, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';

export default function BYOKPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Main Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-green-500/20 bg-green-500/10 mb-6">
              <Shield className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Bring Your Own Key (BYOK)</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              Why
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
                Bring Your Own Key?
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Understanding the BYOK model and why it's better for developers
            </p>
          </div>

          {/* TL;DR */}
          <div className="p-6 rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-purple-600/10 mb-16">
            <h2 className="text-2xl font-bold mb-4">TL;DR</h2>
            <p className="text-gray-300 mb-4">
              Instead of charging you $20-50/month for AI features, we let you use your own API key from AI providers.
              This means:
            </p>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span>You pay <strong className="text-white">$0.01 per chat</strong> instead of $50/month</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span>You get <strong className="text-white">full cost transparency</strong> - see exactly what you spend</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span>We charge <strong className="text-white">$0</strong> - Recoder.xyz is 100% free</span>
              </li>
            </ul>
          </div>

          {/* Main Benefits */}
          <div className="space-y-8 mb-16">
            <h2 className="text-3xl font-bold">The 3 Big Benefits</h2>

            {/* Benefit 1: Cost Control */}
            <div className="p-8 rounded-2xl border border-green-500/20 bg-green-500/5">
              <div className="flex items-start space-x-4">
                <div className="w-14 h-14 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-7 h-7 text-green-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">1. You Control Costs</h3>
                  <p className="text-gray-400 mb-4">
                    With BYOK, you pay AI providers directly. No markups, no hidden fees.
                  </p>

                  {/* Cost Comparison */}
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-lg bg-black/40 border border-red-500/30">
                      <div className="flex items-center space-x-2 mb-2">
                        <XCircle className="w-5 h-5 text-red-500" />
                        <span className="font-semibold text-red-400">Traditional SaaS</span>
                      </div>
                      <div className="space-y-2 text-sm text-gray-300">
                        <div>$29/month (Hobby)</div>
                        <div>$49/month (Pro)</div>
                        <div>$99/month (Team)</div>
                        <div className="text-xs text-gray-500">+ Usage limits</div>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-black/40 border border-green-500/30">
                      <div className="flex items-center space-x-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-semibold text-green-400">Recoder BYOK</span>
                      </div>
                      <div className="space-y-2 text-sm text-gray-300">
                        <div>$0/month (Platform)</div>
                        <div>$0.01/chat (AI usage)</div>
                        <div>$5 = 500+ requests</div>
                        <div className="text-xs text-gray-500">No limits!</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-gray-300">
                      <strong className="text-white">Real example:</strong> If you use Recoder 10 times per day,
                      that's ~300 chats/month = <strong className="text-green-400">$3</strong> vs traditional platforms charging <strong className="text-red-400">$49/month</strong>.
                      You save <strong className="text-white">$46/month</strong>!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Benefit 2: Model Choice */}
            <div className="p-8 rounded-2xl border border-purple-500/20 bg-purple-500/5">
              <div className="flex items-start space-x-4">
                <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Target className="w-7 h-7 text-purple-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">2. You Choose Models</h3>
                  <p className="text-gray-400 mb-4">
                    With your own OpenRouter key, you get access to <strong className="text-white">40+ AI models</strong> and can switch between them instantly.
                  </p>

                  {/* Model Options */}
                  <div className="grid md:grid-cols-2 gap-3 mb-4">
                    {[
                      { name: 'Grok Code Fast 1', use: 'Fastest coding', cost: '$0.001/chat', badge: 'Most Popular' },
                      { name: 'Claude Sonnet 4.5', use: 'Best quality', cost: '$0.003/chat', badge: 'Premium' },
                      { name: 'DeepSeek R1T2', use: 'Math/reasoning', cost: 'FREE', badge: 'Free' },
                      { name: 'GPT-4 Turbo', use: 'General purpose', cost: '$0.01/chat', badge: 'Reliable' },
                      { name: 'Gemini Flash', use: 'Budget-friendly', cost: '$0.0001/chat', badge: 'Cheap' },
                      { name: 'Llama 3.1 405B', use: 'Open source', cost: '$0.002/chat', badge: 'OSS' },
                    ].map((model, i) => (
                      <div key={i} className="p-3 rounded-lg border border-white/10 bg-black/40">
                        <div className="flex items-start justify-between mb-1">
                          <div className="font-semibold text-sm">{model.name}</div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                            {model.badge}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mb-1">{model.use}</div>
                        <div className="text-xs text-green-400 font-mono">{model.cost}</div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <p className="text-sm text-gray-300">
                      <strong className="text-white">Traditional platforms:</strong> Force you to use specific models.
                      <strong className="text-white"> BYOK:</strong> You choose the best model for each task and save money using cheaper models when appropriate.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Benefit 3: Privacy & Security */}
            <div className="p-8 rounded-2xl border border-orange-500/20 bg-orange-500/5">
              <div className="flex items-start space-x-4">
                <div className="w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-7 h-7 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-3">3. Enhanced Privacy</h3>
                  <p className="text-gray-400 mb-4">
                    When you use your own API key, your data goes directly to AI providers. We don't log or store your conversations.
                  </p>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-white">Your API key is encrypted</div>
                        <div className="text-sm text-gray-400">AES-256-GCM encryption - even we can't see it in plain text</div>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-white">We don't log conversations</div>
                        <div className="text-sm text-gray-400">Your prompts and AI responses stay between you and the AI provider</div>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-white">You control data retention</div>
                        <div className="text-sm text-gray-400">Manage data policies through your AI provider's settings</div>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-white">No vendor lock-in</div>
                        <div className="text-sm text-gray-400">Switch providers anytime, export your data freely</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="p-8 rounded-2xl border border-white/10 bg-white/5 mb-16">
            <h2 className="text-3xl font-bold mb-6">How BYOK Works</h2>
            <div className="space-y-6">
              {[
                {
                  step: '1',
                  title: 'Sign Up for Recoder.xyz',
                  desc: 'Create your free account - no credit card required',
                  detail: 'Takes 30 seconds with GitHub or Google sign-in'
                },
                {
                  step: '2',
                  title: 'Get an API Key from a Provider',
                  desc: 'Choose OpenRouter (recommended), Anthropic, or OpenAI',
                  detail: 'OpenRouter gives you $5 free credit on signup = 500+ requests'
                },
                {
                  step: '3',
                  title: 'Add Your Key to Recoder',
                  desc: 'Go to Settings → AI Providers and paste your key',
                  detail: 'We encrypt it with AES-256-GCM before storing'
                },
                {
                  step: '4',
                  title: 'Start Building!',
                  desc: 'Use Web IDE or CLI - pay only for what you use',
                  detail: 'Check your AI provider dashboard to see exact costs'
                }
              ].map((item, i) => (
                <div key={i} className="flex items-start space-x-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center flex-shrink-0 font-bold">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">{item.title}</h3>
                    <p className="text-gray-400 mb-1">{item.desc}</p>
                    <p className="text-sm text-gray-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Common Questions */}
          <div className="space-y-6 mb-16">
            <h2 className="text-3xl font-bold">Common Questions</h2>

            <div className="space-y-4">
              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">Why can't you just include AI in the price?</h3>
                <p className="text-gray-400">
                  AI API costs are expensive and unpredictable. OpenAI charges us the same price they charge you.
                  If we included it, we'd either have to charge $50+/month (with limits) or go out of business.
                  BYOK lets us stay free while you get unlimited usage at cost.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">Is my API key safe?</h3>
                <p className="text-gray-400 mb-3">
                  Yes! We encrypt your API key with AES-256-GCM (military-grade encryption) before storing it.
                  Even our team cannot see your key in plain text. The key is only decrypted when making API calls on your behalf.
                </p>
                <p className="text-sm text-gray-500">
                  Think of it like how 1Password stores your passwords - encrypted at rest, only decrypted when needed.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">How much will I actually spend?</h3>
                <p className="text-gray-400 mb-3">
                  It depends on which models you use and how often. Here are real examples:
                </p>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li>• <strong className="text-white">Light user (10 chats/day):</strong> ~$3/month with Grok Code Fast</li>
                  <li>• <strong className="text-white">Regular user (30 chats/day):</strong> ~$9/month with Grok Code Fast</li>
                  <li>• <strong className="text-white">Heavy user (100 chats/day):</strong> ~$30/month (still cheaper than $50 Pro plans!)</li>
                  <li>• <strong className="text-white">Using free models like DeepSeek:</strong> $0/month!</li>
                </ul>
              </div>

              <div className="p-6 rounded-xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-lg mb-2">What if I run out of credits?</h3>
                <p className="text-gray-400">
                  Just add more credits to your AI provider account (OpenRouter, Anthropic, or OpenAI).
                  You'll get a clear error message when your credits run low, and you can top up instantly.
                  No surprise bills - you control exactly how much you spend.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Try BYOK?</h2>
            <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
              Sign up for free, add your API key, and start building. No commitment, cancel anytime.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/signin"
                className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all flex items-center space-x-2"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/docs/getting-started"
                className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
              >
                Read Getting Started Guide
              </Link>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              No credit card • Takes 5 minutes • $0 platform fee
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
