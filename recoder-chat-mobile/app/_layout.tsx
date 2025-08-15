import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../contexts/AuthContext';
import { ChatProvider } from '../contexts/ChatContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import AppNavigator from '../components/AppNavigator';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    // TODO: Add Inter fonts to assets/fonts/
    // 'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    // 'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    // 'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    // 'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <OnboardingProvider>
        <AuthProvider>
          <ChatProvider>
            <AppNavigator>
              <Stack
                screenOptions={{
                  headerStyle: {
                    backgroundColor: '#1a1a1a',
                  },
                  headerTintColor: '#ffffff',
                  headerTitleStyle: {
                    fontWeight: '600',
                    fontFamily: 'Inter-SemiBold',
                  },
                }}
              >
                <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="auth/login" options={{ title: 'Sign In' }} />
                <Stack.Screen name="auth/register" options={{ title: 'Sign Up' }} />
                <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
                <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              </Stack>
            </AppNavigator>
            <StatusBar style="auto" />
          </ChatProvider>
        </AuthProvider>
      </OnboardingProvider>
    </ThemeProvider>
  );
}