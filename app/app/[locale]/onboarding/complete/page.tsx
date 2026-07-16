/**
 * Onboarding - Complete
 * Final step: Success and personalized next steps based on user profile
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { SiteHeader } from '@/components/SiteHeader';
import Link from 'next/link';
import {
  Check,
  Sparkles,
  ExternalLink,
  BookOpen,
  Code2,
  Bot,
  Zap,
  ArrowRight,
  Star
} from 'lucide-react';

// ── Recommendation engine ──────────────────────────────────────────
// Maps the user's role + useCase from setup-profile into a primary
// recommended app and ordered secondary apps.

interface AppRecommendation {
  icon: typeof Bot;
  title: string;
  description: string;
  link: string;
  action: string;
  quickStart: string;
  quickStartLink: string;
  gradient: string;
  external: true;
}

const APP_CATALOG: Record<string, AppRecommendation> = {
  agents: {
    icon: Bot,
    title: 'Build AI Agents',
    description: 'Create and deploy intelligent AI agents that automate tasks, process data, and integrate with your tools',
    link: 'https://agents.recoder.xyz',
    action: 'Open Agents',
    quickStart: 'Create your first AI agent',
    quickStartLink: 'https://agents.recoder.xyz?new=agent',
    gradient: 'from-orange-500 to-amber-600',
    external: true,
  },
  web: {
    icon: Code2,
    title: 'Code in Web IDE',
    description: 'Write, run, and deploy code in a full cloud IDE with AI pair-programming built in',
    link: 'https://web.recoder.xyz',
    action: 'Open Web IDE',
    quickStart: 'Start a new project',
    quickStartLink: 'https://web.recoder.xyz?new=project',
    gradient: 'from-blue-500 to-cyan-600',
    external: true,
  },
  agency: {
    icon: Zap,
    title: 'Design Workflows',
    description: 'Build visual AI workflows with drag-and-drop nodes, triggers, and multi-agent orchestration',
    link: 'https://agency.recoder.xyz',
    action: 'Open Agency',
    quickStart: 'Build your first workflow',
    quickStartLink: 'https://agency.recoder.xyz/workspaces',
    gradient: 'from-purple-500 to-pink-600',
    external: true,
  },
  pm: {
    icon: BookOpen,
    title: 'Manage Products',
    description: 'Track user feedback, plan roadmaps, and manage releases with AI-assisted product management',
    link: 'https://pm.recoder.xyz',
    action: 'Open PM',
    quickStart: 'Set up your first roadmap',
    quickStartLink: 'https://pm.recoder.xyz',
    gradient: 'from-green-500 to-emerald-600',
    external: true,
  },
};

/** Return [primaryKey, ...secondaryKeys] based on profile. */
function getRecommendedOrder(
  useCase: string | undefined,
  role: string | undefined
): string[] {
  // Role-based overrides take precedence when they're a strong signal
  if (role === 'product') return ['pm', 'agents', 'agency', 'web'];
  if (role === 'designer') return ['agency', 'agents', 'web', 'pm'];

  // Use-case-based routing
  switch (useCase) {
    case 'web':
    case 'mobile':
    case 'api':
    case 'blockchain':
      return ['agents', 'web', 'agency', 'pm'];
    case 'automation':
    case 'ai':
    case 'data':
      return ['agents', 'agency', 'web', 'pm'];
    case 'other':
    default:
      // Generic fallback — lead with agents as the broadest surface
      return ['agents', 'web', 'agency', 'pm'];
  }
}

function getPersonalizedHeadline(
  useCase: string | undefined,
  role: string | undefined
): string {
  if (role === 'product') return 'Ready to ship great products';
  if (role === 'designer') return 'Ready to design intelligent workflows';

  switch (useCase) {
    case 'web':
    case 'mobile':
      return 'Ready to start building';
    case 'api':
      return 'Ready to ship your API';
    case 'automation':
      return 'Ready to automate everything';
    case 'ai':
    case 'data':
      return 'Ready to build with AI';
    case 'blockchain':
      return 'Ready for Web3 development';
    default:
      return 'Ready to create something great';
  }
}

