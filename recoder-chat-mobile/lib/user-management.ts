/**
 * Mobile User Management
 * Handles user authentication and profile management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserPreferences } from './types';
import { sessionSync } from './session-sync';

class UserManager {
  private apiEndpoint = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

  async login(email: string, password: string): Promise<User | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      
      // Save session
      await sessionSync.saveSession({
        token: data.token,
        user: data.user,
        expiresAt: data.expiresAt
      });

      return data.user;
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await sessionSync.clearSession();
      await this.clearUserData();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const session = await sessionSync.loadSession();
      if (!session?.user) return null;

      // Check if session is still valid
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        await this.logout();
        return null;
      }

      return session.user;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  async updateProfile(updates: Partial<User>): Promise<User | null> {
    try {
      const session = await sessionSync.loadSession();
      if (!session?.token) {
        throw new Error('No valid session');
      }

      const response = await fetch(`${this.apiEndpoint}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Profile update failed');
      }

      const updatedUser = await response.json();
      
      // Update session
      await sessionSync.saveSession({
        ...session,
        user: updatedUser
      });

      return updatedUser;
    } catch (error) {
      console.error('Profile update failed:', error);
      return null;
    }
  }

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<void> {
    try {
      const current = await this.getPreferences();
      const updated = { ...current, ...preferences };
      
      await AsyncStorage.setItem('user_preferences', JSON.stringify(updated));
      
      // Sync to cloud if logged in
      const user = await this.getCurrentUser();
      if (user) {
        await sessionSync.syncToCloud({ preferences: updated });
      }
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  }

  async getPreferences(): Promise<UserPreferences> {
    try {
      const stored = await AsyncStorage.getItem('user_preferences');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to get preferences:', error);
    }

    // Default preferences
    return {
      theme: 'system',
      language: 'en',
      notifications: true,
      localAI: true,
      preferredModels: ['qwen2.5-coder:7b']
    };
  }

  async register(name: string, email: string, password: string): Promise<User | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, password })
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const data = await response.json();
      
      // Save session
      await sessionSync.saveSession({
        token: data.token,
        user: data.user,
        expiresAt: data.expiresAt
      });

      return data.user;
    } catch (error) {
      console.error('Registration failed:', error);
      return null;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  private async clearUserData(): Promise<void> {
    const keys = [
      'user_preferences',
      'chat_history',
      'projects',
      'agents'
    ];

    await Promise.all(keys.map(key => AsyncStorage.removeItem(key)));
  }
}

export const userManager = new UserManager();
export default userManager;