'use client';

import React from 'react';
import { useOnboarding } from '@/hooks/onboarding';
import { NewOnboardingPage } from './new-onboarding-page';

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { isOpen, completeOnboarding } = useOnboarding();

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
