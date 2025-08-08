/**
 * Authentication stub for client-side builds
 * This provides type-safe auth interfaces without importing NextAuth
 */

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  emailVerified: boolean;
  username?: string;
  bio?: string;
  location?: string;
  company?: string;
}

export interface Session {
  user: User;
  expires: string;
}

export interface AuthOptions {
  providers: any[];
  pages: any;
  callbacks: any;
  events: any;
  session: any;
  secret: string;
  debug: boolean;
}

// Stub functions that throw errors in client-side usage
export const authOptions: AuthOptions = {
  providers: [],
  pages: {},
  callbacks: {},
  events: {},
  session: {},
  secret: '',
  debug: false
};

export const webAuthHelpers = {
  canCreateProject: async (userId: string) => false,
  canUploadFile: async (userId: string, fileSizeMB: number) => false,
  trackWebUsage: async (userId: string, action: string, metadata?: any) => {},
  hasAccess: (userPlan: any, requiredPlan: any) => false,
};

export function withAuth(handler: any, options: any = {}) {
  return async (req: any, res: any) => {
    throw new Error('withAuth is not available in client-side builds');
  };
}