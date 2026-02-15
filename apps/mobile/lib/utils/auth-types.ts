export type AuthChangeEvent = string;

export type AuthUserMetadata = Record<string, any>;

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
  [key: string]: any;
}

export interface AuthSession {
  access_token?: string;
  refresh_token?: string;
  user: AuthUser | null;
  [key: string]: any;
}

/**
 * Authentication state
 */
export interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Sign in with email credentials
 */
export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Sign up with email credentials
 */
export interface SignUpCredentials {
  email: string;
  password: string;
  fullName?: string;
}

/**
 * OAuth provider types
 */
export type OAuthProvider = 'google' | 'github' | 'apple';

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Auth error types
 */
export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthActionResult<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: AuthError | { message: string; status?: number };
}
