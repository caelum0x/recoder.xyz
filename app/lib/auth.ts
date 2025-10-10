import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';

// Determine which Google OAuth credentials to use based on environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.includes('recoder.xyz');
const googleClientId = isProduction 
  ? process.env.GOOGLE_CLIENT_ID 
  : (process.env.GOOGLE_CLIENT_ID_LOCAL || process.env.GOOGLE_CLIENT_ID);
const googleClientSecret = isProduction
  ? process.env.GOOGLE_CLIENT_SECRET
  : (process.env.GOOGLE_CLIENT_SECRET_LOCAL || process.env.GOOGLE_CLIENT_SECRET);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: googleClientId || '',
      clientSecret: googleClientSecret || '',
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // TODO: Replace with actual user authentication
        // For now, accept any credentials for development
        const user = {
          id: '1',
          email: credentials.email,
          name: credentials.email.split('@')[0],
          image: null,
        };

        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          userId: user.id,
        };
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken,
        userId: token.userId,
        user: {
          ...session.user,
          id: token.userId as string,
        },
      };
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-development',
};