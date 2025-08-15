import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingContextType {
  isOnboardingCompleted: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  loading: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem('onboarding_completed');
      setIsOnboardingCompleted(completed === 'true');
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setIsOnboardingCompleted(false);
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('onboarding_completed', 'true');
      setIsOnboardingCompleted(true);
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  };

  const resetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem('onboarding_completed');
      setIsOnboardingCompleted(false);
    } catch (error) {
      console.error('Error resetting onboarding:', error);
    }
  };

  const value: OnboardingContextType = {
    isOnboardingCompleted,
    completeOnboarding,
    resetOnboarding,
    loading,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}