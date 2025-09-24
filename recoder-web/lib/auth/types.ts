/**
 * Shared authentication types
 * Safe to import in both client and server code
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  plan?: 'FREE' | 'PRO' | 'ENTERPRISE';
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  requires2FA?: boolean;
}

export interface AuthSession {
  user: AuthUser;
  expires: string;
  sessionToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
}