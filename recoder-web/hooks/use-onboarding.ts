"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";

interface OnboardingState {
  isCompleted: boolean;
  showWelcomeWizard: boolean;
  currentStep: number;
}

export function useOnboarding() {
  const { user, loading } = useAuth();
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    isCompleted: false,
    showWelcomeWizard: false,
    currentStep: 0
  });

  useEffect(() => {
    if (user && !loading) {
      checkOnboardingStatus();
    }
  }, [user, loading]);

  const checkOnboardingStatus = () => {
    // Check if onboarding is completed (stored in localStorage for now)
    const completed = localStorage.getItem(`onboarding_completed_${user?.id}`);
    const isCompleted = completed === 'true';

    // Show welcome wizard for new users who haven't completed onboarding
    const shouldShowWelcome = !isCompleted && !loading;

    setOnboardingState({
      isCompleted,
      showWelcomeWizard: shouldShowWelcome,
      currentStep: 0
    });
  };

  const markOnboardingCompleted = () => {
    if (user?.id) {
      localStorage.setItem(`onboarding_completed_${user.id}`, 'true');
      setOnboardingState(prev => ({
        ...prev,
        isCompleted: true,
        showWelcomeWizard: false
      }));
    }
  };

  const showWelcomeWizardModal = () => {
    setOnboardingState(prev => ({
      ...prev,
      showWelcomeWizard: true
    }));
  };

  const hideWelcomeWizardModal = () => {
    setOnboardingState(prev => ({
      ...prev,
      showWelcomeWizard: false
    }));
  };

  const resetOnboarding = () => {
    if (user?.id) {
      localStorage.removeItem(`onboarding_completed_${user.id}`);
      setOnboardingState({
        isCompleted: false,
        showWelcomeWizard: true,
        currentStep: 0
      });
    }
  };

  return {
    ...onboardingState,
    markOnboardingCompleted,
    openWelcomeWizard: showWelcomeWizardModal,
    closeWelcomeWizard: hideWelcomeWizardModal,
    resetOnboarding,
    checkOnboardingStatus
  };
}
