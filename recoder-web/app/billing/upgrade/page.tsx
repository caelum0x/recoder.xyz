/**
 * Upgrade Page - CLI Integration
 * Handles upgrade flows specifically from CLI quota exceeded scenarios
 * Provides contextual upgrade experience with CLI-specific messaging
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import UpgradeFlow from '@/components/billing/UpgradeFlow';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Upgrade Your Plan - Recoder CLI',
  description: 'Upgrade your Recoder plan to continue using premium AI features',
};

interface UpgradePageProps {
  searchParams: Promise<{
    source?: 'cli' | 'web' | 'router' | 'extension';
    user_id?: string;
    current_plan?: string;
    reason?: 'quota_exceeded' | 'feature_limited' | 'model_restricted' | 'manual_upgrade';
    usage?: string;
    limit?: string;
    recommended?: 'pro' | 'team' | 'enterprise';
    blocked_feature?: string;
    return_to?: string;
    focus?: 'quota' | 'features' | 'ai_models';
  }>;
}

function UpgradePageContent({ searchParams }: { searchParams: {
  source?: 'cli' | 'web' | 'router' | 'extension';
  user_id?: string;
  current_plan?: string;
  reason?: 'quota_exceeded' | 'feature_limited' | 'model_restricted' | 'manual_upgrade';
  usage?: string;
  limit?: string;
  recommended?: 'pro' | 'team' | 'enterprise';
  blocked_feature?: string;
  return_to?: string;
  focus?: 'quota' | 'features' | 'ai_models';
} }) {
  const {
    source = 'web',
    current_plan = 'free',
    reason = 'manual_upgrade',
    usage,
    limit,
    recommended = 'pro',
    blocked_feature,
    return_to,
    focus
  } = searchParams;

  // Generate contextual messaging based on CLI context
  const getUpgradeContext = () => {
    switch (reason) {
      case 'quota_exceeded':
        return {
          title: 'Monthly Quota Exceeded',
          description: `You've used ${usage}/${limit} requests this month. Upgrade to continue using the CLI with higher quotas.`,
          urgency: 'high' as const,
          primaryCTA: 'Upgrade to Continue'
        };
      
      case 'feature_limited':
        return {
          title: `${blocked_feature} Requires Premium`,
          description: `This advanced feature is available with paid plans. Upgrade to unlock ${blocked_feature} and other premium capabilities.`,
          urgency: 'medium' as const,
          primaryCTA: 'Unlock Premium Features'
        };
      
      case 'model_restricted':
        return {
          title: 'Premium AI Models Required',
          description: 'Access GPT-4o, Claude Sonnet, and other advanced models with a premium subscription.',
          urgency: 'medium' as const,
          primaryCTA: 'Access Premium Models'
        };
      
      default:
        return {
          title: 'Upgrade Your Plan',
          description: 'Unlock more powerful AI capabilities and higher usage limits.',
          urgency: 'low' as const,
          primaryCTA: 'Choose Your Plan'
        };
    }
  };

  const context = getUpgradeContext();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* CLI Context Header */}
      {source === 'cli' && (
        <div className="bg-blue-600 text-white">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold">Connected from Recoder CLI</h1>
                <p className="text-blue-100">Complete your upgrade to continue using premium features</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium mb-4 ${
            context.urgency === 'high' ? 'bg-red-100 text-red-800' :
            context.urgency === 'medium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {context.urgency === 'high' && '🚨 Action Required'}
            {context.urgency === 'medium' && '⚡ Upgrade Recommended'}
            {context.urgency === 'low' && '🚀 Enhance Your Experience'}
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {context.title}
          </h1>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {context.description}
          </p>
        </div>

        <Suspense fallback={<LoadingSpinner />}>
          <UpgradeFlow 
            userId={searchParams.user_id || ''}
            currentPlan={current_plan}
            recommendedPlan={recommended}
            source={source}
            context={context}
            returnTo={return_to}
            focus={focus}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default async function UpgradePage({ searchParams }: UpgradePageProps) {
  const session = await getServerSession(authOptions);
  const resolvedSearchParams = await searchParams;
  
  // If no session and no user_id from CLI, redirect to login
  if (!session && !resolvedSearchParams.user_id) {
    const returnUrl = `/billing/upgrade?${new URLSearchParams(resolvedSearchParams as any).toString()}`;
    redirect(`/auth/login?return_to=${encodeURIComponent(returnUrl)}`);
  }

  // Use session user ID or CLI-provided user ID
  const userId = session?.user?.id || resolvedSearchParams.user_id;
  
  if (!userId) {
    redirect('/auth/login?return_to=/billing/upgrade');
  }

  return (
    <UpgradePageContent 
      searchParams={{ 
        ...resolvedSearchParams, 
        user_id: userId 
      }} 
    />
  );
}