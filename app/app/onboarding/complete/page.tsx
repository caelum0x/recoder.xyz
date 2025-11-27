/**
 * Onboarding - Complete
 * Final step: Success and next steps
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import Link from 'next/link';
import { 
  Terminal,
  Check,
  Sparkles,
  ExternalLink,
  BookOpen,
  Code2,
  MessageSquare,
  Zap
} from 'lucide-react';

export default function CompletePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    } else if (session && !isPending) {
      setLoading(false);
      // Save onboarding completion
      completeOnboarding();
    }
  }, [session, isPending, router]);

  const completeOnboarding = async () => {
    setSaving(true);
    try {
      // Get saved data from session storage
      const profileData = sessionStorage.getItem('onboarding_profile');
      const selectedPlan = sessionStorage.getItem('onboarding_plan');

      const profile = profileData ? JSON.parse(profileData) : {};

      // Save to backend
      const response = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...profile,
          plan: selectedPlan || 'free',
          platforms: ['web', 'cli'], // Default platforms
          completedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        // Clear session storage
        sessionStorage.removeItem('onboarding_profile');
        sessionStorage.removeItem('onboarding_plan');
      }
    } catch (error) {
      console.error('Error saving onboarding:', error);
    } finally {
      setSaving(false);
    }
  };

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

  const nextSteps = [
    {
      icon: Code2,
      title: 'Try the CLI',
      description: 'Install our powerful command-line tool',
      link: '/docs/cli',
      action: 'View CLI Docs',
    },
    {
      icon: BookOpen,
      title: 'Read Documentation',
      description: 'Learn how to get the most out of Recoder',
      link: '/docs',
      action: 'Browse Docs',
    },
    {
      icon: Zap,
      title: 'Create Your First Project',
      description: 'Start building with AI assistance',
      link: '/dashboard/projects',
      action: 'Go to Projects',
    },
    {
      icon: MessageSquare,
      title: 'Join Community',
      description: 'Connect with other developers',
      link: 'https://discord.gg/recoder',
      action: 'Join Discord',
      external: true,
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar - Complete */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-1000"
          style={{ width: '100%' }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 w-full z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="text-sm text-green-500 flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>Setup Complete</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24 mt-16">
        <div className="max-w-4xl mx-auto">
          {/* Success Animation */}
          <div className="text-center mb-16">
            <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
              <Check className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-500 to-emerald-600 text-transparent bg-clip-text">
              You're all set!
            </h1>
            <p className="text-2xl text-gray-400 mb-2">
              Welcome to Recoder, {session?.user?.name || 'Developer'}! 🎉
            </p>
            <p className="text-lg text-gray-500">
              Your account is configured and ready to use
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-center">
              <div className="text-4xl font-bold text-orange-500 mb-2">50+</div>
              <div className="text-gray-400">AI Models</div>
            </div>
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-center">
              <div className="text-4xl font-bold text-purple-500 mb-2">4</div>
              <div className="text-gray-400">Platforms</div>
            </div>
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-center">
              <div className="text-4xl font-bold text-green-500 mb-2">∞</div>
              <div className="text-gray-400">Possibilities</div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-center">What's next?</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {nextSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.title}
                    className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl hover:border-orange-500/50 transition-all group"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                    <p className="text-gray-400 mb-4">{step.description}</p>
                    <Link
                      href={step.link}
                      target={step.external ? '_blank' : undefined}
                      rel={step.external ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center space-x-2 text-orange-500 hover:text-orange-400 font-medium"
                    >
                      <span>{step.action}</span>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center space-x-2 px-12 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl font-bold text-lg transition-all transform hover:scale-105"
            >
              <span>Go to Dashboard</span>
              <Sparkles className="w-5 h-5" />
            </Link>
          </div>

          {/* Need Help? */}
          <div className="mt-12 p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-center">
            <h3 className="font-bold mb-2">Need help getting started?</h3>
            <p className="text-gray-400 mb-4">
              Check out our documentation or reach out to our support team
            </p>
            <div className="flex justify-center space-x-4">
              <Link
                href="/docs"
                className="px-6 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-all"
              >
                Documentation
              </Link>
              <Link
                href="/support"
                className="px-6 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-all"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
