/**
 * Authentication utilities
 */

import chalk from 'chalk';
import { Logger } from '../../../shared/src/logger';
import { ConfigManager } from './config';

/**
 * Check if user is authenticated and throw error if not
 */
export async function requireAuth(): Promise<void> {
  if (!ConfigManager.isAuthenticated()) {
    console.log(chalk.red('❌ Authentication required'));
    console.log(chalk.yellow('Please login first: ') + chalk.cyan('recoder auth login'));
    
    const user = ConfigManager.getCurrentUser();
    if (user) {
      console.log(chalk.gray(`Previous session expired for: ${user.email}`));
    }
    
    throw new Error('Authentication required');
  }
}

/**
 * Check authentication status without throwing
 */
export function checkAuth(): boolean {
  return ConfigManager.isAuthenticated();
}

/**
 * Get current authentication token
 */
export function getAuthToken(): string | null {
  return ConfigManager.getAuthToken();
}

/**
 * Get current user information
 */
export function getCurrentUser(): any {
  return ConfigManager.getCurrentUser();
}

/**
 * Check if token is expired or about to expire
 */
export function isTokenExpiring(hoursThreshold: number = 1): boolean {
  const expiresAt = ConfigManager.get('auth.expiresAt');
  if (!expiresAt) return false;
  
  const expirationTime = new Date(expiresAt).getTime();
  const currentTime = Date.now();
  const thresholdTime = hoursThreshold * 60 * 60 * 1000; // Convert hours to milliseconds
  
  return (expirationTime - currentTime) < thresholdTime;
}

/**
 * Validate authentication and show appropriate messages
 */
export async function validateAuth(): Promise<{ valid: boolean; user?: any; message?: string }> {
  try {
    if (!ConfigManager.isAuthenticated()) {
      return {
        valid: false,
        message: 'Not authenticated. Please run "recoder auth login"',
      };
    }

    const user = ConfigManager.getCurrentUser();
    const token = ConfigManager.getAuthToken();

    if (!user || !token) {
      return {
        valid: false,
        message: 'Invalid authentication data. Please login again.',
      };
    }

    // Check if token is about to expire
    if (isTokenExpiring(24)) { // 24 hours
      Logger.warn('Authentication token expires soon. Consider refreshing.');
    }

    return {
      valid: true,
      user,
      message: `Authenticated as ${user.name} (${user.email})`,
    };
  } catch (error) {
    return {
      valid: false,
      message: `Authentication validation failed: ${error}`,
    };
  }
}

/**
 * Clear authentication data
 */
export function clearAuth(): void {
  ConfigManager.clearAuth();
}

/**
 * Set authentication data
 */
export function setAuthData(token: string, user: any, expiresAt?: string): void {
  ConfigManager.setAuthData(token, user, expiresAt);
}

/**
 * Get authentication headers for API requests
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  
  if (!token) {
    return {};
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Handle authentication errors
 */
export function handleAuthError(error: any): void {
  if (error.response?.status === 401 || error.response?.status === 403) {
    console.log(chalk.red('❌ Authentication failed or expired'));
    console.log(chalk.yellow('Please login again: ') + chalk.cyan('recoder auth login'));
    clearAuth();
  } else {
    Logger.error(`Authentication error: ${error.message || error}`);
  }
}

/**
 * Refresh authentication token if needed
 */
export async function refreshAuthIfNeeded(): Promise<boolean> {
  if (!ConfigManager.isAuthenticated()) {
    return false;
  }

  if (!isTokenExpiring(1)) { // Only refresh if expiring within 1 hour
    return true;
  }

  const refreshToken = ConfigManager.get('auth.refreshToken');
  if (!refreshToken) {
    console.log(chalk.yellow('⚠️  Token expires soon and no refresh token available'));
    console.log(chalk.gray('Please login again when prompted'));
    return true; // Continue for now
  }

  try {
    // This would typically call the refresh token endpoint
    // For now, we'll just warn the user
    console.log(chalk.yellow('⚠️  Authentication token expires soon'));
    console.log(chalk.gray('Automatic refresh will be implemented in a future version'));
    return true;
  } catch (error) {
    Logger.error(`Token refresh failed: ${error}`);
    return false;
  }
}

/**
 * Get user permissions/roles
 */
export function getUserPermissions(): string[] {
  const user = getCurrentUser();
  return user?.permissions || user?.roles || [];
}

/**
 * Check if user has specific permission
 */
export function hasPermission(permission: string): boolean {
  const permissions = getUserPermissions();
  return permissions.includes(permission) || permissions.includes('admin');
}

/**
 * Get user plan information
 */
export function getUserPlan(): string {
  const user = getCurrentUser();
  return user?.plan || 'free';
}

/**
 * Check if user is on a specific plan or higher
 */
export function hasMinimumPlan(requiredPlan: string): boolean {
  const currentPlan = getUserPlan();
  const planHierarchy = ['free', 'pro', 'team', 'enterprise'];
  
  const currentIndex = planHierarchy.indexOf(currentPlan);
  const requiredIndex = planHierarchy.indexOf(requiredPlan);
  
  return currentIndex >= requiredIndex;
}

/**
 * Display current authentication status
 */
export function displayAuthStatus(): void {
  const authValid = checkAuth();
  
  if (authValid) {
    const user = getCurrentUser();
    console.log(chalk.green('✅ Authenticated'));
    console.log(chalk.gray(`User: ${user.name} (${user.email})`));
    console.log(chalk.gray(`Plan: ${getUserPlan()}`));
    
    if (isTokenExpiring(24)) {
      console.log(chalk.yellow('⚠️  Token expires within 24 hours'));
    }
  } else {
    console.log(chalk.red('❌ Not authenticated'));
    console.log(chalk.gray('Run "recoder auth login" to authenticate'));
  }
}