/**
 * NextAuth Configuration for Recoder Web Platform
 * 
 * Provides secure authentication with GitHub and Google OAuth,
 * user session management, and database integration.
 */

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { getPrisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(getPrisma()) as any,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
          username: profile.login,
          bio: profile.bio,
          location: profile.location,
          company: profile.company,
          blog: profile.blog,
          publicRepos: profile.public_repos,
          followers: profile.followers,
          following: profile.following,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          username: profile.email?.split('@')[0],
          emailVerified: profile.email_verified,
          locale: profile.locale,
        };
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Persist additional user data in the token
      if (user) {
        token.username = user.username;
        token.bio = user.bio;
        token.location = user.location;
        token.company = user.company;
        token.blog = user.blog;
        token.publicRepos = user.publicRepos;
        token.followers = user.followers;
        token.following = user.following;
      }
      
      // Store OAuth account information
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      
      return token;
    },
    async session({ session, token, user }) {
      // Send properties to the client
      if (session.user) {
        session.user.id = token.sub || user?.id;
        session.user.username = token.username || user?.username;
        session.user.bio = token.bio || user?.bio;
        session.user.location = token.location || user?.location;
        session.user.company = token.company || user?.company;
        session.user.blog = token.blog || user?.blog;
        session.user.publicRepos = token.publicRepos || user?.publicRepos;
        session.user.followers = token.followers || user?.followers;
        session.user.following = token.following || user?.following;
        session.accessToken = token.accessToken;
        session.provider = token.provider;
      }
      
      return session;
    },
    async signIn({ user, account, profile, email, credentials }) {
      // Allow sign in
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`User ${user.email} signed in via ${account?.provider}`, { isNewUser });
      
      // Track user sign-in analytics
      if (process.env.NODE_ENV === 'production') {
        // Add analytics tracking here
      }
    },
    async signOut({ session, token }) {
      console.log(`User ${session?.user?.email} signed out`);
    },
    async createUser({ user }) {
      console.log(`New user created: ${user.email}`);
      
      // Initialize user preferences and settings
      const prisma = getPrisma();
      try {
        await prisma.userSettings.create({
          data: {
            userId: user.id,
            preferences: {
              theme: 'light',
              defaultModel: 'claude-3-5-sonnet-20241022',
              codeStyle: 'typescript',
              enableSmartRouting: true,
              enableRealCode: true,
            },
            limits: {
              dailyGenerations: 100,
              monthlyGenerations: 3000,
              concurrentChats: 5,
            },
          },
        });
      } catch (error) {
        console.error('Failed to create user settings:', error);
      }
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

// Helper functions for server-side auth
export { authOptions as auth };

// Type extensions for NextAuth
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username?: string;
      bio?: string;
      location?: string;
      company?: string;
      blog?: string;
      publicRepos?: number;
      followers?: number;
      following?: number;
    } & DefaultSession["user"];
    accessToken?: string;
    provider?: string;
  }

  interface User {
    username?: string;
    bio?: string;
    location?: string;
    company?: string;
    blog?: string;
    publicRepos?: number;
    followers?: number;
    following?: number;
    emailVerified?: boolean;
    locale?: string;
  }

  interface JWT {
    username?: string;
    bio?: string;
    location?: string;
    company?: string;
    blog?: string;
    publicRepos?: number;
    followers?: number;
    following?: number;
    accessToken?: string;
    provider?: string;
  }
}