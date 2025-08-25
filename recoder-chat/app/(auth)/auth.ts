import { compare } from 'bcryptjs';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { createGuestUser, getUser, db } from '@/lib/db/queries';
import { authConfig } from './auth.config';
import { DUMMY_PASSWORD } from '@/lib/constants';
import type { DefaultJWT } from 'next-auth/jwt';

export type UserType = 'guest' | 'regular';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // GitHub({
    //   clientId: process.env.GITHUB_ID!,
    //   clientSecret: process.env.GITHUB_SECRET!,
    // }),
    Credentials({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize({ email, password }: any) {
        try {
          const users = await getUser(email);

          if (users.length === 0) {
            await compare(password, DUMMY_PASSWORD);
            return null;
          }

          const [user] = users;

          if (!user.password) {
            await compare(password, DUMMY_PASSWORD);
            return null;
          }

          const passwordsMatch = await compare(password, user.password);

          if (!passwordsMatch) return null;

          return { 
            id: user.id, 
            email: user.email, 
            name: user.email,
            type: 'regular' 
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
    Credentials({
      id: 'guest',
      name: 'guest',
      credentials: {},
      async authorize() {
        try {
          const [guestUser] = await createGuestUser();
          return { 
            id: guestUser.id, 
            email: guestUser.email, 
            name: guestUser.email,
            type: 'guest' 
          };
        } catch (error) {
          console.error('Guest user creation error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id as string;
        // Set type based on account provider or existing user type
        if (account?.provider === 'google' || account?.provider === 'github') {
          token.type = 'regular';
        } else {
          token.type = user.type || 'regular';
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Allow OAuth sign-ins - the DrizzleAdapter will handle user creation
      if (account?.provider === 'google' || account?.provider === 'github') {
        // Set user type for OAuth users
        if (user) {
          user.type = 'regular';
        }
        return true;
      }
      // Allow credentials sign-ins
      if (account?.provider === 'credentials') {
        return true;
      }
      return true;
    },
  },
});
