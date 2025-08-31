import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';

export interface RecoderUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  provider: string;
  accessToken?: string;
  createdAt: string;
}

export interface RecoderSession {
  user: RecoderUser;
  expires: string;
}

const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt' as const,
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user, account }: any) {
      if (user) {
        token.userId = user.id || user.email; // Use email as fallback ID
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
        token.createdAt = new Date().toISOString();
      }
      if (account) {
        token.provider = account.provider;
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user = {
          id: token.userId as string,
          email: token.email as string,
          name: token.name as string,
          image: token.image as string,
          provider: token.provider as string,
          accessToken: token.accessToken as string,
          createdAt: token.createdAt as string,
        };
      }
      return session;
    },
  },
};

export const createAuth = (options: { baseUrl?: string } = {}) => {
  return NextAuth({
    ...authConfig,
  });
};

// Default export for main app
export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = createAuth();
