/**
 * Onboarding - Welcome Screen
 * First step: Welcome new users
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { 
  Terminal,
  Sparkles,
  Check,
  ArrowRight,
  Zap,
  Shield,
  Code2,
  Globe
} from 'lucide-react';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';

export default function WelcomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already completed onboarding
    const checkOnboarding = async () => {
      try {
        const response = await fetch('/api/onboarding/save');
        if (response.ok) {
          const data = await response.json();
          if (data.onboardingCompleted) {
            router.push('/dashboard');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking onboarding:', error);
      }
      setLoading(false);
    };

    if (session && !isPending) {
      checkOnboarding();
    } else if (!session && !isPending) {
      router.push('/auth/signin');
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!loading && !isPending && session) {
      trackEvent(AnalyticsEvents.ONBOARDING_STARTED, { step: 'welcome', source: 'onboarding' });
      trackEvent(AnalyticsEvents.ONBOARDING_STEP_VIEWED, { step: 'welcome', source: 'onboarding' });
    }
  }, [loading, isPending, session]);

  if (loading || isPending) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: Zap,
      title: 'Access 50+ AI Models',
      description: 'Claude, GPT-4, Gemini, Llama, and more - all in one place',
    },
    {
      icon: Code2,
      title: 'Multiple Platforms',
      description: 'Web, CLI, VS Code extension, and API access',
    },
    {
      icon: Shield,
      title: 'Production Ready',
      description: 'Real, working code - not mock implementations',
    },
    {
      icon: Globe,
      title: 'Enterprise Features',
      description: 'Team collaboration, usage tracking, and analytics',
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Main Content */}
          <div className="text-center mb-16">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-pulse">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-orange-500 to-purple-600 text-transparent bg-clip-text">
              Welcome to Recoder!
            </h1>
            <p className="text-2xl text-gray-400 mb-4">
              Let's get you set up in just a few steps
            </p>
            <p className="text-lg text-gray-500">
              This takes only a couple of minutes. We&apos;ll help you connect your provider keys and reach a real first project fast.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl hover:border-orange-500/50 transition-all"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>

          {/* What to Expect */}
          <div className="p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl mb-12">
            <h3 className="text-xl font-bold mb-6">What to expect:</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold">1</span>
                </div>
                <div>
                  <div className="font-medium">Tell us about yourself</div>
                  <div className="text-sm text-gray-400">Your role and how you'll use Recoder</div>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold">2</span>
                </div>
                <div>
                  <div className="font-medium">Connect your provider</div>
                  <div className="text-sm text-gray-400">Add OpenRouter, OpenAI, Anthropic, or Google when you are ready</div>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium">Start building</div>
                  <div className="text-sm text-gray-400">Head into the dashboard and choose the surface that fits the job</div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <Link
              href="/dashboard"
              onClick={() => trackEvent(AnalyticsEvents.ONBOARDING_SKIPPED, { step: 'welcome', source: 'onboarding' })}
              className="px-6 py-3 border border-white/10 rounded-lg font-medium hover:bg-white/5 transition-all"
            >
              Skip for now
            </Link>
            <Link
              href="/onboarding/setup-profile"
              onClick={() => trackEvent(AnalyticsEvents.CTA_CLICKED, { ctaLabel: 'Get Started', destination: '/onboarding/setup-profile', location: 'onboarding_welcome', source: 'onboarding' })}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
