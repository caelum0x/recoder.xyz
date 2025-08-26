// Unified session synchronization - copied from main site
import jwt from 'jsonwebtoken';

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  image?: string;
  plan: string;
  expiresAt: number;
  domains: string[];
}

export class UnifiedSessionSync {
  private static instance: UnifiedSessionSync;
  private readonly SYNC_SECRET = process.env.SESSION_SYNC_SECRET || process.env.NEXTAUTH_SECRET;

  static getInstance(): UnifiedSessionSync {
    if (!UnifiedSessionSync.instance) {
      UnifiedSessionSync.instance = new UnifiedSessionSync();
    }
    return UnifiedSessionSync.instance;
  }

  // Validate sync token using same logic as main site
  validateSyncToken(token: string): { isValid: boolean; data?: SessionData } {
    try {
      console.log('UnifiedSessionSync validation attempt:', {
        tokenPresent: !!token,
        secretPresent: !!this.SYNC_SECRET,
        secretLength: this.SYNC_SECRET?.length,
        timestamp: Date.now()
      });

      const decoded = jwt.verify(token, this.SYNC_SECRET!, {
        issuer: 'recoder.xyz',
        audience: 'recoder-products'
      }) as any;
      
      console.log('UnifiedSessionSync validation successful:', {
        userId: decoded.userId,
        email: decoded.email,
        issuer: decoded.iss,
        audience: decoded.aud
      });

      return {
        isValid: true,
        data: {
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          image: decoded.image,
          plan: decoded.plan,
          expiresAt: decoded.exp * 1000,
          domains: decoded.domains || []
        }
      };
    } catch (error) {
      console.error('UnifiedSessionSync validation failed:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        tokenLength: token ? token.length : 0,
        secretPresent: !!this.SYNC_SECRET
      });
      return { isValid: false };
    }
  }
}