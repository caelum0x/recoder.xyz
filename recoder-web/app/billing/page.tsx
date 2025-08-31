/**
 * Billing Page - Main Entry Point
 * Handles billing dashboard with CLI integration
 * Routes users from CLI authentication and upgrade flows
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import BillingDashboard from '@/components/billing/BillingDashboard';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Billing & Usage - Recoder',
  description: 'Manage your Recoder subscription, monitor usage, and upgrade your plan',
};

interface BillingPageProps {
  searchParams: Promise<{
    source?: string;
    user_id?: string;
    reason?: string;
    recommended?: string;
    usage?: string;
    limit?: string;
    upgraded?: string;
    return_to?: string;
  }>;
}

function BillingPageContent({ searchParams }: { searchParams: {
  source?: string;
  user_id?: string;
  reason?: string;
  recommended?: string;
  usage?: string;
  limit?: string;
  upgraded?: string;
  return_to?: string;
} }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Success message for completed upgrades */}
      {searchParams.upgraded === 'true' && (
        <div className="bg-green-50 border-b border-green-200">
          <div className="max-w-7xl mx-auto py-3 px-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">
                  Subscription upgraded successfully! 🎉
                </p>
                <p className="text-sm text-green-600">
                  {searchParams.return_to === 'cli_success' && 'You can now return to the CLI and continue with your enhanced quota.'}
                  {searchParams.return_to === 'cli_upgraded' && 'Your CLI session has been upgraded. Premium features are now available.'}
                  {!searchParams.return_to && 'Your new plan is now active across all platforms.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={<LoadingSpinner />}>
        <BillingDashboard 
          userId={searchParams.user_id || ''} 
          source={searchParams.source as any || 'web'} 
        />
      </Suspense>
    </div>
  );
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  
  // If no session and no user_id from CLI, redirect to login
  if (!session && !resolvedSearchParams.user_id) {
    redirect('/auth/login?return_to=/billing');
  }

  // Use session user ID or CLI-provided user ID
  const userId = session?.user?.id || resolvedSearchParams.user_id;
  
  if (!userId) {
    redirect('/auth/login?return_to=/billing');
  }

  return (
    <BillingPageContent 
      searchParams={{ 
        ...resolvedSearchParams, 
        user_id: userId 
      }} 
    />
  );
}