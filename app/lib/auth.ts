import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './prisma';
import { verifyPassword } from './crypto';
import { sendWelcomeEmail } from './email';
import crypto from 'crypto';

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
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
      authorization: {
        params: {
          scope: 'read:user user:email'
        }
      }
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing email or password');
        }

        try {
          // Find user in database
          const user = await prisma.users.findUnique({
            where: { email: credentials.email }
          });

          if (!user || !user.password) {
            throw new Error('Invalid email or password');
          }

          // Verify password
          const isValid = await verifyPassword(credentials.password, user.password);
          if (!isValid) {
            throw new Error('Invalid email or password');
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image || null,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        try {
          // Check if user exists
          const existingUser = await prisma.users.findUnique({
            where: { email: user.email! }
          });

          if (!existingUser) {
            // Create new user from OAuth
            const newUser = await prisma.users.create({
              data: {
                id: crypto.randomUUID(),
                email: user.email!,
                name: user.name || user.email!.split('@')[0],
                image: user.image,
                emailVerified: true, // OAuth emails are pre-verified
                subscriptionPlan: 'free',
                subscriptionStatus: 'active',
                updatedAt: new Date()
              }
            });

            // Create initial quota
            const now = new Date();
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            
            await prisma.user_quota.create({
              data: {
                userId: newUser.id,
                sessionsPerDay: 6,
                sessionsUsedToday: 0,
                tokensPerSession: 10000,
                periodStart: now,
                periodEnd: endOfDay,
                lastResetAt: now,
              },
            });

            // Send welcome email (non-blocking)
            sendWelcomeEmail(newUser.email, newUser.name).catch(err => 
              console.error('Failed to send welcome email:', err)
            );
          }

          return true;
        } catch (error) {
          console.error('OAuth sign in error:', error);
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        // Fetch full user data from database
        const dbUser = await prisma.users.findUnique({
          where: { email: user.email! }
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.plan = dbUser.plan;
          token.subscriptionStatus = dbUser.subscriptionStatus;
        }
      }

      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }

      // Handle token refresh
      if (trigger === 'update') {
        const dbUser = await prisma.users.findUnique({
          where: { email: token.email as string }
        });
        if (dbUser) {
          token.plan = dbUser.plan;
          token.subscriptionStatus = dbUser.subscriptionStatus;
        }
      }

      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.userId as string,
          email: token.email as string,
          name: token.name as string,
        },
        accessToken: token.accessToken,
        plan: token.plan,
        subscriptionStatus: token.subscriptionStatus,
      };
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (isNewUser) {
        console.log(`New user signed in: ${user.email} via ${account?.provider}`);
      }
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};