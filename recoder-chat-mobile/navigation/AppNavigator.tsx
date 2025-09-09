import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { enableScreens } from 'react-native-screens';

// Import screens
import { AuthScreen } from '../screens/AuthScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { CodeGenerationScreen } from '../screens/CodeGenerationScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OfflineScreen } from '../screens/OfflineScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { DeveloperScreen } from '../screens/DeveloperScreen';
import { TemplatesScreen } from '../screens/TemplatesScreen';
import { CollaborationScreen } from '../screens/CollaborationScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';

// Import contexts
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// Import components
import { LoadingScreen } from '../components/LoadingScreen';
import { CustomDrawerContent } from '../components/CustomDrawerContent';
import { TabBarIcon } from '../components/TabBarIcon';
import { HeaderRight } from '../components/HeaderRight';
import { HeaderTitle } from '../components/HeaderTitle';

// Enable screens optimization
enableScreens();

// Navigation types
export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  ProjectDetail: { projectId: string };
  CodeGeneration: { projectId?: string; template?: string };
  Search: { query?: string };
  Notifications: undefined;
  Subscription: { feature?: string };
  Developer: undefined;
  About: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Projects: undefined;
  Generate: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type DrawerParamList = {
  MainTabs: undefined;
  Templates: undefined;
  Collaboration: undefined;
  Analytics: undefined;
  Settings: undefined;
  Offline: undefined;
};

// Stack navigators
const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const Drawer = createDrawerNavigator<DrawerParamList>();

// Tab Navigator Component
function MainTabNavigator() {
  const { theme } = useTheme();
  const { isOnline } = useNetworkStatus();

  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <TabBarIcon route={route} focused={focused} color={color} size={size} />
        ),
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 34 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
      })}
    >
      <MainTab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <MainTab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarLabel: 'Projects',
          tabBarBadge: isOnline ? undefined : '!',
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.warning,
            color: theme.colors.onWarning,
          },
        }}
      />
      <MainTab.Screen
        name="Generate"
        component={CodeGenerationScreen}
        options={{
          tabBarLabel: 'Generate',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={size + 4}
              color={color}
            />
          ),
        }}
      />
      <MainTab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: 'Chat',
        }}
      />
      <MainTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </MainTab.Navigator>
  );
}

// Drawer Navigator Component
function DrawerNavigator() {
  const { theme } = useTheme();
  const { user } = useAuth();

  return (
    <Drawer.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        drawerStyle: {
          backgroundColor: theme.colors.surface,
          width: 280,
        },
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.textSecondary,
        drawerLabelStyle: {
          fontSize: 16,
          fontWeight: '500',
          marginLeft: -16,
        },
        drawerItemStyle: {
          borderRadius: 8,
          marginHorizontal: 8,
          marginVertical: 2,
        },
      }}
      drawerContent={(props) => <CustomDrawerContent {...props} />}
    >
      <Drawer.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{
          drawerLabel: 'Dashboard',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          headerTitle: () => <HeaderTitle />,
          headerRight: () => <HeaderRight />,
        }}
      />
      <Drawer.Screen
        name="Templates"
        component={TemplatesScreen}
        options={{
          drawerLabel: 'Templates',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
          title: 'Code Templates',
        }}
      />
      {user?.subscription?.tier !== 'free' && (
        <Drawer.Screen
          name="Collaboration"
          component={CollaborationScreen}
          options={{
            drawerLabel: 'Collaboration',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
            title: 'Team Collaboration',
          }}
        />
      )}
      {user?.subscription?.tier === 'enterprise' && (
        <Drawer.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{
            drawerLabel: 'Analytics',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="analytics-outline" size={size} color={color} />
            ),
            title: 'Usage Analytics',
          }}
        />
      )}
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          drawerLabel: 'Settings',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
          title: 'Settings',
        }}
      />
      <Drawer.Screen
        name="Offline"
        component={OfflineScreen}
        options={{
          drawerLabel: 'Offline Mode',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="cloud-offline-outline" size={size} color={color} />
          ),
          title: 'Offline Projects',
        }}
      />
    </Drawer.Navigator>
  );
}

// Root Navigator Component
function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const { hasCompletedOnboarding } = useOnboarding();
  const { theme } = useTheme();

  // Handle deep linking
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      console.log('Deep link received:', url);
      // Handle deep link navigation
      // Example: recoder://project/123 or recoder://generate?template=react
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // Handle app launch from deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        headerBackTitleVisible: false,
        animation: 'slide_from_right',
      }}
    >
      {!isAuthenticated ? (
        <>
          {!hasCompletedOnboarding && (
            <RootStack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false }}
            />
          )}
          <RootStack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ 
              headerShown: false,
              animationTypeForReplace: isAuthenticated ? 'push' : 'pop',
            }}
          />
        </>
      ) : (
        <>
          <RootStack.Screen
            name="Main"
            component={DrawerNavigator}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="ProjectDetail"
            component={ProjectDetailScreen}
            options={({ route }) => ({
              title: 'Project Details',
              headerBackTitle: 'Projects',
            })}
          />
          <RootStack.Screen
            name="CodeGeneration"
            component={CodeGenerationScreen}
            options={{
              title: 'Generate Code',
              headerBackTitle: 'Back',
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <RootStack.Screen
            name="Search"
            component={SearchScreen}
            options={{
              title: 'Search',
              headerBackTitle: 'Back',
              presentation: 'modal',
            }}
          />
          <RootStack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{
              title: 'Notifications',
              headerBackTitle: 'Back',
            }}
          />
          <RootStack.Screen
            name="Subscription"
            component={SubscriptionScreen}
            options={{
              title: 'Upgrade Plan',
              headerBackTitle: 'Back',
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <RootStack.Screen
            name="Developer"
            component={DeveloperScreen}
            options={{
              title: 'Developer Tools',
              headerBackTitle: 'Back',
            }}
          />
          <RootStack.Screen
            name="About"
            component={AboutScreen}
            options={{
              title: 'About Recoder',
              headerBackTitle: 'Back',
            }}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

// Main App Navigator Component
export function AppNavigator() {
  const colorScheme = useColorScheme();
  const { theme } = useTheme();

  // Create custom navigation theme
  const navigationTheme = {
    ...((colorScheme === 'dark' || theme.isDark) ? DarkTheme : DefaultTheme),
    colors: {
      ...((colorScheme === 'dark' || theme.isDark) ? DarkTheme.colors : DefaultTheme.colors),
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.primary,
    },
  };

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <NavigationContainer theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default AppNavigator;