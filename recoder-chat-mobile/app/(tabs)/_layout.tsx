import React, { useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Initialize our services
import { crossPlatformSync } from '../../services/CrossPlatformSync';
import { mobileFeatures } from '../../services/MobileFeatures';
import { mobileProvider } from '../../lib/ai/providers';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    connected: false,
    pendingChanges: 0,
    conflicts: 0,
  });

  useEffect(() => {
    initializeApp();
    setupEventListeners();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 Initializing Recoder.xyz mobile app...');
      
      // Initialize local-first AI providers
      await mobileProvider.testConnection();
      console.log('✅ Local-first AI providers initialized');
      
      // Initialize cross-platform sync (will handle auth check internally)
      try {
        await crossPlatformSync.initialize();
        console.log('✅ Cross-platform sync initialized');
      } catch (error) {
        console.log('⚠️ Sync initialization skipped (not authenticated)');
      }
      
      // Get device capabilities
      const capabilities = await mobileFeatures.getDeviceCapabilities();
      console.log('✅ Device capabilities loaded:', capabilities);
      
      setIsInitialized(true);
      console.log('🎉 App initialization complete!');
    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      Alert.alert(
        'Initialization Error', 
        'Some features may not work properly. Please restart the app.',
        [{ text: 'OK' }]
      );
      setIsInitialized(true); // Allow app to continue
    }
  };

  const setupEventListeners = () => {
    // Sync status updates
    crossPlatformSync.on('sync-initialized', () => {
      updateSyncStatus();
    });

    crossPlatformSync.on('sync-completed', () => {
      updateSyncStatus();
    });

    crossPlatformSync.on('conflict-detected', (conflict) => {
      Alert.alert(
        'Sync Conflict',
        `A conflict was detected. Please check Settings to resolve it.`,
        [{ text: 'OK' }]
      );
      updateSyncStatus();
    });

    // Update sync status periodically
    const syncInterval = setInterval(updateSyncStatus, 30000); // Every 30 seconds

    return () => {
      clearInterval(syncInterval);
    };
  };

  const updateSyncStatus = () => {
    try {
      const status = crossPlatformSync.getSyncStatus();
      setSyncStatus({
        connected: status.connected,
        pendingChanges: status.pendingChanges,
        conflicts: status.conflicts,
      });
    } catch (error) {
      // Sync not initialized yet
    }
  };

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>🚀 Recoder.xyz</Text>
        <Text style={styles.loadingText}>Initializing AI systems...</Text>
        <View style={styles.loadingSteps}>
          <Text style={styles.loadingStep}>✅ Initializing local-first AI providers</Text>
          <Text style={styles.loadingStep}>⏳ Setting up cross-platform sync</Text>
          <Text style={styles.loadingStep}>⏳ Checking device capabilities</Text>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: colorScheme === 'dark' ? '#8E8E93' : '#6b7280',
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#ffffff',
          borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
          paddingTop: 8,
          paddingBottom: 8,
          height: 80,
        },
        headerStyle: {
          backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#ffffff',
        },
        headerTintColor: colorScheme === 'dark' ? '#ffffff' : '#1f2937',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
          tabBarBadge: syncStatus.pendingChanges > 0 ? syncStatus.pendingChanges : undefined,
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'AI Agents',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="code"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons name="settings" size={size} color={color} />
              {syncStatus.conflicts > 0 && (
                <View style={styles.conflictBadge}>
                  <Text style={styles.conflictBadgeText}>!</Text>
                </View>
              )}
              {syncStatus.connected && (
                <View style={[styles.syncDot, { backgroundColor: '#10b981' }]} />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 32,
  },
  loadingTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  loadingSteps: {
    alignItems: 'flex-start',
    gap: 12,
  },
  loadingStep: {
    fontSize: 16,
    color: '#374151',
  },
  conflictBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conflictBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  syncDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});