// ── Component ──────────────────────────────────────────────────────

interface OnboardingProfile {
  role?: string;
  useCase?: string;
  company?: string;
  teamSize?: string;
  experience?: string;
}

export default function CompletePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<OnboardingProfile>({});

  const completeOnboarding = useCallback(async (profileFromStorage: OnboardingProfile) => {
    setSaving(true);
    try {
      const selectedPlan = sessionStorage.getItem('onboarding_plan');

      // Save to backend
      const response = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...profileFromStorage,
          plan: selectedPlan || 'free',
          onboardingCompleted: true,
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
  }, []);

  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    } else if (session && !isPending) {
      // Read profile from session storage BEFORE clearing it
      const profileData = sessionStorage.getItem('onboarding_profile');
      const parsed: OnboardingProfile = profileData ? JSON.parse(profileData) : {};

      // If sessionStorage was already cleared (e.g., page refresh after save),
      // attempt to fetch from the API
      if (!profileData) {
        fetch('/api/onboarding/save')
          .then((res) => res.json())
          .then((result) => {
            if (result?.data?.profile) {
              setProfile(result.data.profile);
            }
          })
          .catch(() => {
            // Silently fall back to generic recommendations
          })
          .finally(() => setLoading(false));
      } else {
        setProfile(parsed);
        setLoading(false);
      }

      // Save onboarding completion
      completeOnboarding(parsed);
    }
  }, [session, isPending, router, completeOnboarding]);

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

  const order = getRecommendedOrder(profile.useCase, profile.role);
  const primaryKey = order[0];
  const secondaryKeys = order.slice(1);
  const primaryApp = APP_CATALOG[primaryKey];
  const secondaryApps = secondaryKeys.map((k) => APP_CATALOG[k]);
  const headline = getPersonalizedHeadline(profile.useCase, profile.role);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar - Complete */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-1000"
          style={{ width: '100%' }}
        />
      </div>

      <SiteHeader />

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
              Welcome to Recoder, {session?.user?.name || 'Developer'}!
            </p>
            <p className="text-lg text-gray-500">
              {headline}
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
              <div className="text-4xl font-bold text-green-500 mb-2">&infin;</div>
              <div className="text-gray-400">Possibilities</div>
            </div>
          </div>

          {/* Recommended for You - Primary App */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-2 mb-6">
              <Star className="w-5 h-5 text-orange-500" />
              <h2 className="text-2xl font-bold text-center">Recommended for you</h2>
            </div>
            <div className="p-8 rounded-2xl border-2 border-orange-500/50 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl hover:border-orange-500 transition-all group relative overflow-hidden">
              {/* Subtle glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-purple-600/5 pointer-events-none" />
              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className={`w-16 h-16 bg-gradient-to-br ${primaryApp.gradient} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <primaryApp.icon className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-1">{primaryApp.title}</h3>
                      <p className="text-gray-400">{primaryApp.description}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href={primaryApp.quickStartLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center justify-center space-x-2 px-8 py-3 bg-gradient-to-r ${primaryApp.gradient} hover:opacity-90 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02]`}
                  >
                    <span>{primaryApp.quickStart}</span>
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                  <Link
                    href={primaryApp.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center space-x-2 px-6 py-3 border border-white/10 hover:bg-white/5 rounded-xl font-medium transition-all"
                  >
                    <span>{primaryApp.action}</span>
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Also explore - Secondary Apps */}
          <div className="mb-12">
            <h2 className="text-lg font-medium mb-4 text-gray-400 text-center">Also explore</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {secondaryApps.map((app) => {
                const Icon = app.icon;
                return (
                  <div
                    key={app.title}
                    className="p-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl hover:border-white/20 transition-all group"
                  >
                    <div className={`w-10 h-10 bg-gradient-to-br ${app.gradient} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">{app.title}</h3>
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">{app.description}</p>
                    <Link
                      href={app.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-sm text-orange-500 hover:text-orange-400 font-medium"
                    >
                      <span>{app.action}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
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
                href="/learn"
                className="px-6 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-all"
              >
                Learn More
              </Link>
              <Link
                href="/contact"
                className="px-6 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-all"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
