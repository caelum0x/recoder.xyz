'use client';

import Link from 'next/link';
import { ArrowRight, HelpCircle, Lock, DollarSign, Zap, Shield, Users } from 'lucide-react';
import { useState } from 'react';

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      category: 'General',
      icon: HelpCircle,
      questions: [
        {
          q: 'Is Recoder.xyz really free?',
          a: 'Yes! Recoder.xyz is 100% free during our beta. We use the BYOK (Bring Your Own Key) model, which means you provide your own AI API key from providers like OpenRouter, Anthropic, or OpenAI. You pay them directly for AI usage (typically $0.01 per chat), and we charge you nothing. No subscriptions, no hidden fees, no trials that expire.'
        },
        {
          q: 'What is BYOK (Bring Your Own Key)?',
          a: 'BYOK means you bring your own API key from AI providers. Instead of us charging you a monthly subscription with markups, you pay AI providers directly. This gives you full cost transparency and control. For example, $5 on OpenRouter gives you 500+ AI requests - no markup from us!'
        },
        {
          q: 'Do I need a credit card to sign up?',
          a: 'No! Sign up is completely free with GitHub or Google. No credit card required, no payment information needed at all. You only need to add payment info when you get your API key from AI providers (OpenRouter, Anthropic, or OpenAI).'
        },
        {
          q: 'What happens after beta ends?',
          a: 'We\'ll announce any pricing changes well before beta ends. Our plan is to keep the BYOK model free forever, with optional premium features for teams/enterprises. Beta users may receive special pricing or grandfather benefits.'
        }
      ]
    },
    {
      category: 'API Keys & Security',
      icon: Lock,
      questions: [
        {
          q: 'How do you store my API keys?',
          a: 'Your API keys are encrypted with AES-256-GCM before being stored in our database. This is military-grade encryption - the same level used by banks. Even our team cannot see your keys in plain text. We take security seriously!'
        },
        {
          q: 'Can you see my AI usage or conversations?',
          a: 'No. Your API key connects directly to AI providers (OpenRouter, Anthropic, OpenAI). Your requests go through our servers to add your key, but we don\'t log or store your conversations. We respect your privacy.'
        },
        {
          q: 'Which AI provider should I choose?',
          a: 'We recommend OpenRouter for beginners because it gives you access to 40+ models with one API key. Anthropic is great if you specifically want Claude models. OpenAI is perfect for GPT-4 and GPT-4 Turbo. You can add multiple keys and switch between them anytime!'
        },
        {
          q: 'Can I use multiple API keys?',
          a: 'Yes! You can add API keys from OpenRouter, Anthropic, and OpenAI all at once. Then, in the chat interface, you can switch between providers and models based on your needs. For example, use Claude for coding and GPT-4 for creative writing.'
        },
        {
          q: 'What if my API key gets compromised?',
          a: 'You can delete or regenerate your API key at any time from Settings → AI Providers. If you suspect your key is compromised, immediately regenerate it from your AI provider\'s dashboard (OpenRouter, Anthropic, or OpenAI), then update it in Recoder.'
        }
      ]
    },
    {
      category: 'Costs & Pricing',
      icon: DollarSign,
      questions: [
        {
          q: 'How much does AI usage actually cost?',
          a: 'It depends on the model you choose! With our default model (Grok Code Fast 1), it\'s about $0.001 per chat. That means 1,000 chats for $1! Budget models like DeepSeek R1T2 are completely FREE. Premium models like Claude Sonnet 4.5 cost around $0.003 per chat. You can see costs in real-time when selecting models.'
        },
        {
          q: 'How much should I budget for API costs?',
          a: 'For most users, $5-10/month is plenty. Example: $5 on OpenRouter = 500+ chats with Grok Code Fast. If you use budget models like Gemini Flash Lite ($0.00005/chat), $5 could last you months! You control costs by choosing cheaper models when you don\'t need premium quality.'
        },
        {
          q: 'Will Recoder.xyz charge me anything?',
          a: 'Not during beta! We charge $0. You pay AI providers directly for usage. In the future, we may offer optional premium features for teams/enterprises, but the BYOK model will remain free.'
        },
        {
          q: 'How do I know how much I\'m spending?',
          a: 'Check your API provider\'s dashboard (OpenRouter, Anthropic, or OpenAI) to see exact usage and costs. We also show estimated costs per model in our interface so you know before you send a message.'
        }
      ]
    },
    {
      category: 'Features & Usage',
      icon: Zap,
      questions: [
        {
          q: 'What\'s the difference between Web IDE and Terminal CLI?',
          a: 'Web IDE runs in your browser - perfect for quick projects with no setup. Terminal CLI runs locally with full file system access - perfect for serious development. The magic? They sync! Start a project in Web IDE, download to your local machine with CLI, edit locally, and push changes back. Best of both worlds!'
        },
        {
          q: 'How many AI models can I use?',
          a: 'With OpenRouter, you get access to 40+ models including GPT-4, Claude 3.5 Sonnet, Gemini, DeepSeek, Llama, and more. With Anthropic, you get all Claude models. With OpenAI, you get GPT-3.5, GPT-4, and GPT-4 Turbo. You can switch models anytime!'
        },
        {
          q: 'Can I use Recoder offline?',
          a: 'The Terminal CLI works offline for file operations, but AI features require internet connection (to reach AI providers). Web IDE requires internet connection. Your files are stored locally with CLI, so you can continue working offline and sync when back online.'
        },
        {
          q: 'Is there a usage limit?',
          a: 'No limits from Recoder! Your only limit is your API provider\'s rate limits and your budget. Most providers have generous rate limits (e.g., OpenRouter allows thousands of requests per day). You\'re in full control.'
        },
        {
          q: 'Can I sync projects between Web IDE and CLI?',
          a: 'Yes! This is our unique value proposition. Create a project in Web IDE, use the CLI to download it locally, edit on your machine, and push changes back. Or start locally with CLI and open in Web IDE. Seamless workflow!'
        }
      ]
    },
    {
      category: 'Technical',
      icon: Shield,
      questions: [
        {
          q: 'Which models are fastest?',
          a: 'Models with ⚡⚡⚡ rating are fastest: Grok Code Fast 1, Claude Haiku 4.5, Gemini Flash, GPT-4o Mini, etc. These respond in 1-3 seconds. Models with ⚡⚡ are fast (3-5 seconds), and ⚡ are standard (5-10 seconds). Speed indicators are shown when selecting models.'
        },
        {
          q: 'Which model should I use for coding?',
          a: 'Top picks: (1) Grok Code Fast 1 - fastest and cheap, (2) Claude Sonnet 4.5 - best quality, (3) GPT-4 Turbo - great all-rounder. For budget: Gemini Flash is excellent and super cheap ($0.0001/chat).'
        },
        {
          q: 'What are context lengths?',
          a: 'Context length is how much text a model can "remember" at once. Gemini 2.5 Pro has 2M tokens (can handle entire codebases!), Claude models have 200K tokens (great for long conversations), GPT-4 Turbo has 128K tokens. Longer context = more history/code the AI can reference.'
        },
        {
          q: 'Can I cancel anytime?',
          a: 'There\'s nothing to cancel! Since Recoder.xyz is free and you pay AI providers directly, you can stop using it anytime with zero commitment. Just stop sending chats and you stop paying. No contracts, no cancellation fees.'
        }
      ]
    },
    {
      category: 'Support & Community',
      icon: Users,
      questions: [
        {
          q: 'How do I get help?',
          a: 'We have multiple support channels: (1) This FAQ page, (2) Email us at recoderxyz@gmail.com, (3) Message us on Twitter @recoderxyz, (4) Check our docs first - most questions are answered there!'
        },
        {
          q: 'Can I request new features?',
          a: 'Absolutely! We love feedback from beta users. Send feature requests to recoderxyz@gmail.com or DM us on Twitter @recoderxyz. We actively review and prioritize based on user requests.'
        },
        {
          q: 'Is there a community?',
          a: 'We\'re building an awesome community of developers who use AI to ship faster! Follow us on Twitter @recoderxyz for updates, tips, and to connect with other users. You can also email recoderxyz@gmail.com to get in touch.'
        },
        {
          q: 'How can I report bugs?',
          a: 'Found a bug? Please email us at recoderxyz@gmail.com or message us on Twitter @recoderxyz with: (1) What you were trying to do, (2) What happened instead, (3) Steps to reproduce. We aim to fix critical bugs within 24-48 hours during beta.'
        }
      ]
    }
  ];

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
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-blue-500/20 bg-blue-500/10 mb-6">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-400">Frequently Asked Questions</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              Got Questions?
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
                We've Got Answers
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to know about Recoder.xyz, BYOK, API keys, costs, and more.
            </p>
          </div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-3 gap-4 mb-12">
            <a
              href="#general"
              className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all text-center"
            >
              <HelpCircle className="w-6 h-6 text-orange-500 mx-auto mb-2" />
              <div className="text-sm font-semibold">General</div>
            </a>
            <a
              href="#security"
              className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all text-center"
            >
              <Lock className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <div className="text-sm font-semibold">Security</div>
            </a>
            <a
              href="#costs"
              className="p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all text-center"
            >
              <DollarSign className="w-6 h-6 text-purple-500 mx-auto mb-2" />
              <div className="text-sm font-semibold">Costs</div>
            </a>
          </div>

          {/* FAQ Categories */}
          {faqs.map((category, catIndex) => (
            <div key={catIndex} id={category.category.toLowerCase()} className="mb-12">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-purple-500/20 flex items-center justify-center">
                  <category.icon className="w-5 h-5 text-orange-500" />
                </div>
                <h2 className="text-3xl font-bold">{category.category}</h2>
              </div>

              <div className="space-y-4">
                {category.questions.map((faq, qIndex) => {
                  const globalIndex = faqs.slice(0, catIndex).reduce((acc, cat) => acc + cat.questions.length, 0) + qIndex;
                  const isOpen = openIndex === globalIndex;

                  return (
                    <div
                      key={qIndex}
                      className="rounded-lg border border-white/10 bg-white/5 overflow-hidden transition-all"
                    >
                      <button
                        onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                        className="w-full p-6 text-left flex items-start justify-between hover:bg-white/10 transition-all"
                      >
                        <span className="font-semibold text-lg pr-4">{faq.q}</span>
                        <div className={`transform transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-6 pb-6">
                          <div className="pt-4 border-t border-white/10">
                            <p className="text-gray-300 leading-relaxed whitespace-pre-line">{faq.a}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Still Have Questions? */}
          <div className="mt-16 p-8 rounded-2xl border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-purple-600/10">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">Still Have Questions?</h2>
              <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
                Can't find what you're looking for? Reach out to our team or community.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="mailto:recoderxyz@gmail.com"
                  className="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all inline-flex items-center space-x-2"
                >
                  <span>Email Us</span>
                  <ArrowRight className="w-4 h-4" />
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
                  href="/docs/getting-started"
                  className="px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
                >
                  Getting Started Guide
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
