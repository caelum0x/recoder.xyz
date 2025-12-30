'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Is Recoder.xyz really free?',
      a: 'Yes! Recoder.xyz is 100% free during beta. You bring your own API key from providers like OpenRouter, Anthropic, or OpenAI, and pay them directly. We add no markup or fees.'
    },
    {
      q: 'What AI models are supported?',
      a: 'We support 40+ models including GPT-4, Claude 3.5, Gemini Pro, Llama 3, Mistral, and many more. You can also use local models via Ollama for complete privacy.'
    },
    {
      q: 'How do I get started?',
      a: 'Sign up with Google or GitHub, add your API key in Settings → AI Providers, then launch the Web IDE or download the CLI. That\'s it!'
    },
    {
      q: 'Is my code private?',
      a: 'Yes. Your code is processed by the AI provider you choose. We don\'t store your code on our servers. For maximum privacy, use local models with Ollama.'
    },
    {
      q: 'What\'s the difference between Web IDE and CLI?',
      a: 'Web IDE is a browser-based code editor - great for quick edits and working from any device. CLI is a terminal tool that integrates with your local development environment.'
    },
    {
      q: 'Can I use Recoder for commercial projects?',
      a: 'Absolutely! There are no restrictions on using Recoder-generated code for commercial projects.'
    },
    {
      q: 'What languages are supported?',
      a: 'All major languages: TypeScript, JavaScript, Python, Rust, Go, Java, C++, Solidity, and more. The AI models handle most programming languages.'
    },
    {
      q: 'How do API keys work?',
      a: 'You get API keys from providers like OpenRouter ($5 free credit), Anthropic, or OpenAI. Add them in Settings → AI Providers. Costs are typically $0.01-0.05 per request.'
    },
    {
      q: 'Will there be a paid plan?',
      a: 'We may introduce premium features in the future, but the core functionality will always be free with your own API keys.'
    },
    {
      q: 'How do I report bugs or request features?',
      a: 'Visit our GitHub repository or use the feedback button in the dashboard. We actively review all submissions.'
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">FAQ</h1>
          <p className="text-xl text-gray-400">Frequently asked questions</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full p-6 text-left flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <span className="font-medium pr-4">{faq.q}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
              </button>
              {openIndex === i && (
                <div className="px-6 pb-6 text-gray-400">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
