import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useAuthContext } from '../contexts/AuthContext';

export default function AppNavigator({ children }: { children: React.ReactNode }) {
  const { isOnboardingCompleted, loading: onboardingLoading } = useOnboarding();
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const segments = useSegments();

  useEffect(() => {
    if (onboardingLoading || authLoading) {
      return;
    }

    const currentRoute = segments.join('/');
    const inOnboarding = currentRoute.includes('onboarding');
    const inAuth = currentRoute.includes('auth');
    const inTabs = currentRoute.includes('(tabs)');

    // If onboarding is not completed, redirect to onboarding
    if (!isOnboardingCompleted && !inOnboarding) {
      router.replace('/onboarding' as any);
      return;
    }

    // If onboarding is completed
    if (isOnboardingCompleted) {
      // If user is on onboarding screen but it's already completed
      if (inOnboarding) {
        if (isAuthenticated) {
          router.replace('/(tabs)' as any);
        } else {
          router.replace('/auth/login' as any);
        }
        return;
      }

      // If user is not authenticated and not in auth flow
      if (!isAuthenticated && !inAuth) {
        router.replace('/auth/login' as any);
        return;
      }

      // If user is authenticated but in auth flow
      if (isAuthenticated && inAuth) {
        router.replace('/(tabs)' as any);
        return;
      }
    }
  }, [isOnboardingCompleted, isAuthenticated, onboardingLoading, authLoading, segments]);

  // Show loading screen while determining navigation
  if (onboardingLoading || authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
});