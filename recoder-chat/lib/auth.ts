/**
 * NextAuth Configuration for Recoder Chat Platform
 * 
 * Provides secure authentication with unified Recoder database,
 * chat-specific usage tracking, and subscription integration.
 */

import { DefaultSession, NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord"; 
import CredentialsProvider from "next-auth/providers/credentials";
import { userDb, subscriptionDb, usageDb, chatDb, PlanType } from "../../lib/database";
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
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    plan: PlanType;
    emailVerified: boolean;
    username?: string;
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
          image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
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
    signIn: "/signin",
    signUp: "/signup",
    error: "/error",
    verifyRequest: "/verify-request",
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
        token.emailVerified = user.emailVerified;
        token.username = user.username;
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
        
        // Default to chat
        return baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`User ${user.email} signed in to chat via ${account?.provider}`, { isNewUser });
      
      // Track chat platform usage
      if (user.id) {
        await usageDb.logUsage({
          user_id: user.id,
          product: 'chat',
          action: 'signin',
          metadata: { provider: account?.provider, isNewUser },
        });
      }
    },
    
    async signOut({ session, token }) {
      console.log(`User ${session?.user?.email} signed out from chat`);
      
      if (session?.user?.id) {
        await usageDb.logUsage({
          user_id: session.user.id,
          product: 'chat',
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

// Chat-specific auth helpers
export const chatAuthHelpers = {
  // Check if user can send messages
  async canSendMessage(userId: string): Promise<boolean> {
    const limit = await usageDb.checkUsageLimit(userId, 'chat', 'messages_per_day');
    return limit.canUse;
  },

  // Check if user can create conversations
  async canCreateConversation(userId: string): Promise<boolean> {
    const conversations = await chatDb.getUserConversations(userId);
    const limit = await usageDb.getUserLimit(userId, 'chat', 'conversations_max');
    return limit === -1 || conversations.length < limit;
  },

  // Track chat usage
  async trackChatUsage(userId: string, action: string, metadata?: Record<string, any>) {
    await usageDb.logUsage({
      user_id: userId,
      product: 'chat',
      action,
      resource_type: 'chat_action',
      metadata,
    });
  },

  // Get user's message stats
  async getMessageStats(userId: string) {
    const todayUsage = await usageDb.getUserUsage(userId, 'chat', 1);
    const monthlyUsage = await usageDb.getUserUsage(userId, 'chat', 30);
    const dailyLimit = await usageDb.getUserLimit(userId, 'chat', 'messages_per_day');
    
    return {
      todayUsage,
      monthlyUsage,
      dailyLimit,
      dailyRemaining: dailyLimit === -1 ? Infinity : Math.max(0, dailyLimit - todayUsage),
      canSendMessage: dailyLimit === -1 || todayUsage < dailyLimit,
    };
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
      // For chat platform, we'll use session-based auth
      const session = await import('next-auth').then(mod => mod.getServerSession(req, res, authOptions));
      
      if (!session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      req.user = session.user;

      // Check plan access
      if (options.requiredPlan && !chatAuthHelpers.hasAccess(req.user.plan, options.requiredPlan)) {
        return res.status(403).json({ error: 'Insufficient plan access' });
      }

      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}