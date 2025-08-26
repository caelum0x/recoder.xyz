// Authentication synchronization for Production Engine
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

interface SessionData {
  userId: string;
  email: string;
  name: string;
  plan: string;
  expiresAt: number;
  domains: string[];
}

// Session sync manager for Production Engine
class ProductionEngineSessionSync {
  private readonly SYNC_SECRET = process.env.SESSION_SYNC_SECRET || process.env.NEXTAUTH_SECRET;
  private readonly SYNC_COOKIE_NAME = 'recoder-session-sync';
  private readonly COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

  // Validate sync token
  validateSyncToken(token: string): { isValid: boolean; data?: SessionData } {
    try {
      console.log('Production Engine JWT validation attempt:', {
        tokenPresent: !!token,
        secretPresent: !!this.SYNC_SECRET,
        timestamp: Date.now()
      });

      const decoded = jwt.verify(token, this.SYNC_SECRET!, {
        issuer: 'recoder.xyz',
        audience: 'recoder-products'
      }) as any;
      
      console.log('Production Engine JWT validation successful:', {
        userId: decoded.userId,
        email: decoded.email
      });

      return {
        isValid: true,
        data: {
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          plan: decoded.plan,
          expiresAt: decoded.exp * 1000,
          domains: decoded.domains || []
        }
      };
    } catch (error) {
      console.error('Production Engine JWT validation failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenLength: token ? token.length : 0
      });
      return { isValid: false };
    }
  }
}

const sessionSync = new ProductionEngineSessionSync();

// GET /api/auth/sync - Handle session sync URL with token parameter
router.get('/sync', (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({
        synced: false,
        error: 'No sync token provided',
        timestamp: Date.now()
      });
    }

    const validation = sessionSync.validateSyncToken(token);
    
    if (validation.isValid && validation.data) {
      // Set session cookie for production engine
      res.cookie('production_engine_session', JSON.stringify({
        userId: validation.data.userId,
        email: validation.data.email,
        name: validation.data.name,
        plan: validation.data.plan,
        authenticated: true,
        expiresAt: validation.data.expiresAt
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Redirect to production engine dashboard
      return res.redirect('/');
    }

    return res.status(401).json({
      synced: false,
      error: 'Invalid sync token',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Production Engine sync error:', error);
    return res.status(500).json({
      synced: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

// POST /api/auth/sync - Handle session sync from other platforms
router.post('/sync', (req: Request, res: Response) => {
  try {
    const { action, sessionData } = req.body;
    
    if (action === 'sync_session' && sessionData) {
      // Set session cookie
      res.cookie('production_engine_session', JSON.stringify({
        userId: sessionData.userId,
        email: sessionData.email,
        name: sessionData.name,
        plan: sessionData.plan,
        authenticated: true,
        expiresAt: sessionData.expiresAt
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.json({
        success: true,
        message: 'Production Engine session sync completed',
        timestamp: Date.now()
      });
    }

    return res.status(400).json({
      error: 'Invalid sync action',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Production Engine sync error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

// DELETE /api/auth/sync - Handle logout
router.delete('/sync', (req: Request, res: Response) => {
  try {
    // Clear session cookie
    res.clearCookie('production_engine_session');
    
    return res.json({
      success: true,
      action: 'logout',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Production Engine logout error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

export default router;