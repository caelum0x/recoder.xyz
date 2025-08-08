/**
 * Client-side authentication utilities
 * Safe to import in client components
 */

import type { AuthSession, LoginCredentials, RegisterData } from './types';

// Auth API routes helpers
export class AuthAPI {
  private static readonly BASE_URL = '/api/auth';

  static async login(credentials: LoginCredentials): Promise<AuthSession> {
    const response = await fetch(`${this.BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Login failed');
    }

    return response.json();
  }

  static async register(data: RegisterData): Promise<AuthSession> {
    const response = await fetch(`${this.BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Registration failed');
    }

    return response.json();
  }

  static async logout(): Promise<void> {
    await fetch(`${this.BASE_URL}/logout`, {
      method: 'POST'
    });
    
    // Redirect to login
    window.location.href = '/login';
  }

  static async getSession(): Promise<AuthSession | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/session`);
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }
}

export default AuthAPI;