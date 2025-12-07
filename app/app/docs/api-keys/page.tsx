import Link from 'next/link';
import { Key, ArrowRight, ExternalLink, Shield, DollarSign } from 'lucide-react';

export default function APIKeysDocsPage() {
  const providers = [
    {
      name: 'OpenRouter',
      description: 'Access 100+ models with one API key. Best for beginners.',
      signup: 'https://openrouter.ai',
      freeCredit: '$5 free credit',
      models: 'GPT-4, Claude, Gemini, Llama, Mistral, and more',
      recommended: true
    },
    {
      name: 'Anthropic',
      description: 'Direct access to Claude models.',
      signup: 'https://console.anthropic.com',
      freeCredit: 'Pay as you go',
      models: 'Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku'
    },
    {
      name: 'OpenAI',
      description: 'Direct access to GPT models.',
      signup: 'https://platform.openai.com',
      freeCredit: 'Pay as you go',
      models: 'GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo'
    },
    {
      name: 'Google AI',
      description: 'Access to Gemini models.',
      signup: 'https://aistudio.google.com',
      freeCredit: 'Free tier available',
      models: 'Gemini Pro, Gemini Flash'
    },
    {
      name: 'Groq',
      description: 'Ultra-fast inference for open models.',
      signup: 'https://console.groq.com',
      freeCredit: 'Free tier available',
      models: 'Llama 3, Mixtral, Gemma'
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center">
              <Key className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold">API Keys Setup</h1>
          </div>
          <p className="text-xl text-gray-400">
            Bring your own API key to use AI models. You pay providers directly with no markup.
          </p>
        </div>

        <div className="space-y-12">
          <section className="p-6 rounded-2xl border border-green-500/20 bg-green-500/5">
            <div className="flex items-start space-x-4">
              <DollarSign className="w-8 h-8 text-green-500 flex-shrink-0" />
              <div>
                <h2 className="text-xl font-bold mb-2">Why Bring Your Own Key?</h2>
                <ul className="text-gray-300 space-y-2">
                  <li>• <strong>No markup</strong> - Pay providers directly at their rates</li>
                  <li>• <strong>Full control</strong> - Set your own spending limits</li>
                  <li>• <strong>Transparency</strong> - See exactly what you're paying for</li>
                  <li>• <strong>Choice</strong> - Use any provider you prefer</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Supported Providers</h2>
            <div className="space-y-4">
              {providers.map((provider, i) => (
                <div key={i} className={`p-6 rounded-xl border ${provider.recommended ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-lg">{provider.name}</h3>
                        {provider.recommended && (
                          <span className="px-2 py-0.5 bg-orange-500/20 text-orange-500 rounded text-xs">Recommended</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm">{provider.description}</p>
                    </div>
                    <a
                      href={provider.signup}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-orange-500 hover:text-orange-400 text-sm"
                    >
                      <span>Get Key</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div><span className="text-gray-500">Credit:</span> <span className="text-green-400">{provider.freeCredit}</span></div>
                    <div><span className="text-gray-500">Models:</span> <span className="text-gray-300">{provider.models}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">How to Add Your API Key</h2>
            <ol className="space-y-4">
              <li className="flex items-start space-x-4">
                <span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-medium">Get an API key from your chosen provider</p>
                  <p className="text-gray-400 text-sm">Sign up and create an API key from their dashboard</p>
                </div>
              </li>
              <li className="flex items-start space-x-4">
                <span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-medium">Go to Settings → AI Providers</p>
                  <p className="text-gray-400 text-sm">Or click the button below</p>
                </div>
              </li>
              <li className="flex items-start space-x-4">
                <span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-medium">Paste your API key and save</p>
                  <p className="text-gray-400 text-sm">Your key is encrypted and stored securely</p>
                </div>
              </li>
            </ol>
          </section>

          <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
            <div className="flex items-start space-x-4">
              <Shield className="w-8 h-8 text-blue-500 flex-shrink-0" />
              <div>
                <h2 className="text-xl font-bold mb-2">Security</h2>
                <p className="text-gray-300">
                  Your API keys are encrypted using AES-256 before storage. We never log or access your keys. 
                  Keys are only decrypted when making requests to AI providers.
                </p>
              </div>
            </div>
          </section>

          <div className="flex space-x-4">
            <Link
              href="/settings/ai-providers"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
            >
              <Key className="w-5 h-5" />
              <span>Add API Key</span>
            </Link>
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center space-x-2 px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
            >
              <span>Getting Started</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
