import { useState, useEffect, useCallback, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { initializeRevenueCat, shouldUseRevenueCat } from '@/lib/billing';
import { getSessionAccessToken } from '@/lib/auth/session-token';
import { authProviderClient } from '@/lib/auth/provider-client';

let useTracking: (() => { canTrack: boolean; isLoading: boolean }) | null = null;
try {
  const TrackingModule = require('@/contexts/TrackingContext');
  useTracking = TrackingModule.useTracking;
} catch (e) {
  log.warn('⚠️ TrackingContext not available');
}
import type {
  AuthChangeEvent,
  AuthSession,
  AuthState,
  SignInCredentials,
  SignUpCredentials,
  OAuthProvider,
  PasswordResetRequest,
  AuthError,
  AuthActionResult,
} from '@/lib/utils/auth-types';
import { log, setLoggerUserId } from '@/lib/logger';

// Complete any pending auth sessions (required for web)
WebBrowser.maybeCompleteAuthSession();

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

function hasErrorMessage(err: unknown, substring: string): boolean {
  return getErrorMessage(err).includes(substring);
}

export function useAuth() {
  const queryClient = useQueryClient();
  const trackingState = useTracking ? useTracking() : { canTrack: false, isLoading: false };
  const { canTrack, isLoading: trackingLoading } = trackingState;
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const [error, setError] = useState<AuthError | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initializedUserIdRef = useRef<string | null>(null);
  const initializedCanTrackRef = useRef<boolean | null>(null);
  const oauthSessionActiveRef = useRef<boolean>(false);

  // Handle auth state changes and canTrack changes
  useEffect(() => {
    const { data: { subscription } } = authProviderClient.onAuthStateChange(
      async (_event: AuthChangeEvent, session: AuthSession | null) => {
        // Update logger with user ID
        setLoggerUserId(session?.user?.id || null);

        // Only log significant auth events, not every state change
        if (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT' || _event === 'TOKEN_REFRESHED') {
          log.log('🔄 Auth state changed:', _event);
        }
        
        setAuthState({
          user: session?.user ?? null,
          session,
          isLoading: false,
          isAuthenticated: !!session,
        });

        if (
          session?.user &&
          shouldUseRevenueCat() &&
          (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION')
        ) {
          // Only initialize if user changed or canTrack changed from false to true
          const shouldInitialize = 
            initializedUserIdRef.current !== session.user.id ||
            (canTrack && initializedCanTrackRef.current !== canTrack);

          if (shouldInitialize) {
          try {
            await initializeRevenueCat(session.user.id, session.user.email, canTrack);
              initializedUserIdRef.current = session.user.id;
              initializedCanTrackRef.current = canTrack;
          } catch (error) {
            log.warn('⚠️ Failed to initialize RevenueCat:', error);
          }
          }
        } else if (_event === 'SIGNED_OUT') {
          initializedUserIdRef.current = null;
          initializedCanTrackRef.current = null;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [canTrack]); // Only depend on canTrack, not trackingLoading

  // Handle canTrack changes for already-initialized RevenueCat
  useEffect(() => {
    if (!authState.user || !shouldUseRevenueCat() || !canTrack) {
      return;
    }

    // If RevenueCat was initialized with canTrack=false but now it's true, update it
    if (initializedUserIdRef.current === authState.user.id && initializedCanTrackRef.current !== canTrack) {
      initializeRevenueCat(authState.user.id, authState.user.email, canTrack)
        .then(() => {
          initializedCanTrackRef.current = canTrack;
        })
        .catch((error) => {
          log.warn('⚠️ Failed to update RevenueCat tracking:', error);
        });
    }
  }, [canTrack, authState.user]); // Update when canTrack or user changes

  const signIn = useCallback(async ({ email, password }: SignInCredentials): Promise<AuthActionResult> => {
    try {
      log.log('🎯 Sign in attempt:', email);
      setError(null);
      setAuthState((prev) => ({ ...prev, isLoading: true }));

      const { data, error: signInError } = await authProviderClient.signInWithPassword(email, password);

      if (signInError) {
        log.error('❌ Sign in error:', signInError.message);
        setError({ message: signInError.message, status: signInError.status });
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error: signInError };
      }

      log.log('✅ Sign in successful:', data.user?.email);
      
      // Immediately invalidate React Query cache to fetch fresh account state
      log.log('🔄 Invalidating cache to fetch fresh account state');
      queryClient.invalidateQueries({ queryKey: ['account-state'] });
      
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return { success: true, data };
    } catch (err: unknown) {
      log.error('❌ Sign in exception:', err);
      const error = { message: getErrorMessage(err) || 'An unexpected error occurred' };
      setError(error);
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return { success: false, error };
    }
  }, [queryClient]);

  const signUp = useCallback(
    async ({ email, password, fullName }: SignUpCredentials): Promise<AuthActionResult> => {
      try {
        log.log('🎯 Sign up attempt:', email);
        setError(null);
        setAuthState((prev) => ({ ...prev, isLoading: true }));

        const { data, error: signUpError } = await authProviderClient.signUp(email, password, fullName);

        if (signUpError) {
          log.error('❌ Sign up error:', signUpError.message);
          setError({ message: signUpError.message, status: signUpError.status });
          setAuthState((prev) => ({ ...prev, isLoading: false }));
          return { success: false, error: signUpError };
        }

        log.log('✅ Sign up successful:', data.user?.email);
        
        // If user is auto-logged in after signup, invalidate cache to fetch fresh account state
        if (data.session) {
          log.log('🔄 User auto-logged in after signup - invalidating cache to fetch fresh account state');
          queryClient.invalidateQueries({ queryKey: ['account-state'] });
        }
        
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: true, data };
      } catch (err: unknown) {
        log.error('❌ Sign up exception:', err);
        const error = { message: getErrorMessage(err) || 'An unexpected error occurred' };
        setError(error);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error };
      }
    },
    []
  );

  /**
   * Sign in with OAuth provider.
   *
   * Uses auth-provider OAuth flow via the boundary client:
   * - iOS Google: WebBrowser.openAuthSessionAsync (ASWebAuthenticationSession)
   * - Android Google: Linking.openURL (external browser) + deep link callback
   * - Android Other: Linking.openURL (external browser) + deep link callback
   * - Apple: Native Apple Authentication on iOS
   */
  const signInWithOAuth = useCallback(async (provider: OAuthProvider): Promise<AuthActionResult> => {
    try {
      log.log('🎯 OAuth sign in attempt:', provider);
      setError(null);
      setAuthState((prev) => ({ ...prev, isLoading: true }));

      // ========================================
      // NATIVE APPLE SIGN-IN (iOS only)
      // Uses expo-apple-authentication for the best UX
      // ========================================
      if (provider === 'apple' && Platform.OS === 'ios') {
        log.log('🍎 Using native Apple Authentication for iOS');
        
        try {
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });

          log.log('✅ Apple credential received:', credential.user);

          // Sign in with auth provider Apple ID token
          const { data, error: appleError } = await authProviderClient.signInWithIdToken(
            'apple',
            credential.identityToken!
          );

          if (appleError) {
            log.error('❌ Apple sign in error:', appleError.message);
            setError({ message: appleError.message });
            setAuthState((prev) => ({ ...prev, isLoading: false }));
            return { success: false, error: appleError };
          }

          log.log('✅ Apple sign in successful');
          
          // Immediately invalidate React Query cache to fetch fresh account state
          log.log('🔄 Invalidating cache to fetch fresh account state');
          queryClient.invalidateQueries({ queryKey: ['account-state'] });
          
          setAuthState((prev) => ({ ...prev, isLoading: false }));
          return { success: true, data };
        } catch (appleErr: unknown) {
          if (appleErr instanceof Error && 'code' in appleErr && (appleErr as { code: string }).code === 'ERR_REQUEST_CANCELED') {
            log.log('⚠️ Apple sign in cancelled by user');
            setAuthState((prev) => ({ ...prev, isLoading: false }));
            return { success: false, error: { message: 'Sign in cancelled' } };
          }
          throw appleErr;
        }
      }

      // ========================================
      // AUTH PROVIDER OAUTH FLOW (Google and other providers)
      // Uses web-based OAuth for all providers:
      // - iOS Google: WebBrowser.openAuthSessionAsync (ASWebAuthenticationSession)
      // - Android Google: External browser via Linking.openURL (reliable callback handling)
      // - Other providers: Platform-specific browser handling
      // ========================================
      
      // Create redirect URL using expo-auth-session
      const redirectTo = makeRedirectUri({
        scheme: 'recoder',
        path: 'auth/callback',
      });

      log.log('📊 Redirect URL:', redirectTo, 'Platform:', Platform.OS);

      // Get OAuth URL from auth provider
      const { data, error: oauthError } = await authProviderClient.signInWithOAuth(provider, redirectTo);

      if (oauthError) {
        log.error('❌ OAuth error:', oauthError.message);
        setError({ message: oauthError.message });
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error: oauthError };
      }

      if (!data?.url) {
        log.error('❌ No OAuth URL returned');
        const error = { message: 'Failed to get authentication URL' };
        setError(error);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error };
      }

      log.log('🌐 Opening OAuth URL:', data.url);
      
      // Prevent multiple simultaneous OAuth sessions
      if (oauthSessionActiveRef.current) {
        log.warn('⚠️ OAuth session already in progress');
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error: { message: 'An authentication session is already in progress' } };
      }

      try {
        oauthSessionActiveRef.current = true;
        
        // ========================================
        // ANDROID: Use external browser via Linking.openURL
        // Chrome Custom Tabs don't properly handle custom URL scheme redirects
        // The external browser (Chrome, Firefox, etc.) works correctly for all OAuth providers
        // ========================================
        if (Platform.OS === 'android') {
          log.log('🤖 Android: Opening OAuth in external browser');
          
          // Open OAuth URL in external browser
          await Linking.openURL(data.url);
          
          // Wait for the app to return from browser and check for session
          // The deep link handler in _layout.tsx will process the callback
          log.log('⏳ Android: Waiting for OAuth callback...');
          
          return new Promise<AuthActionResult>((resolve) => {
            let hasResolved = false;
            let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
            
            // Timeout after 2 minutes
            const timeout = setTimeout(() => {
              if (!hasResolved) {
                hasResolved = true;
                appStateSubscription?.remove();
                log.log('❌ Android: OAuth timeout');
                setAuthState((prev) => ({ ...prev, isLoading: false }));
                oauthSessionActiveRef.current = false;
                resolve({ success: false, error: { message: 'Authentication timed out. Please try again.' } });
              }
            }, 120000);
            
            const handleAppStateChange = async (nextAppState: AppStateStatus) => {
              log.log('📱 Android: AppState changed to:', nextAppState);
              
              // When app comes back to foreground
              if (nextAppState === 'active' && !hasResolved) {
                // Give deep link handler time to process the callback
                await new Promise(r => setTimeout(r, 1500));
                
                // Check if session was set by deep link handler in _layout.tsx
                const token = await getSessionAccessToken();
                
                if (token) {
                  hasResolved = true;
                  clearTimeout(timeout);
                  appStateSubscription?.remove();
                  log.log('✅ Android: Session token found - OAuth successful');
                  
                  // Immediately invalidate React Query cache to fetch fresh account state
                  log.log('🔄 Invalidating cache to fetch fresh account state');
                  queryClient.invalidateQueries({ queryKey: ['account-state'] });
                  
                  setAuthState((prev) => ({ ...prev, isLoading: false }));
                  oauthSessionActiveRef.current = false;
                  resolve({ success: true, data: { access_token: token } });
                } else {
                  // User might have returned without completing auth
                  // Wait a bit more in case deep link is still processing
                  await new Promise(r => setTimeout(r, 1000));
                  const retryToken = await getSessionAccessToken();
                  
                  if (retryToken) {
                    hasResolved = true;
                    clearTimeout(timeout);
                    appStateSubscription?.remove();
                    log.log('✅ Android: Session token found on retry - OAuth successful');
                    
                    // Immediately invalidate React Query cache to fetch fresh account state
                    log.log('🔄 Invalidating cache to fetch fresh account state');
                    queryClient.invalidateQueries({ queryKey: ['account-state'] });
                    
                    setAuthState((prev) => ({ ...prev, isLoading: false }));
                    oauthSessionActiveRef.current = false;
                    resolve({ success: true, data: { access_token: retryToken } });
                  } else {
                    hasResolved = true;
                    clearTimeout(timeout);
                    appStateSubscription?.remove();
                    log.log('❌ Android: No session after returning from browser');
                    setAuthState((prev) => ({ ...prev, isLoading: false }));
                    oauthSessionActiveRef.current = false;
                    resolve({ success: false, error: { message: 'Authentication was not completed. Please try again.' } });
                  }
                }
              }
            };
            
            appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
          });
        }
        
        // ========================================
        // iOS: Use WebBrowser.openAuthSessionAsync
        // ASWebAuthenticationSession works perfectly with custom URL schemes
        // ========================================
        log.log('🍎 iOS: Opening OAuth in auth session');
        
        await WebBrowser.maybeCompleteAuthSession();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
          {
            preferEphemeralSession: true,
            showInRecents: true,
          }
        );

        log.log('📊 WebBrowser result:', result, 'Type:', result.type);

        if (result.type === 'success' && result.url) {
          const url = result.url;
          log.log('✅ OAuth redirect received:', url);
          
          // Check for access_token in URL fragment (implicit flow)
          if (url.includes('access_token=')) {
            log.log('✅ Access token found in URL, setting session');
            
            // Extract tokens from URL fragment
            const hashParams = new URLSearchParams(url.split('#')[1] || '');
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            
            if (accessToken && refreshToken) {
              // Set the session with the tokens
              const { data: sessionData, error: sessionError } = 
                await authProviderClient.setSession(accessToken, refreshToken);

              if (sessionError) {
                log.error('❌ Session error:', sessionError.message);
                setError({ message: sessionError.message });
                setAuthState((prev) => ({ ...prev, isLoading: false }));
                oauthSessionActiveRef.current = false;
                return { success: false, error: sessionError };
              }

              log.log('✅ OAuth sign in successful');
              
              // Immediately invalidate React Query cache to fetch fresh account state
              log.log('🔄 Invalidating cache to fetch fresh account state');
              queryClient.invalidateQueries({ queryKey: ['account-state'] });
              
              setAuthState((prev) => ({ ...prev, isLoading: false }));
              oauthSessionActiveRef.current = false;
              return { success: true, data: sessionData };
            }
          }
          
          // Check for code in query params (PKCE flow)
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          
          if (code) {
            log.log('✅ OAuth code received, exchanging for session');
            
            const { data: sessionData, error: sessionError } = 
              await authProviderClient.exchangeCodeForSession(code);

            if (sessionError) {
              log.error('❌ Session exchange error:', sessionError.message);
              setError({ message: sessionError.message });
              setAuthState((prev) => ({ ...prev, isLoading: false }));
              oauthSessionActiveRef.current = false;
              return { success: false, error: sessionError };
            }

            log.log('✅ OAuth sign in successful');
            
            // Immediately invalidate React Query cache to fetch fresh account state
            log.log('🔄 Invalidating cache to fetch fresh account state');
            queryClient.invalidateQueries({ queryKey: ['account-state'] });
            
            setAuthState((prev) => ({ ...prev, isLoading: false }));
            oauthSessionActiveRef.current = false;
            return { success: true, data: sessionData };
          }
        } else if (result.type === 'cancel' || result.type === 'dismiss') {
          log.log('⚠️ OAuth cancelled/dismissed by user');
          setAuthState((prev) => ({ ...prev, isLoading: false }));
          oauthSessionActiveRef.current = false;
          return { success: false, error: { message: 'Sign in cancelled' } };
        }

        log.log('❌ OAuth failed - unexpected result type:', result.type);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        oauthSessionActiveRef.current = false;
        return { success: false, error: { message: 'Authentication failed' } };
      } catch (sessionErr: unknown) {
        // Reset session flag on error within try block
        oauthSessionActiveRef.current = false;
        throw sessionErr;
      }
    } catch (err: unknown) {
      log.error('❌ OAuth exception:', err);
      
      // Reset session flag on error
      oauthSessionActiveRef.current = false;
      
      // Handle specific WebBrowser auth session error
      if (hasErrorMessage(err, 'invalid state') || hasErrorMessage(err, 'redirect handler')) {
        log.warn('⚠️ WebBrowser auth session conflict, attempting cleanup...');
        try {
          await WebBrowser.maybeCompleteAuthSession();
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (cleanupError) {
          log.warn('⚠️ Cleanup attempt failed:', cleanupError);
        }
      }
      
      const error = { message: getErrorMessage(err) || 'An unexpected error occurred' };
      setError(error);
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return { success: false, error };
    }
  }, []);

  /**
   * Sign in with magic link (passwordless)
   * Auto-creates account if it doesn't exist
   * Uses recoder:// deep link - works when app is installed
   */
  const signInWithMagicLink = useCallback(async ({ email, acceptedTerms }: { email: string; acceptedTerms?: boolean }): Promise<AuthActionResult> => {
    try {
      log.log('🎯 Magic link sign in request:', email);
      setError(null);
      setAuthState((prev) => ({ ...prev, isLoading: true }));

      // Build deep link URL directly
      const params = new URLSearchParams();
      if (acceptedTerms) {
        params.set('terms_accepted', 'true');
      }
      
      const emailRedirectTo = `recoder://auth/callback${params.toString() ? `?${params.toString()}` : ''}`;

      log.log('📱 Magic link redirect URL:', emailRedirectTo);

      const { error: magicLinkError, data } = await authProviderClient.signInWithOtp(email, emailRedirectTo);

      if (magicLinkError) {
        log.error('❌ Auth provider rejected redirect URL:', {
          message: magicLinkError.message,
          status: magicLinkError.status,
          attemptedUrl: emailRedirectTo,
          hint: 'Make sure recoder://auth/callback is in auth provider redirect URL allowlist',
        });
      }

      if (magicLinkError) {
        log.error('❌ Magic link error:', magicLinkError.message);
        setError({ message: magicLinkError.message });
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error: magicLinkError };
      }

      // If user accepted terms and magic link was sent, update metadata after successful auth
      // Note: This will be handled when the user clicks the magic link and signs in
      // For now, we store it in the signup data which will be saved when account is created

      log.log('✅ Magic link email sent');
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return { success: true };
    } catch (err: unknown) {
      log.error('❌ Magic link exception:', err);
      const error = { message: getErrorMessage(err) || 'An unexpected error occurred' };
      setError(error);
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return { success: false, error };
    }
  }, []);

  /**
   * Request password reset email
   */
  const resetPassword = useCallback(async ({ email }: PasswordResetRequest): Promise<AuthActionResult> => {
    try {
      log.log('🎯 Password reset request:', email);
      setError(null);

      const { error: resetError } = await authProviderClient.resetPasswordForEmail(
        email,
        'recoder://auth/reset-password'
      );

      if (resetError) {
        log.error('❌ Password reset error:', resetError.message);
        setError({ message: resetError.message });
        return { success: false, error: resetError };
      }

      log.log('✅ Password reset email sent');
      return { success: true };
    } catch (err: unknown) {
      log.error('❌ Password reset exception:', err);
      const error = { message: getErrorMessage(err) || 'An unexpected error occurred' };
      setError(error);
      return { success: false, error };
    }
  }, []);


  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      log.log('🎯 Password update attempt');
      setError(null);

      const { error: updateError } = await authProviderClient.updateUser({
        password: newPassword,
      });

      if (updateError) {
        log.error('❌ Password update error:', updateError.message);
        setError({ message: updateError.message });
        return { success: false, error: updateError };
      }

      log.log('✅ Password updated successfully');
      return { success: true };
    } catch (err: unknown) {
      log.error('❌ Password update exception:', err);
      const error = { message: getErrorMessage(err) || 'An unexpected error occurred' };
      setError(error);
      return { success: false, error };
    }
  }, []);

  /**
   * Sign out - Best practice implementation
   * 
   * 1. Attempts global sign out (server + local)
   * 2. Falls back to local-only if global fails
   * 3. Manually clears all auth provider keys from AsyncStorage as failsafe
   * 4. Forces React state update
   * 5. Preserves user preferences (theme, language, onboarding cache)
   * 
   * Note: Onboarding status is stored in user_metadata (backend), so it persists
   * across devices and logins. AsyncStorage cache is kept for faster checks.
   * 
   * Always succeeds from UI perspective to prevent stuck states
   */
  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    // Prevent multiple simultaneous sign out attempts
    if (isSigningOut) {
      log.log('⚠️ Sign out already in progress, ignoring duplicate call');
      return { success: false, error: { message: 'Sign out already in progress' } };
    }

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    
    /**
     * Helper to clear all auth-provider-related keys from AsyncStorage
     * This is a nuclear option that ensures complete sign out
     */
    const clearAuthProviderStorage = async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const authProviderKeys = allKeys.filter((key: string) =>
          key.includes('sb-') || 
          key.includes('-auth-token')
        );
        
        if (authProviderKeys.length > 0) {
          log.log(`🗑️  Removing ${authProviderKeys.length} auth provider keys from storage`);
          await AsyncStorage.multiRemove(authProviderKeys);
        }
      } catch (error) {
        log.warn('⚠️  Failed to clear auth provider storage:', error);
      }
    };

    const clearAppData = async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys()
        const appDataKeys = allKeys.filter((key: string) => 
          key.startsWith('@') && 
          !key.includes('language') &&
          !key.includes('theme') &&
          !key.includes('onboarding_completed')
        );
        
        log.log(`🧹 Clearing ${appDataKeys.length} app data keys:`, appDataKeys);
        
        if (appDataKeys.length > 0) {
          await AsyncStorage.multiRemove(appDataKeys);
        }
        
        log.log('✅ All app data cleared (except preferences and onboarding status)');
      } catch (error) {
        log.warn('⚠️  Failed to clear app data:', error);
      }
    };

    const forceSignOutState = () => {
      setLoggerUserId(null); // Clear logger user ID
      setAuthState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
      });
      setError(null);
    };

    try {
      log.log('🎯 Sign out initiated');
      setIsSigningOut(true);
      
      if (shouldUseRevenueCat()) {
        try {
          const { logoutRevenueCat } = require('@/lib/billing/revenuecat');
          await logoutRevenueCat();
          log.log('✅ RevenueCat logout completed - subscription detached from device');
        } catch (rcError) {
          log.warn('⚠️  RevenueCat logout failed (non-critical):', rcError);
        }
      }

      const { error: globalError } = await authProviderClient.signOut('global');

      if (globalError) {
        log.warn('⚠️  Global sign out failed:', globalError.message);
        
        const { error: localError } = await authProviderClient.signOut('local');
        
        if (localError) {
          log.warn('⚠️  Local sign out also failed:', localError.message);
        }
      }

      await clearAuthProviderStorage();

      await clearAppData();

      log.log('🗑️  Clearing React Query cache...');
      queryClient.clear();
      log.log('✅ React Query cache cleared');

      forceSignOutState();

      log.log('✅ Sign out completed successfully - all data cleared');
      setIsSigningOut(false);
      return { success: true };

    } catch (error: unknown) {
      log.error('❌ Sign out exception:', error);

      await clearAuthProviderStorage().catch(() => {});
      await clearAppData().catch(() => {});
      queryClient.clear();
      forceSignOutState();

      log.log('✅ Sign out completed (with errors handled) - all data cleared');
      setIsSigningOut(false);
      return { success: true };
    }
  }, [queryClient, isSigningOut]);

  return {
    ...authState,
    error,
    isSigningOut,
    signIn,
    signUp,
    signInWithOAuth,
    signInWithMagicLink,
    resetPassword,
    updatePassword,
    signOut,
  };
}
