'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { 
  Terminal, 
  Zap, 
  CheckCircle, 
  ArrowRight,
  Sparkles,
  Code2,
  Brain,
  Rocket
} from 'lucide-react';

type OnboardingStep = 'welcome' | 'preferences' | 'api-key' | 'complete';

interface UserPreferences {
  primaryUseCase: string;
  experienceLevel: string;
  preferredModels: string[];
  wantsCliSetup: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    primaryUseCase: '',
    experienceLevel: '',
    preferredModels: [],
    wantsCliSetup: false
  });

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth/signin?return=/onboarding');
    }
  }, [session, isPending, router]);

  const handleComplete = async () => {
    setLoading(true);
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preferences,
          onboardingCompleted: true
        })
      });

      router.push('/dashboard?welcome=true');
    } catch (error) {
      console.error('Onboarding save error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed top-0 left-0 right-0 h-1 bg-white/10 z-50">
        <div 
          className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500"
          style={{
            width: step === 'welcome' ? '25%' : 
                   step === 'preferences' ? '50%' : 
                   step === 'api-key' ? '75%' : '100%'
          }}
        />
      </div>

      <div className="container mx-auto px-6 py-16">
        <div className="max-w-3xl mx-auto">
          {step === 'welcome' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center space-x-2 px-6 py-3 rounded-full border-2 border-green-500/30 bg-green-500/10 mb-4">
                  <Sparkles className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-bold text-green-400">🎉 FREE BETA - No Credit Card Required</span>
                </div>
                <h1 className="text-5xl font-bold">
                  Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">Recoder.xyz</span>
                </h1>
                <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                  The only platform combining <span className="text-orange-500 font-semibold">Web IDE + Terminal CLI</span> with seamless sync
                </p>
                <p className="text-lg text-gray-500">
                  <span className="text-white font-semibold">100% Free</span> - Just bring your API key
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mt-12">
                {[
                  { icon: Code2, title: 'Web IDE', desc: 'Code in your browser with AI assistance' },
                  { icon: Terminal, title: 'Terminal CLI', desc: 'Full local file system access' },
                  { icon: Zap, title: '40+ AI Models', desc: 'GPT-4, Claude, Gemini, and more' }
                ].map((item, i) => (
                  <div key={i} className="p-6 rounded-2xl border border-white/10 bg-white/5">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                      <item.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-400">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="p-6 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-2xl mx-auto">
                <h3 className="font-semibold text-white mb-2">How it works:</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-500">1.</span>
                    <span>Start projects in Web IDE (browser-based)</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-500">2.</span>
                    <span>Download to your local machine with CLI</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-500">3.</span>
                    <span>Edit locally with your favorite editor</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-500">4.</span>
                    <span>Sync changes back seamlessly</span>
                  </li>
                </ul>
              </div>

              <div className="flex justify-center mt-12">
                <button
                  onClick={() => setStep('preferences')}
                  className="px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium transition-all flex items-center space-x-2 text-lg hover:from-orange-600 hover:to-purple-700"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === 'preferences' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold">Tell us about yourself</h2>
                <p className="text-xl text-gray-400">This helps us personalize your experience</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-lg font-medium">What will you primarily use Recoder for?</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { value: 'web-dev', label: 'Web Development', icon: Code2 },
                      { value: 'mobile', label: 'Mobile Apps', icon: Terminal },
                      { value: 'backend', label: 'Backend/APIs', icon: Zap },
                      { value: 'fullstack', label: 'Full-Stack Projects', icon: Rocket }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPreferences({ ...preferences, primaryUseCase: option.value })}
                        className={`p-4 rounded-xl border transition-all flex items-center space-x-3 ${
                          preferences.primaryUseCase === option.value
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                        }`}
                      >
                        <option.icon className="w-6 h-6" />
                        <span className="font-medium">{option.label}</span>
                        {preferences.primaryUseCase === option.value && (
                          <CheckCircle className="w-5 h-5 text-orange-500 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-lg font-medium">What's your experience level?</label>
                  <div className="grid md:grid-cols-3 gap-4">
                    {[
                      { value: 'beginner', label: 'Beginner', desc: 'New to coding' },
                      { value: 'intermediate', label: 'Intermediate', desc: '1-3 years' },
                      { value: 'expert', label: 'Expert', desc: '3+ years' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPreferences({ ...preferences, experienceLevel: option.value })}
                        className={`p-4 rounded-xl border transition-all ${
                          preferences.experienceLevel === option.value
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                        }`}
                      >
                        <div className="font-medium mb-1">{option.label}</div>
                        <div className="text-sm text-gray-400">{option.desc}</div>
                        {preferences.experienceLevel === option.value && (
                          <CheckCircle className="w-5 h-5 text-orange-500 mt-2" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-lg font-medium">Which AI models interest you?</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { value: 'claude', label: 'Claude 3.5', desc: 'Best for reasoning' },
                      { value: 'gpt4', label: 'GPT-4 Turbo', desc: 'OpenAI flagship' },
                      { value: 'gemini', label: 'Gemini Pro', desc: 'Google multimodal' },
                      { value: 'groq', label: 'Groq LLaMA', desc: 'Ultra-fast' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          const isSelected = preferences.preferredModels.includes(option.value);
                          setPreferences({
                            ...preferences,
                            preferredModels: isSelected
                              ? preferences.preferredModels.filter(m => m !== option.value)
                              : [...preferences.preferredModels, option.value]
                          });
                        }}
                        className={`p-4 rounded-xl border transition-all text-left ${
                          preferences.preferredModels.includes(option.value)
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium mb-1">{option.label}</div>
                            <div className="text-sm text-gray-400">{option.desc}</div>
                          </div>
                          {preferences.preferredModels.includes(option.value) && (
                            <CheckCircle className="w-5 h-5 text-orange-500" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-lg font-medium">CLI Setup?</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setPreferences({ ...preferences, wantsCliSetup: true })}
                      className={`p-6 rounded-xl border transition-all ${
                        preferences.wantsCliSetup ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Terminal className="w-8 h-8 text-orange-500" />
                        {preferences.wantsCliSetup && <CheckCircle className="w-5 h-5 text-orange-500" />}
                      </div>
                      <div className="font-medium mb-2">Yes, I'll use CLI</div>
                      <div className="text-sm text-gray-400">Setup instructions next</div>
                    </button>
                    <button
                      onClick={() => setPreferences({ ...preferences, wantsCliSetup: false })}
                      className={`p-6 rounded-xl border transition-all ${
                        !preferences.wantsCliSetup && preferences.primaryUseCase
                          ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Code2 className="w-8 h-8 text-purple-500" />
                        {!preferences.wantsCliSetup && preferences.primaryUseCase && <CheckCircle className="w-5 h-5 text-orange-500" />}
                      </div>
                      <div className="font-medium mb-2">Web only</div>
                      <div className="text-sm text-gray-400">Use web platform</div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-12 pt-8 border-t border-white/10">
                <button onClick={() => setStep('welcome')} className="px-6 py-3 border border-white/10 hover:border-white/20 rounded-lg">Back</button>
                <button
                  onClick={() => setStep('api-key')}
                  disabled={!preferences.primaryUseCase || !preferences.experienceLevel}
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-purple-700"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === 'api-key' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center space-x-2 px-6 py-3 rounded-full border-2 border-green-500/30 bg-green-500/10 mb-4">
                  <Sparkles className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-bold text-green-400">100% FREE - Just bring your API key</span>
                </div>
                <h2 className="text-4xl font-bold">Add Your API Key</h2>
                <p className="text-xl text-gray-400">Choose an AI provider to get started</p>
              </div>

              <div className="space-y-4 max-w-2xl mx-auto">
                {/* OpenRouter */}
                <div className="p-6 rounded-xl border border-green-500/30 bg-green-500/5 hover:border-green-500/50 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">📦</span>
                        <h3 className="text-xl font-bold">OpenRouter</h3>
                        <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">Recommended</span>
                      </div>
                      <p className="text-sm text-gray-400 mb-3">
                        Access 40+ AI models with one key
                      </p>
                      <ul className="space-y-1 text-sm text-gray-300">
                        <li>✓ GPT-4, Claude 3.5, Gemini, and more</li>
                        <li>✓ Pay only $0.01 per chat</li>
                        <li>✓ $5 credit = 500+ requests</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-medium text-center transition-all inline-flex items-center justify-center space-x-2"
                    >
                      <span>Get OpenRouter Key</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => router.push('/settings/ai-providers')}
                      className="px-4 py-2 border border-white/20 hover:border-white/40 rounded-lg transition-all"
                    >
                      Add Key
                    </button>
                  </div>
                </div>

                {/* Anthropic */}
                <div className="p-6 rounded-xl border border-white/10 bg-white/5 hover:border-white/20 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">🤖</span>
                        <h3 className="text-xl font-bold">Anthropic</h3>
                      </div>
                      <p className="text-sm text-gray-400 mb-3">
                        Direct access to Claude models
                      </p>
                      <ul className="space-y-1 text-sm text-gray-300">
                        <li>✓ Claude 3.5 Sonnet</li>
                        <li>✓ Best for coding tasks</li>
                        <li>✓ $5 free credit on signup</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-2 border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg font-medium text-center transition-all inline-flex items-center justify-center space-x-2"
                    >
                      <span>Get Anthropic Key</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => router.push('/settings/ai-providers')}
                      className="px-4 py-2 border border-white/20 hover:border-white/40 rounded-lg transition-all"
                    >
                      Add Key
                    </button>
                  </div>
                </div>

                {/* OpenAI */}
                <div className="p-6 rounded-xl border border-white/10 bg-white/5 hover:border-white/20 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">🔷</span>
                        <h3 className="text-xl font-bold">OpenAI</h3>
                      </div>
                      <p className="text-sm text-gray-400 mb-3">
                        Direct access to GPT models
                      </p>
                      <ul className="space-y-1 text-sm text-gray-300">
                        <li>✓ GPT-4 & GPT-4 Turbo</li>
                        <li>✓ Most popular choice</li>
                        <li>✓ $5 free credit on signup</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-2 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg font-medium text-center transition-all inline-flex items-center justify-center space-x-2"
                    >
                      <span>Get OpenAI Key</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => router.push('/settings/ai-providers')}
                      className="px-4 py-2 border border-white/20 hover:border-white/40 rounded-lg transition-all"
                    >
                      Add Key
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-2xl mx-auto">
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-white">Your keys are secure.</span> We encrypt them with AES-256-GCM before storage. We never see your usage or conversations.
                </p>
              </div>

              <div className="flex items-center justify-between mt-12 pt-8 border-t border-white/10">
                <button onClick={() => setStep('preferences')} className="px-6 py-3 border border-white/10 hover:border-white/20 rounded-lg">Back</button>
                <button
                  onClick={() => setStep('complete')}
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium flex items-center space-x-2 hover:from-orange-600 hover:to-purple-700"
                >
                  <span>Skip for now</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-8 animate-fadeIn text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-4">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-bold">You're All Set! 🎉</h2>
                <p className="text-xl text-gray-400">
                  {preferences.wantsCliSetup ? 'Let\'s set up the CLI' : 'Start building with AI'}
                </p>
              </div>

              {preferences.wantsCliSetup && (
                <div className="p-8 rounded-2xl border border-white/10 bg-white/5 text-left max-w-2xl mx-auto">
                  <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
                    <Terminal className="w-6 h-6 text-orange-500" />
                    <span>CLI Setup</span>
                  </h3>
                  <div className="space-y-4">
                    {[
                      { step: '1. Install', cmd: 'npm install -g recoder-cli' },
                      { step: '2. Authenticate', cmd: 'recoder auth login' },
                      { step: '3. Create', cmd: 'recoder "build a React dashboard"' }
                    ].map((item, i) => (
                      <div key={i}>
                        <p className="text-sm text-gray-400 mb-2">{item.step}</p>
                        <div className="p-3 bg-black/50 rounded-lg font-mono text-sm text-green-400">{item.cmd}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleComplete}
                disabled={loading}
                className="px-12 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium text-lg inline-flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Finishing...</span>
                  </>
                ) : (
                  <>
                    <span>Go to Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
