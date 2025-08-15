/**
 * Mobile Push Notifications Service
 * Handles push notifications for code generation completion and alerts
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPreferences {
  codeGeneration: boolean;
  errors: boolean;
  deployments: boolean;
  reminders: boolean;
  marketing: boolean;
}

export interface CodeGenerationNotification {
  title: string;
  body: string;
  projectId?: string;
  taskId?: string;
  success: boolean;
  duration?: number;
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  private token: string | null = null;
  private preferences: NotificationPreferences = {
    codeGeneration: true,
    errors: true,
    deployments: true,
    reminders: true,
    marketing: false
  };

  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    await this.loadPreferences();
    
    // Request permissions on app start
    if (Device.isDevice) {
      await this.registerForPushNotifications();
    }
  }

  async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.warn('Push notifications only work on physical devices');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permissions denied');
      return null;
    }

    try {
      // Get the push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      
      this.token = tokenData.data;
      
      // Store token locally
      await AsyncStorage.setItem('@recoder:push_token', this.token);
      
      // Register token with backend
      await this.registerTokenWithBackend(this.token);
      
      console.log('Push notification token:', this.token);
      return this.token;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      const apiEndpoint = __DEV__ ? 'http://localhost:3001' : 'https://api.recoder.xyz';
      const authToken = await AsyncStorage.getItem('@recoder:auth_token');
      
      if (!authToken) {
        console.warn('No auth token available for push token registration');
        return;
      }

      const response = await fetch(`${apiEndpoint}/api/notifications/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          deviceId: Constants.deviceId,
          preferences: this.preferences
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to register push token: ${response.statusText}`);
      }

      console.log('Push token registered with backend successfully');
    } catch (error) {
      console.error('Failed to register push token with backend:', error);
    }
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences };
    
    // Save to local storage
    await AsyncStorage.setItem('@recoder:notification_prefs', JSON.stringify(this.preferences));
    
    // Update backend
    if (this.token) {
      await this.registerTokenWithBackend(this.token);
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('@recoder:notification_prefs');
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load notification preferences:', error);
    }
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  // Local notification methods
  async scheduleCodeGenerationNotification(data: CodeGenerationNotification): Promise<void> {
    if (!this.preferences.codeGeneration) {
      return;
    }

    const notification = {
      title: data.title,
      body: data.body,
      data: {
        type: 'code_generation',
        projectId: data.projectId,
        taskId: data.taskId,
        success: data.success,
        timestamp: Date.now()
      },
      sound: data.success ? 'success.wav' : 'error.wav',
      priority: data.success ? 'normal' : 'high' as any
    };

    await Notifications.scheduleNotificationAsync({
      content: notification,
      trigger: null // Send immediately
    });
  }

  async scheduleErrorNotification(title: string, body: string, errorData?: any): Promise<void> {
    if (!this.preferences.errors) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'error',
          errorData,
          timestamp: Date.now()
        },
        sound: 'error.wav',
        priority: 'high'
      },
      trigger: null
    });
  }

  async scheduleDeploymentNotification(title: string, body: string, deploymentId: string, success: boolean): Promise<void> {
    if (!this.preferences.deployments) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'deployment',
          deploymentId,
          success,
          timestamp: Date.now()
        },
        sound: success ? 'success.wav' : 'error.wav',
        priority: success ? 'normal' : 'high'
      },
      trigger: null
    });
  }

  async scheduleReminderNotification(title: string, body: string, triggerDate: Date): Promise<string> {
    if (!this.preferences.reminders) {
      throw new Error('Reminder notifications are disabled');
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'reminder',
          timestamp: Date.now()
        },
        sound: 'reminder.wav'
      },
      trigger: { 
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate 
      }
    });

    return notificationId;
  }

  async scheduleLocalNotification(options: {
    title: string;
    body: string;
    data?: any;
    sound?: string;
  }): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: {
          ...options.data,
          timestamp: Date.now()
        },
        sound: options.sound || 'default'
      },
      trigger: null // Show immediately
    });

    return notificationId;
  }

  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  // Badge management
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  // Notification response handling
  setupNotificationResponseHandler(handler: (response: Notifications.NotificationResponse) => void): void {
    Notifications.addNotificationResponseReceivedListener(handler);
  }

  setupNotificationReceivedHandler(handler: (notification: Notifications.Notification) => void): void {
    Notifications.addNotificationReceivedListener(handler);
  }

  // Predefined notification templates
  async notifyCodeGenerationComplete(projectName: string, taskName: string, success: boolean, duration?: number): Promise<void> {
    const durationText = duration ? ` in ${Math.round(duration / 1000)}s` : '';
    
    await this.scheduleCodeGenerationNotification({
      title: success ? '✅ Code Generation Complete' : '❌ Code Generation Failed',
      body: success 
        ? `${taskName} for ${projectName} completed successfully${durationText}`
        : `${taskName} for ${projectName} failed. Check the app for details.`,
      success,
      duration
    });
  }

  async notifyDeploymentComplete(projectName: string, environment: string, success: boolean): Promise<void> {
    await this.scheduleDeploymentNotification(
      success ? '🚀 Deployment Success' : '💥 Deployment Failed',
      success
        ? `${projectName} deployed to ${environment} successfully`
        : `${projectName} deployment to ${environment} failed`,
      `${projectName}-${environment}-${Date.now()}`,
      success
    );
  }

  async notifyError(title: string, message: string, errorCode?: string): Promise<void> {
    await this.scheduleErrorNotification(
      `🚨 ${title}`,
      errorCode ? `${message} (Error: ${errorCode})` : message
    );
  }

  async notifyAIQuotaExceeded(provider: string, resetTime?: Date): Promise<void> {
    const resetText = resetTime ? ` Resets ${resetTime.toLocaleString()}` : '';
    
    await this.scheduleErrorNotification(
      '⚠️ AI Quota Exceeded',
      `${provider} quota exceeded.${resetText} Consider upgrading your plan.`
    );
  }

  async notifyNewFeatureAvailable(featureName: string, description: string): Promise<void> {
    if (!this.preferences.marketing) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎉 New Feature Available',
        body: `${featureName}: ${description}`,
        data: {
          type: 'feature_announcement',
          featureName,
          timestamp: Date.now()
        }
      },
      trigger: null
    });
  }

  // Analytics and insights notifications
  async notifyWeeklyReport(projectsCompleted: number, linesGenerated: number, timesSaved: number): Promise<void> {
    if (!this.preferences.reminders) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 Weekly Report',
        body: `${projectsCompleted} projects completed, ${linesGenerated} lines generated, ${timesSaved}h saved!`,
        data: {
          type: 'weekly_report',
          stats: { projectsCompleted, linesGenerated, timesSaved },
          timestamp: Date.now()
        }
      },
      trigger: null
    });
  }

  // Helper methods
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  }

  async getNotificationPermissionStatus(): Promise<string> {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  }

  async openNotificationSettings(): Promise<void> {
    if (Platform.OS === 'ios') {
      // iOS opens the app's notification settings
      await Notifications.requestPermissionsAsync();
    } else {
      // Android would need a deep link to system settings
      console.log('Notification settings should be opened manually on Android');
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;