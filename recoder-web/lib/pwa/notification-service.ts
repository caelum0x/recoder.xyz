import { PWAConfig } from '../types';

export function generateNotificationService(config: PWAConfig): string {
  return `
// Notification Service for ${config.name}
// Handles push notifications, subscription management, and user engagement

class NotificationService {
  constructor() {
    this.isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    this.permission = Notification.permission;
    this.subscription = null;
    this.vapidPublicKey = '${config.notifications.vapidKeys.publicKey}';
    this.subscribeEndpoint = '${config.notifications.subscriberEndpoint}';
    this.defaultIcon = '${config.notifications.defaultIcon}';
    this.defaultBadge = '${config.notifications.defaultBadge}';
    
    this.init();
  }
  
  async init() {
    if (!this.isSupported) {
      console.warn('NotificationService: Push notifications not supported');
      return;
    }
    
    try {
      // Check existing subscription
      const registration = await navigator.serviceWorker.ready;
      this.subscription = await registration.pushManager.getSubscription();
      
      if (this.subscription) {
        console.log('NotificationService: Existing subscription found');
        await this.updateSubscriptionOnServer();
      }
      
      console.log('NotificationService: Initialized successfully');
    } catch (error) {
      console.error('NotificationService: Initialization failed', error);
    }
  }
  
  async requestPermission() {
    if (!this.isSupported) {
      throw new Error('Push notifications are not supported');
    }
    
    if (this.permission === 'granted') {
      return true;
    }
    
    if (this.permission === 'denied') {
      throw new Error('Push notifications are blocked. Please enable them in browser settings.');
    }
    
    const permission = await Notification.requestPermission();
    this.permission = permission;
    
    if (permission === 'granted') {
      console.log('NotificationService: Permission granted');
      return true;
    } else {
      console.log('NotificationService: Permission denied');
      throw new Error('Push notification permission denied');
    }
  }
  
  async subscribe(userMetadata = {}) {
    try {
      await this.requestPermission();
      
      const registration = await navigator.serviceWorker.ready;
      
      // Unsubscribe from existing subscription if it exists
      if (this.subscription) {
        await this.subscription.unsubscribe();
      }
      
      // Subscribe to push notifications
      this.subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });
      
      console.log('NotificationService: Subscribed successfully');
      
      // Send subscription to server
      await this.sendSubscriptionToServer(userMetadata);
      
      // Store subscription locally
      localStorage.setItem('push-subscription', JSON.stringify({
        subscription: this.subscription.toJSON(),
        timestamp: Date.now(),
        userMetadata
      }));
      
      return this.subscription;
    } catch (error) {
      console.error('NotificationService: Subscription failed', error);
      throw error;
    }
  }
  
  async unsubscribe() {
    try {
      if (this.subscription) {
        await this.subscription.unsubscribe();
        await this.removeSubscriptionFromServer();
        
        this.subscription = null;
        localStorage.removeItem('push-subscription');
        
        console.log('NotificationService: Unsubscribed successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('NotificationService: Unsubscribe failed', error);
      throw error;
    }
  }
  
  async sendSubscriptionToServer(userMetadata = {}) {
    if (!this.subscription) {
      throw new Error('No subscription available');
    }
    
    const subscriptionData = {
      subscription: this.subscription.toJSON(),
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      userMetadata,
      appVersion: '1.0.0'
    };
    
    const response = await fetch(this.subscribeEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscriptionData)
    });
    
    if (!response.ok) {
      throw new Error(\`Failed to send subscription to server: \${response.status}\`);
    }
    
    const result = await response.json();
    console.log('NotificationService: Subscription sent to server', result);
    
    return result;
  }
  
  async updateSubscriptionOnServer() {
    if (!this.subscription) {
      return;
    }
    
    try {
      const stored = JSON.parse(localStorage.getItem('push-subscription') || '{}');
      await this.sendSubscriptionToServer(stored.userMetadata || {});
    } catch (error) {
      console.error('NotificationService: Failed to update subscription', error);
    }
  }
  
  async removeSubscriptionFromServer() {
    if (!this.subscription) {
      return;
    }
    
    try {
      const response = await fetch(this.subscribeEndpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: this.subscription.toJSON()
        })
      });
      
      if (response.ok) {
        console.log('NotificationService: Subscription removed from server');
      }
    } catch (error) {
      console.error('NotificationService: Failed to remove subscription from server', error);
    }
  }
  
  async showLocalNotification(title, options = {}) {
    if (this.permission !== 'granted') {
      console.warn('NotificationService: No permission for local notifications');
      return null;
    }
    
    const notificationOptions = {
      icon: this.defaultIcon,
      badge: this.defaultBadge,
      timestamp: Date.now(),
      tag: 'local-notification',
      requireInteraction: false,
      ...options
    };
    
    const notification = new Notification(title, notificationOptions);
    
    // Track notification display
    this.trackNotification('local_notification_shown', {
      title,
      tag: notificationOptions.tag
    });
    
    // Handle click
    notification.onclick = (event) => {
      event.preventDefault();
      
      this.trackNotification('local_notification_clicked', {
        title,
        tag: notificationOptions.tag
      });
      
      // Handle navigation
      if (options.url) {
        window.open(options.url, '_blank');
      }
      
      notification.close();
    };
    
    return notification;
  }
  
  async testNotification() {
    try {
      await this.showLocalNotification('${config.name} Test', {
        body: 'This is a test notification to verify everything is working!',
        icon: this.defaultIcon,
        badge: this.defaultBadge,
        tag: 'test-notification'
      });
      
      console.log('NotificationService: Test notification sent');
      return true;
    } catch (error) {
      console.error('NotificationService: Test notification failed', error);
      throw error;
    }
  }
  
  async requestTestPushNotification() {
    if (!this.subscription) {
      throw new Error('No push subscription available');
    }
    
    try {
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: this.subscription.toJSON()
        })
      });
      
      if (!response.ok) {
        throw new Error(\`Test push failed: \${response.status}\`);
      }
      
      console.log('NotificationService: Test push notification requested');
      return true;
    } catch (error) {
      console.error('NotificationService: Test push failed', error);
      throw error;
    }
  }
  
  async getNotificationHistory() {
    try {
      const response = await fetch('/api/notifications/history', {
        headers: {
          'Authorization': \`Bearer \${this.getAuthToken()}\`
        }
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      return [];
    } catch (error) {
      console.error('NotificationService: Failed to get notification history', error);
      return [];
    }
  }
  
  async updateNotificationPreferences(preferences) {
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${this.getAuthToken()}\`
        },
        body: JSON.stringify(preferences)
      });
      
      if (!response.ok) {
        throw new Error(\`Failed to update preferences: \${response.status}\`);
      }
      
      const result = await response.json();
      console.log('NotificationService: Preferences updated', result);
      
      return result;
    } catch (error) {
      console.error('NotificationService: Failed to update preferences', error);
      throw error;
    }
  }
  
  trackNotification(event, data = {}) {
    // Track notification events for analytics
    try {
      fetch('/api/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event,
          data: {
            ...data,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            app: '${config.name}'
          }
        })
      }).catch(() => {}); // Ignore analytics errors
    } catch (error) {
      // Ignore tracking errors
    }
  }
  
  getAuthToken() {
    // Get authentication token from storage or context
    return localStorage.getItem('auth-token') || '';
  }
  
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  }
  
  isSubscribed() {
    return this.subscription !== null;
  }
  
  getPermissionStatus() {
    return this.permission;
  }
  
  isSupported() {
    return this.isSupported;
  }
  
  async getBadgeCount() {
    if ('setAppBadge' in navigator) {
      // Badge API is supported
      return navigator.getAppBadge?.() || 0;
    }
    return 0;
  }
  
  async setBadgeCount(count) {
    if ('setAppBadge' in navigator) {
      try {
        if (count > 0) {
          await navigator.setAppBadge(count);
        } else {
          await navigator.clearAppBadge();
        }
        return true;
      } catch (error) {
        console.error('NotificationService: Failed to set badge', error);
      }
    }
    return false;
  }
  
  async clearBadge() {
    return this.setBadgeCount(0);
  }
}

// Initialize notification service
${config.notifications.enabled ? `
const notificationService = new NotificationService();
window.notificationService = notificationService;

// Auto-subscribe on first visit (optional)
document.addEventListener('DOMContentLoaded', () => {
  const autoSubscribe = localStorage.getItem('notification-auto-subscribe');
  if (autoSubscribe === null) {
    // Show subscription prompt after a delay
    setTimeout(() => {
      if (notificationService.permission === 'default') {
        showNotificationSubscriptionPrompt();
      }
    }, 5000); // 5 seconds delay
  }
});

function showNotificationSubscriptionPrompt() {
  const modal = document.createElement('div');
  modal.innerHTML = \`
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 400px; text-align: center;">
        <h3>Stay Updated</h3>
        <p>Get notified about important updates and new features in ${config.name}.</p>
        <div style="margin-top: 1rem;">
          <button id="enable-notifications" style="background: ${config.themeColor}; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; margin-right: 0.5rem;">Enable Notifications</button>
          <button id="maybe-later" style="background: #ccc; color: #333; border: none; padding: 0.5rem 1rem; border-radius: 4px;">Maybe Later</button>
        </div>
      </div>
    </div>
  \`;
  
  document.body.appendChild(modal);
  
  document.getElementById('enable-notifications').addEventListener('click', async () => {
    try {
      await notificationService.subscribe();
      localStorage.setItem('notification-auto-subscribe', 'accepted');
      document.body.removeChild(modal);
      notificationService.showLocalNotification('Welcome!', {
        body: 'You will now receive important updates from ${config.name}.',
        tag: 'welcome-notification'
      });
    } catch (error) {
      console.error('Subscription failed:', error);
      alert('Failed to enable notifications. Please try again.');
    }
  });
  
  document.getElementById('maybe-later').addEventListener('click', () => {
    localStorage.setItem('notification-auto-subscribe', 'declined');
    document.body.removeChild(modal);
  });
}

export default NotificationService;
` : `
console.log('NotificationService: Push notifications are disabled');
export default null;
`}
`;
}
