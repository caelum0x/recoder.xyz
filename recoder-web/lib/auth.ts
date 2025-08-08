/**
 * NextAuth Configuration for Recoder Web Platform
 * 
 * Provides secure authentication with unified Recoder database,
 * cross-domain session management, and subscription integration.
 */

import { DefaultSession, NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord"; 
import CredentialsProvider from "next-auth/providers/credentials";
import { userDb, subscriptionDb, usageDb, PlanType } from "./database";
import { compare, hash } from 'bcryptjs';

// Extended types for our unified application
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      plan: PlanType;
      emailVerified: boolean;
      username?: string;
      bio?: string;
      location?: string;
      company?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
    plan: PlanType;
    emailVerified: boolean;
    username?: string;
    bio?: string;
    location?: string;
    company?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    plan: PlanType;
    emailVerified: boolean;
    username?: string;
    bio?: string;
    location?: string;
    company?: string;
  }
}

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
          image: profile.avatar_url,
          plan: 'FREE' as PlanType,
          emailVerified: true,
          username: profile.login,
          bio: profile.bio,
          location: profile.location,
          company: profile.company,
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
          image: profile.picture,
          plan: 'FREE' as PlanType,
          emailVerified: profile.email_verified,
          username: profile.email?.split('@')[0],
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
          emailVerified: profile.verified,
          username: profile.username,
        };
      },
    }),

    // Email/Password authentication
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const { email, password, action, name } = credentials;

        try {
          if (action === 'signup') {
            if (!name) throw new Error('Name is required for signup');

            const existingUser = await userDb.findByEmail(email);
            if (existingUser) throw new Error('User already exists');

            const hashedPassword = await hash(password, 12);
            const user = await userDb.create({
              email,
              name,
              avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
            });

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
            const user = await userDb.findByEmail(email);
            if (!user) throw new Error('No user found');

            const isValidPassword = await compare(password, (user as any).password_hash || '');
            if (!isValidPassword) throw new Error('Invalid password');

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
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
    newUser: "/onboarding",
  },
  
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
        token.emailVerified = !!user.emailVerified;
        token.username = user.username;
        token.bio = user.bio;
        token.location = user.location;
        token.company = user.company;
      }

      // Update session (when user updates profile, plan changes, etc.)
      if (trigger === 'update' && session) {
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
        session.user.username = token.username;
        session.user.bio = token.bio;
        session.user.location = token.location;
        session.user.company = token.company;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Handle cross-domain redirects for Recoder products
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
        
        // Allow relative URLs
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        
        // Default to dashboard
        return `${baseUrl}/dashboard`;
      } catch {
        return `${baseUrl}/dashboard`;
      }
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`User ${user.email} signed in via ${account?.provider}`, { isNewUser });
      
      // Track web platform usage
      if (user.id) {
        await usageDb.logUsage({
          user_id: user.id,
          product: 'web',
          action: 'signin',
          metadata: { provider: account?.provider, isNewUser },
        });
      }
    },
    
    async signOut({ session, token }) {
      console.log(`User ${session?.user?.email} signed out`);
      
      if (session?.user?.id) {
        await usageDb.logUsage({
          user_id: session.user.id,
          product: 'web',
          action: 'signout',
        });
      }
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

// Web-specific auth helpers
export const webAuthHelpers = {
  // Check if user can create new project
  async canCreateProject(userId: string): Promise<boolean> {
    const limit = await usageDb.checkUsageLimit(userId, 'web', 'projects_max');
    return limit.canUse;
  },

  // Check if user can upload files
  async canUploadFile(userId: string, fileSizeMB: number): Promise<boolean> {
    const storageLimit = await usageDb.checkUsageLimit(userId, 'web', 'storage_mb');
    return storageLimit.remaining >= fileSizeMB;
  },

  // Track web platform usage
  async trackWebUsage(userId: string, action: string, metadata?: Record<string, any>) {
    await usageDb.logUsage({
      user_id: userId,
      product: 'web',
      action,
      resource_type: 'web_action',
      metadata,
    });
  },

  // Check plan access
  hasAccess(userPlan: PlanType, requiredPlan: PlanType): boolean {
    const planHierarchy = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
    return planHierarchy[userPlan] >= planHierarchy[requiredPlan];
  },
};

// Middleware for API routes
export function withAuth(handler: any, options: { requiredPlan?: PlanType } = {}) {
  return async (req: any, res: any) => {
    try {
      // For web platform, we'll use session-based auth
      const session = await import('next-auth').then(mod => mod.getServerSession(req, res, authOptions));
      
      if (!session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      req.user = session.user;

      // Check plan access
      if (options.requiredPlan && !webAuthHelpers.hasAccess(req.user.plan, options.requiredPlan)) {
        return res.status(403).json({ error: 'Insufficient plan access' });
      }

      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}