'use client';

import React, { useEffect, useRef } from 'react';
import { useOnboarding } from '@/hooks/onboarding';
import { useAuth } from '@/components/AuthProvider';
import { NewOnboardingPage } from './new-onboarding-page';
import { onboardingSteps } from './onboarding-config';

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { isOpen, hasCompletedOnboarding, startOnboarding, completeOnboarding } = useOnboarding();
  const { user, isLoading } = useAuth();
  const hasTriggered = useRef(false);

  // Auto-trigger onboarding for new users who haven't completed it
  useEffect(() => {
    if (isLoading || !user) return;
    if (hasCompletedOnboarding) return;
    if (hasTriggered.current) return;

    hasTriggered.current = true;
    startOnboarding(onboardingSteps);
  }, [user, isLoading, hasCompletedOnboarding, startOnboarding]);

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    completeOnboarding();
  };

  // Handle onboarding dismissal (also marks as complete so it doesn't reappear)
  const handleOnboardingClose = () => {
    completeOnboarding();
  };

  return (
    <>
      {children}
      {isOpen && (
        <NewOnboardingPage
          onComplete={handleOnboardingComplete}
          onClose={handleOnboardingClose}
        />
      )}
    </>
  );
}
