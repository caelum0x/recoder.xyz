// Unified authentication configuration for all Recoder products
import NextAuth, { NextAuthOptions, Session, User } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import DiscordProvider from 'next-auth/providers/discord';
import CredentialsProvider from 'next-auth/providers/credentials';
import { userDb, subscriptionDb, PlanType } from './database';
import { compare, hash } from 'bcryptjs';

// Extended types for our application
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      plan: PlanType;
      emailVerified: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
    plan: PlanType;
    emailVerified: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    plan: PlanType;
    emailVerified: boolean;
  }
}

// Shared NextAuth configuration
export const authOptions: NextAuthOptions = {
  providers: [
    // GitHub OAuth
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url || undefined,
          plan: 'FREE' as PlanType,
          emailVerified: true,
        };
      },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture || undefined,
          plan: 'FREE' as PlanType,
          emailVerified: Boolean(profile.email_verified),
        };
      },
    }),

    // Discord OAuth
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.id,
          name: profile.username,
          email: profile.email,
          image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : undefined,
          plan: 'FREE' as PlanType,
          emailVerified: Boolean(profile.verified),
        };
      },
    }),

    // Email/Password authentication
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' }, // 'signin' or 'signup'
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const { email, password, action, name } = credentials;

        try {
          if (action === 'signup') {
            // Sign up flow
            if (!name) {
              throw new Error('Name is required for signup');
            }

            // Check if user already exists
            const existingUser = await userDb.findByEmail(email);
            if (existingUser) {
              throw new Error('User already exists with this email');
            }

            // Hash password
            const hashedPassword = await hash(password, 12);

            // Create user
            const user = await userDb.create({
              email,
              name,
              avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
            });

            // Store password hash (you'll need to add this to userDb.create or update)
            // For now, we'll update the user with password hash
            await userDb.update(user.id, { password_hash: hashedPassword } as any);

            const plan = await subscriptionDb.getUserPlan(user.id);

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.avatar_url,
              plan,
              emailVerified: user.email_verified,
            };
          } else {
            // Sign in flow
            const user = await userDb.findByEmail(email);
            if (!user) {
              throw new Error('No user found with this email');
            }

            // Check password (you'll need to add password_hash to User type)
            const isValidPassword = await compare(password, (user as any).password_hash || '');
            if (!isValidPassword) {
              throw new Error('Invalid password');
            }

            // Update last login
            await userDb.updateLastLogin(user.id);

            const plan = await subscriptionDb.getUserPlan(user.id);

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.avatar_url,
              plan,
              emailVerified: user.email_verified,
            };
          }
        } catch (error) {
          console.error('Auth error:', error);
          throw error;
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      try {
        // For OAuth providers, create or update user
        if (account?.provider !== 'credentials') {
          let dbUser = await userDb.findByEmail(user.email);

          if (!dbUser) {
            // Create new user
            dbUser = await userDb.create({
              email: user.email,
              name: user.name || 'User',
              avatar_url: user.image,
              provider: account?.provider,
              provider_id: account?.providerAccountId,
            });
          } else {
            // Update existing user
            await userDb.update(dbUser.id, {
              name: user.name || dbUser.name,
              avatar_url: user.image || dbUser.avatar_url,
              last_login_at: new Date(),
            });
          }

          // Get current plan
          const plan = await subscriptionDb.getUserPlan(dbUser.id);
          user.id = dbUser.id;
          user.plan = plan;
          user.emailVerified = dbUser.email_verified;
        }

        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
        return false;
      }
    },

    async jwt({ token, user, trigger, session }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.plan = user.plan;
        token.emailVerified = Boolean(user.emailVerified);
      }

      // Update session (when user updates profile, plan changes, etc.)
      if (trigger === 'update' && session) {
        // Refresh user data from database
        if (token.email) {
          const dbUser = await userDb.findByEmail(token.email);
          if (dbUser) {
            const plan = await subscriptionDb.getUserPlan(dbUser.id);
            token.name = dbUser.name;
            token.picture = dbUser.avatar_url;
            token.plan = plan;
            token.emailVerified = dbUser.email_verified;
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.plan = token.plan;
        session.user.emailVerified = token.emailVerified;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Handle cross-domain redirects for our different products
      const recoderDomains = [
        'recoder.xyz',
        'web.recoder.xyz',
        'chat.recoder.xyz',
        'cli.recoder.xyz',
      ];

      try {
        const redirectUrl = new URL(url);
        
        // Allow redirects to our own domains
        if (recoderDomains.some(domain => redirectUrl.hostname.includes(domain))) {
          return url;
        }
        
        // Default to base URL
        return baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,

  debug: process.env.NODE_ENV === 'development',
};

// Create NextAuth handler
export default NextAuth(authOptions);

// Server-side auth function for API routes
export async function auth() {
  // For development, return a mock session
  if (process.env.NODE_ENV === 'development') {
    return {
      user: {
        id: 'dev-user-123',
        email: 'dev@recoder.xyz',
        name: 'Dev User',
        plan: 'FREE' as PlanType,
        emailVerified: true,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  
  // In production, implement proper session validation
  return null;
}

// Helper functions for authentication
export const authHelpers = {
  // Get user session on server-side
  async getServerSession(req: any, res: any) {
    return await NextAuth(req, res, authOptions);
  },

  // Check if user has required plan
  hasAccess(userPlan: PlanType, requiredPlan: PlanType): boolean {
    const planHierarchy = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
    return planHierarchy[userPlan] >= planHierarchy[requiredPlan];
  },

  // Generate API key for user (for CLI and extension)
  generateApiKey(userId: string): string {
    const timestamp = Date.now().toString();
    const randomBytes = Math.random().toString(36).substring(2);
    return `rcdr_${userId.substring(0, 8)}_${timestamp}_${randomBytes}`;
  },

  // Validate API key format
  validateApiKeyFormat(apiKey: string): boolean {
    return /^rcdr_[a-f0-9]{8}_\d+_[a-z0-9]+$/.test(apiKey);
  },
};

// Middleware for API routes
export function withAuth(handler: any, options: { requiredPlan?: PlanType } = {}) {
  return async (req: any, res: any) => {
    try {
      // Check for API key in headers
      const apiKey = req.headers.authorization?.replace('Bearer ', '');
      if (apiKey && authHelpers.validateApiKeyFormat(apiKey)) {
        // TODO: Validate API key against database
        // For now, extract user ID from API key
        const userId = apiKey.split('_')[1];
        req.user = { id: userId }; // Simplified for now
      } else {
        // Check for session
        const session = await NextAuth(req, res, authOptions);
        if (!session?.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        req.user = session.user;
      }

      // Check plan access
      if (options.requiredPlan && !authHelpers.hasAccess(req.user.plan, options.requiredPlan)) {
        return res.status(403).json({ error: 'Insufficient plan access' });
      }

      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// React hook for client-side auth
export { useSession, signIn, signOut } from 'next-auth/react';