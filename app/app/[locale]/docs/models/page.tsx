import Link from 'next/link';
import { ArrowLeft, Sparkles, Zap, Brain, DollarSign, Clock, Shield, CheckCircle } from 'lucide-react';

export default function ModelsGuidePage() {
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
        <div className="container mx-auto max-w-5xl">
          {/* Breadcrumb */}
          <div className="mb-8 flex items-center space-x-2 text-sm text-gray-400">
            <Link href="/docs/getting-started" className="hover:text-orange-500 transition-colors">
              Documentation
            </Link>
            <span>/</span>
            <span className="text-white">Model Selection Guide</span>
          </div>

          {/* Title Section */}
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-orange-500/30">
                <Brain className="w-8 h-8 text-orange-500" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">
                Choosing the Right AI Model
              </h1>
            </div>
            <p className="text-xl text-gray-400 leading-relaxed">
              A comprehensive guide to selecting the perfect AI model for your development needs.
              Balance cost, speed, and intelligence based on your task.
            </p>
          </div>

          {/* TL;DR Quick Recommendations */}
          <section className="mb-12 p-8 rounded-2xl bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30">
            <h2 className="text-2xl font-bold mb-6 flex items-center space-x-2">
              <Sparkles className="w-6 h-6 text-green-400" />
              <span>TL;DR - Quick Recommendations</span>
            </h2>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-black/30 border border-purple-500/30">
                <div className="text-3xl mb-3">🎯</div>
                <h3 className="font-bold text-purple-400 mb-2">Best Overall</h3>
                <p className="text-lg font-semibold text-white mb-1">Claude 3.5 Sonnet</p>
                <p className="text-sm text-gray-400">
                  Perfect balance of intelligence, speed, and cost. Excellent at code generation and reasoning.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-black/30 border border-green-500/30">
                <div className="text-3xl mb-3">💰</div>
                <h3 className="font-bold text-green-400 mb-2">Best Value</h3>
                <p className="text-lg font-semibold text-white mb-1">GPT-4o mini</p>
                <p className="text-sm text-gray-400">
                  Ultra-affordable while still delivering great results. Perfect for most coding tasks.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-black/30 border border-orange-500/30">
                <div className="text-3xl mb-3">⚡</div>
                <h3 className="font-bold text-orange-400 mb-2">Best Speed</h3>
                <p className="text-lg font-semibold text-white mb-1">Grok Beta (via OpenRouter)</p>
                <p className="text-sm text-gray-400">
                  Lightning-fast responses. Great when you need quick answers and iterations.
                </p>
              </div>
            </div>
          </section>

          {/* Model Comparison Table */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Model Comparison
              </span>
            </h2>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-4 text-gray-400 font-semibold">Model</th>
                    <th className="text-left p-4 text-gray-400 font-semibold">Provider</th>
                    <th className="text-center p-4 text-gray-400 font-semibold">Intelligence</th>
                    <th className="text-center p-4 text-gray-400 font-semibold">Speed</th>
                    <th className="text-center p-4 text-gray-400 font-semibold">Cost</th>
                    <th className="text-left p-4 text-gray-400 font-semibold">Best For</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Claude 3.5 Sonnet */}
                  <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">Claude 3.5 Sonnet</div>
                      <div className="text-xs text-green-400 mt-1">⭐ Recommended</div>
                    </td>
                    <td className="p-4 text-gray-400">Anthropic</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-purple-500"></div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-500"></div>
                          ))}
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-green-400 font-semibold">$$</td>
                    <td className="p-4 text-sm text-gray-400">Complex code, reasoning, architecture</td>
                  </tr>

                  {/* GPT-4o */}
                  <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">GPT-4o</div>
                    </td>
                    <td className="p-4 text-gray-400">OpenAI</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-purple-500"></div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-500"></div>
                          ))}
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-yellow-400 font-semibold">$$</td>
                    <td className="p-4 text-sm text-gray-400">General purpose, versatile tasks</td>
                  </tr>

                  {/* GPT-4o mini */}
                  <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">GPT-4o mini</div>
                      <div className="text-xs text-blue-400 mt-1">💎 Best Value</div>
                    </td>
                    <td className="p-4 text-gray-400">OpenAI</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-purple-500"></div>
                          ))}
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-500"></div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-green-400 font-semibold">$</td>
                    <td className="p-4 text-sm text-gray-400">Most coding tasks, rapid iteration</td>
                  </tr>

                  {/* Grok Beta */}
                  <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">Grok Beta</div>
                      <div className="text-xs text-orange-400 mt-1">⚡ Fastest</div>
                    </td>
                    <td className="p-4 text-gray-400">OpenRouter</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-purple-500"></div>
                          ))}
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-500"></div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-red-400 font-semibold">$$$</td>
                    <td className="p-4 text-sm text-gray-400">Quick answers, fast prototyping</td>
                  </tr>

                  {/* Claude 3 Haiku */}
                  <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">Claude 3 Haiku</div>
                    </td>
                    <td className="p-4 text-gray-400">Anthropic</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-purple-500"></div>
                          ))}
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-500"></div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-green-400 font-semibold">$</td>
                    <td className="p-4 text-sm text-gray-400">Simple tasks, high volume</td>
                  </tr>

                  {/* GPT-3.5 Turbo */}
                  <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">GPT-3.5 Turbo</div>
                    </td>
                    <td className="p-4 text-gray-400">OpenAI</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-purple-500"></div>
                          ))}
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                          <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-500"></div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-green-400 font-semibold">$</td>
                    <td className="p-4 text-sm text-gray-400">Basic coding, documentation</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4">
              {/* Claude 3.5 Sonnet */}
              <div className="p-5 rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white">Claude 3.5 Sonnet</h3>
                    <p className="text-sm text-gray-400">Anthropic</p>
                  </div>
                  <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                    Recommended
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div>
                    <div className="text-gray-400 mb-1">Intelligence</div>
                    <div className="text-white font-semibold">★★★★★</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Speed</div>
                    <div className="text-white font-semibold">★★★★☆</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Cost</div>
                    <div className="text-green-400 font-semibold">$$</div>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-3">Complex code, reasoning, architecture</p>
              </div>

              {/* Add similar cards for other models... */}
            </div>
          </section>

          {/* When to Use Each Model */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Use Case Guide
              </span>
            </h2>

            <div className="space-y-6">
              {/* Complex Projects */}
              <div className="p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
                <div className="flex items-start space-x-4">
                  <Brain className="w-8 h-8 text-purple-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-3 text-purple-400">Complex Projects & Architecture</h3>
                    <p className="text-gray-400 mb-4">
                      Building large systems, designing architecture, or solving difficult algorithms.
                    </p>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">✅ Best Choice</div>
                        <p className="text-sm text-gray-400">Claude 3.5 Sonnet or Claude 3 Opus</p>
                      </div>
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">💡 Why</div>
                        <p className="text-sm text-gray-400">Superior reasoning and code understanding</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Development */}
              <div className="p-6 rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent">
                <div className="flex items-start space-x-4">
                  <Zap className="w-8 h-8 text-green-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-3 text-green-400">Daily Development Tasks</h3>
                    <p className="text-gray-400 mb-4">
                      Writing components, fixing bugs, refactoring code, implementing features.
                    </p>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">✅ Best Choice</div>
                        <p className="text-sm text-gray-400">GPT-4o mini or Claude 3.5 Sonnet</p>
                      </div>
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">💡 Why</div>
                        <p className="text-sm text-gray-400">Perfect balance of quality and cost</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Questions */}
              <div className="p-6 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-transparent">
                <div className="flex items-start space-x-4">
                  <Clock className="w-8 h-8 text-orange-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-3 text-orange-400">Quick Questions & Iterations</h3>
                    <p className="text-gray-400 mb-4">
                      Getting fast answers, rapid prototyping, quick code reviews.
                    </p>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">✅ Best Choice</div>
                        <p className="text-sm text-gray-400">Grok Beta or GPT-4o mini</p>
                      </div>
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">💡 Why</div>
                        <p className="text-sm text-gray-400">Lightning-fast responses, immediate feedback</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Budget-Conscious */}
              <div className="p-6 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent">
                <div className="flex items-start space-x-4">
                  <DollarSign className="w-8 h-8 text-blue-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-3 text-blue-400">Budget-Conscious Development</h3>
                    <p className="text-gray-400 mb-4">
                      High-volume usage, documentation, simple scripts, learning.
                    </p>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">✅ Best Choice</div>
                        <p className="text-sm text-gray-400">GPT-3.5 Turbo or Claude 3 Haiku</p>
                      </div>
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="font-semibold text-white mb-1">💡 Why</div>
                        <p className="text-sm text-gray-400">Ultra-low cost while still capable</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Cost Comparison */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Real-World Cost Examples
              </span>
            </h2>

            <p className="text-gray-400 mb-6">
              Here's what a typical development session (20 AI interactions, ~10K total tokens) would cost with different models:
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent">
                <div className="text-sm text-gray-400 mb-2">Most Affordable</div>
                <div className="text-3xl font-bold text-white mb-1">$0.01-0.02</div>
                <div className="text-sm text-gray-400 mb-3">per session</div>
                <div className="text-sm font-semibold text-green-400">GPT-3.5 Turbo</div>
              </div>

              <div className="p-5 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent">
                <div className="text-sm text-gray-400 mb-2">Great Value</div>
                <div className="text-3xl font-bold text-white mb-1">$0.03-0.08</div>
                <div className="text-sm text-gray-400 mb-3">per session</div>
                <div className="text-sm font-semibold text-blue-400">GPT-4o mini / Haiku</div>
              </div>

              <div className="p-5 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
                <div className="text-sm text-gray-400 mb-2">Premium Quality</div>
                <div className="text-3xl font-bold text-white mb-1">$0.10-0.35</div>
                <div className="text-sm text-gray-400 mb-3">per session</div>
                <div className="text-sm font-semibold text-purple-400">Claude 3.5 / GPT-4o</div>
              </div>
            </div>

            <div className="mt-6 p-6 rounded-xl bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30">
              <h3 className="font-semibold text-green-400 mb-3">💡 Pro Tip: Mix and Match</h3>
              <p className="text-gray-400 text-sm">
                You don't need to use the same model for everything! Use Claude 3.5 Sonnet for complex architecture decisions,
                GPT-4o mini for daily coding tasks, and GPT-3.5 for documentation. This strategy can save you
                <strong className="text-green-400"> 60-80%</strong> on costs while maintaining quality.
              </p>
            </div>
          </section>

          {/* Model Switching Tips */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                How to Switch Models
              </span>
            </h2>

            <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
              <p className="text-gray-400 mb-6">
                Recoder.xyz makes it easy to switch between models on the fly:
              </p>

              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">In the Web IDE Chat</h3>
                    <p className="text-sm text-gray-400">
                      Look for the model selector dropdown at the top of the chat interface.
                      Click it to see all available models from your configured providers.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">In the Terminal CLI</h3>
                    <p className="text-sm text-gray-400 mb-2">
                      Use the <code className="px-2 py-1 rounded bg-black/30 text-orange-400">--model</code> flag:
                    </p>
                    <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm text-gray-300">
                      recoder chat --model claude-3.5-sonnet
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">Set a Default</h3>
                    <p className="text-sm text-gray-400">
                      Go to Settings → AI Providers to set your default model. This will be used
                      automatically unless you specify otherwise.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Common Questions
              </span>
            </h2>

            <div className="space-y-4">
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>Can I use multiple models in the same project?</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400">
                  <p>
                    Absolutely! You can switch models anytime during your conversation. Many developers
                    use expensive models for planning and architecture, then switch to cheaper models
                    for implementation details.
                  </p>
                </div>
              </details>

              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>Which model is best for learning to code?</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400">
                  <p>
                    <strong className="text-white">GPT-4o mini</strong> or <strong className="text-white">Claude 3.5 Sonnet</strong> are excellent
                    for learning. They're patient, explain concepts well, and provide good code examples.
                    Start with GPT-4o mini for cost-effectiveness, upgrade to Claude 3.5 for complex topics.
                  </p>
                </div>
              </details>

              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>Why is Grok so expensive compared to others?</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400">
                  <p>
                    Grok Beta is optimized for speed above all else. You pay a premium for near-instantaneous
                    responses. It's worth it when you need rapid iteration, but for most development tasks,
                    GPT-4o mini or Claude 3.5 offer better value.
                  </p>
                </div>
              </details>

              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>Do I need API keys for multiple providers?</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400">
                  <p>
                    No! With <strong className="text-white">OpenRouter</strong>, you can access 40+ models (including
                    Claude and GPT) with just one API key. However, you can also add direct API keys from
                    Anthropic and OpenAI if you prefer.
                  </p>
                  <Link href="/docs/api-keys/openrouter" className="inline-block mt-2 text-orange-500 hover:text-orange-400 underline">
                    Learn more about OpenRouter →
                  </Link>
                </div>
              </details>
            </div>
          </section>

          {/* Next Steps */}
          <section className="p-8 rounded-2xl bg-gradient-to-br from-orange-500/10 to-purple-600/10 border border-orange-500/30">
            <h2 className="text-2xl font-bold mb-4 flex items-center space-x-2">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <span>Ready to Start Building?</span>
            </h2>
            <p className="text-gray-400 mb-6">
              Now that you understand the different models, set up your API keys and start coding!
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <Link
                href="/docs/api-keys/openrouter"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  OpenRouter Setup →
                </h3>
                <p className="text-sm text-gray-400">
                  One key for 40+ models
                </p>
              </Link>
              <Link
                href="/docs/api-keys/anthropic"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  Anthropic Setup →
                </h3>
                <p className="text-sm text-gray-400">
                  Direct Claude access
                </p>
              </Link>
              <Link
                href="/docs/api-keys/openai"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  OpenAI Setup →
                </h3>
                <p className="text-sm text-gray-400">
                  Direct GPT access
                </p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
