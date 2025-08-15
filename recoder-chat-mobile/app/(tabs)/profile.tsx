import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  useColorScheme,
  Alert,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MobileAIStatus from '../../components/MobileAIStatus';
import { useAuthContext } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { getProviderStatus } from '../../lib/ai/providers';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const { user, logout } = useAuthContext();
  const { resetOnboarding } = useOnboarding();
  const [aiStatus, setAIStatus] = useState<any>(null);
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: colorScheme === 'dark',
    autoSync: true,
    analyticsEnabled: false
  });

  useEffect(() => {
    loadAIStatus();
  }, []);

  const loadAIStatus = async () => {
    try {
      const status = await getProviderStatus();
      setAIStatus(status);
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  };

  const handleLocalAIDetected = () => {
    console.log('🎉 Local AI detected in settings!');
    loadAIStatus();
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout }
      ]
    );
  };

  const handleSetting = (setting: keyof typeof settings, value: boolean) => {
    setSettings(prev => ({ ...prev, [setting]: value }));
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      'Reset Onboarding',
      'This will reset the app onboarding flow. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive', 
          onPress: () => {
            resetOnboarding();
            Alert.alert('Success', 'Onboarding has been reset. Restart the app to see the onboarding flow.');
          }
        }
      ]
    );
  };

  const isDark = colorScheme === 'dark';
  const backgroundColor = isDark ? '#000000' : '#FFFFFF';
  const cardBackground = isDark ? '#1C1C1E' : '#F2F2F7';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryTextColor = isDark ? '#8E8E93' : '#8E8E93';

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>Settings</Text>
      </View>

      {/* AI Status Section */}
      <View style={styles.section}>
        <MobileAIStatus 
          onLocalAIDetected={handleLocalAIDetected}
          taskType="mobile"
        />
      </View>

      {/* User Profile Section */}
      {user && (
        <View style={[styles.section, styles.card, { backgroundColor: cardBackground }]}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <Ionicons 
                name="person-circle" 
                size={60} 
                color={isDark ? '#8E8E93' : '#C7C7CC'} 
              />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.userName, { color: textColor }]}>
                {user.name || user.email}
              </Text>
              <Text style={[styles.userEmail, { color: secondaryTextColor }]}>
                {user.email}
              </Text>
              <View style={styles.userStats}>
                <Text style={[styles.statText, { color: secondaryTextColor }]}>
                  Premium Plan • {aiStatus?.priority?.length || 0} AI Providers
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* AI Provider Settings */}
      <View style={[styles.section, styles.card, { backgroundColor: cardBackground }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>🤖 AI Configuration</Text>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="settings-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Provider Settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="key-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>API Keys</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="download-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Model Management</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
      </View>

      {/* App Settings */}
      <View style={[styles.section, styles.card, { backgroundColor: cardBackground }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>📱 App Settings</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="notifications-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Notifications</Text>
          </View>
          <Switch
            value={settings.notifications}
            onValueChange={(value) => handleSetting('notifications', value)}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            thumbColor={settings.notifications ? '#FFFFFF' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="sync-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Auto Sync</Text>
          </View>
          <Switch
            value={settings.autoSync}
            onValueChange={(value) => handleSetting('autoSync', value)}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            thumbColor={settings.autoSync ? '#FFFFFF' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="analytics-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Analytics</Text>
          </View>
          <Switch
            value={settings.analyticsEnabled}
            onValueChange={(value) => handleSetting('analyticsEnabled', value)}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            thumbColor={settings.analyticsEnabled ? '#FFFFFF' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Support & Info */}
      <View style={[styles.section, styles.card, { backgroundColor: cardBackground }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>ℹ️ Support & Info</Text>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="help-circle-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Help & Tutorials</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="bug-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Report Issue</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>About</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.settingItem} onPress={handleResetOnboarding}>
          <View style={styles.settingLeft}>
            <Ionicons name="refresh-outline" size={20} color="#007AFF" />
            <Text style={[styles.settingLabel, { color: textColor }]}>Reset Onboarding</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
      </View>

      {/* Account Actions */}
      <View style={[styles.section, styles.card, { backgroundColor: cardBackground }]}>
        <TouchableOpacity style={[styles.settingItem, styles.dangerItem]} onPress={handleLogout}>
          <View style={styles.settingLeft}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={[styles.settingLabel, { color: '#FF3B30' }]}>Sign Out</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: secondaryTextColor }]}>
          Recoder Mobile v1.0.0
        </Text>
        <Text style={[styles.footerText, { color: secondaryTextColor }]}>
          Made with 💙 for developers
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 8,
  },
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginLeft: 12,
  },
  dangerItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FF3B30',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 4,
  },
});