import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthContext } from '@/contexts/AuthContext';
import { parseOnboardingCompletedFlag } from '@/api/contracts';
import { API_URL, getAuthHeaders } from '@/api/config';
import { log } from '@/lib/logger';

const ONBOARDING_KEY_PREFIX = '@onboarding_completed_';

/**
 * Custom hook to manage onboarding state
 * 
 * Tracks whether user has completed onboarding ACROSS ALL DEVICES
 * Uses backend auth metadata as source of truth, with AsyncStorage as cache
 * 
 * Flow:
 * 1. On first registration → user completes onboarding → saves to backend metadata AND AsyncStorage
 * 2. On login from ANY device → checks backend metadata → shows/skips onboarding accordingly
 * 3. AsyncStorage used as cache for faster checks, but backend metadata is the source of truth
 * 
 * @example
 * const { hasCompletedOnboarding, isLoading, markAsCompleted } = useOnboarding();
 */
export function useOnboarding() {
  const { session, isLoading: authLoading } = useAuthContext();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOnboardingMetadata = useCallback(async (): Promise<boolean | null> => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/auth/metadata`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return null;
      }

      return parseOnboardingCompletedFlag(await response.json().catch(() => null));
    } catch (error) {
      log.warn('Failed to fetch onboarding metadata from backend:', error);
      return null;
    }
  }, []);

  const updateOnboardingMetadata = useCallback(async (completed: boolean): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/auth/update-metadata`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ onboarding_completed: completed }),
      });
      return response.ok;
    } catch (error) {
      log.warn('Failed to update onboarding metadata in backend:', error);
      return false;
    }
  }, []);

  // Generate user-specific AsyncStorage key (for cache)
  const getOnboardingKey = useCallback(() => {
    const userId = session?.user?.id || 'anonymous';
    return `${ONBOARDING_KEY_PREFIX}${userId}`;
  }, [session?.user?.id]);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      // First check backend metadata (source of truth)
      const completedInMetadata = await fetchOnboardingMetadata();
      
      if (completedInMetadata) {
        log.log('✅ Onboarding completed (from backend metadata)');
        setHasCompletedOnboarding(true);
        
        // Update AsyncStorage cache for faster future checks
        const key = getOnboardingKey();
        await AsyncStorage.setItem(key, 'true');
      } else {
        // Fallback: check AsyncStorage (for backwards compatibility with existing users)
        const key = getOnboardingKey();
        const completedInStorage = await AsyncStorage.getItem(key);
        
        if (completedInStorage === 'true') {
          log.log('✅ Onboarding completed (from AsyncStorage cache, migrating to backend metadata...)');
          setHasCompletedOnboarding(true);
          
          // Migrate to backend metadata so it works on other devices
          await updateOnboardingMetadata(true);
        } else {
          log.log('📋 Onboarding not completed yet');
          setHasCompletedOnboarding(false);
        }
      }
    } catch (error) {
      log.error('Failed to check onboarding status:', error);
      // Default to not completed if we can't read the value
      setHasCompletedOnboarding(false);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOnboardingMetadata, getOnboardingKey, updateOnboardingMetadata]);

  // Check onboarding status ONLY after auth is loaded and when user changes
  useEffect(() => {
    // Wait for auth to complete first
    if (authLoading || !session) {
      if (!authLoading && !session) {
        setIsLoading(false);
      }
      return;
    }
    
    checkOnboardingStatus();
  }, [checkOnboardingStatus, authLoading, session]);

  const markAsCompleted = useCallback(async () => {
    try {
      log.log('✅ Marking onboarding as completed...');
      
      // Save to backend metadata (source of truth - works across devices)
      const metadataUpdated = await updateOnboardingMetadata(true);
      if (!metadataUpdated) {
        throw new Error('Failed to save onboarding status to backend metadata');
      }
      
      // Also save to AsyncStorage (cache for faster checks)
      const key = getOnboardingKey();
      await AsyncStorage.setItem(key, 'true');
      
      setHasCompletedOnboarding(true);
      log.log('✅ Onboarding status saved successfully');
      return true;
    } catch (error) {
      log.error('Failed to save onboarding status:', error);
      return false;
    }
  }, [getOnboardingKey]);

  const resetOnboarding = useCallback(async () => {
    try {
      log.log('🔄 Resetting onboarding status...');
      
      // Remove from backend metadata
      const metadataUpdated = await updateOnboardingMetadata(false);
      if (!metadataUpdated) {
        throw new Error('Failed to reset onboarding status in backend metadata');
      }
      
      // Remove from AsyncStorage cache
      const key = getOnboardingKey();
      await AsyncStorage.removeItem(key);
      
      setHasCompletedOnboarding(false);
      log.log('✅ Onboarding status reset successfully');
      return true;
    } catch (error) {
      log.error('Failed to reset onboarding:', error);
      return false;
    }
  }, [getOnboardingKey, updateOnboardingMetadata]);

  return {
    hasCompletedOnboarding,
    isLoading,
    markAsCompleted,
    resetOnboarding,
  };
}
