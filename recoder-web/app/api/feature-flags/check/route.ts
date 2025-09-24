// Feature Flag Check API - Client-side feature flag evaluation
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for feature flag checks
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const checkFlagsSchema = z.object({
  flags: z.array(z.string()).min(1),
  userId: z.string().optional(),
  context: z.record(z.any()).optional(),
});

// POST - Check multiple feature flags for a user
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 200, 'feature-flags-check');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    const body = await request.json();
    const { flags, userId, context } = checkFlagsSchema.parse(body);

    const effectiveUserId = userId || session?.user?.id;

    // Get feature flags
    const featureFlags = await prisma.featureFlag.findMany({
      where: {
        key: { in: flags },
        enabled: true
      }
    });

    const flagResults: Record<string, boolean> = {};
    const now = new Date();

    for (const flagName of flags) {
      const flag = featureFlags.find(f => f.key === flagName);
      
      if (!flag) {
        flagResults[flagName] = false;
        continue;
      }

      // Check date constraints
      if (flag.startDate && now < flag.startDate) {
        flagResults[flagName] = false;
        continue;
      }

      if (flag.endDate && now > flag.endDate) {
        flagResults[flagName] = false;
        continue;
      }

      // Check rollout percentage
      let isEnabled = false;
      if (flag.rolloutPercentage === 100) {
        isEnabled = true;
      } else if (flag.rolloutPercentage > 0) {
        // Use consistent hashing for user-based rollout
        const hash = effectiveUserId 
          ? hashString(effectiveUserId + flag.key) 
          : Math.random();
        isEnabled = hash < (flag.rolloutPercentage / 100);
      }

      // Check user segments if specified (get segments separately)
      if (isEnabled && effectiveUserId) {
        const flagSegments = await (prisma as any).featureFlagUserSegment.findMany({
          where: { featureFlagId: flag.id }
        });
        
        if (flagSegments.length > 0) {
          const user = await prisma.user.findUnique({
            where: { id: effectiveUserId },
            select: { role: true }
          });

          if (user) {
            // Get user's plan from subscription
            const userSubscription = await prisma.subscription.findFirst({
              where: { userId: effectiveUserId },
              select: { plan: true } as any,
              orderBy: { createdAt: 'desc' }
            });
            
            const userPlan = userSubscription?.plan || 'free';
            const userSegmentValues = [user.role, userPlan].filter(Boolean);
            const flagSegmentNames = flagSegments.map((s: any) => s.segment);
            isEnabled = flagSegmentNames.some((segment: string) => userSegmentValues.includes(segment));
          } else {
            isEnabled = false;
          }
        }
      }

      flagResults[flagName] = isEnabled;

      // Log feature flag usage
      if (isEnabled && effectiveUserId) {
        try {
          await prisma.featureFlagUsage.upsert({
            where: {
              featureFlagId_userId: {
                featureFlagId: flag.id,
                userId: effectiveUserId
              }
            } as any,
            update: {
              enabled: isEnabled,
              context: context || {}
            } as any,
            create: {
              featureFlagId: flag.id,
              userId: effectiveUserId,
              enabled: isEnabled,
              context: context || {}
            } as any
          });
        } catch (error) {
          // Don't fail the request if logging fails
          console.warn('Failed to log feature flag usage:', error);
        }
      }
    }

    return NextResponse.json({
      flags: flagResults,
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('Feature flag check error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to check feature flags' },
      { status: 500 }
    );
  }
}

// GET - Get single feature flag status
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 300, 'feature-flag-get');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const flagName = searchParams.get('name');
    const userId = searchParams.get('userId');

    if (!flagName) {
      return NextResponse.json({ error: 'Flag name is required' }, { status: 400 });
    }

    const session = await getServerSession();
    const effectiveUserId = userId || session?.user?.id;

    const flag = await prisma.featureFlag.findUnique({
      where: { key: flagName }
    });

    if (!flag || !flag.enabled) {
      return NextResponse.json({
        flagName,
        enabled: false,
        reason: flag ? 'disabled' : 'not_found'
      });
    }

    const now = new Date();

    // Check date constraints
    if (flag.startDate && now < flag.startDate) {
      return NextResponse.json({
        flagName,
        enabled: false,
        reason: 'not_started'
      });
    }

    if (flag.endDate && now > flag.endDate) {
      return NextResponse.json({
        flagName,
        enabled: false,
        reason: 'expired'
      });
    }

    // Check rollout percentage
    let isEnabled = false;
    if (flag.rolloutPercentage === 100) {
      isEnabled = true;
    } else if (flag.rolloutPercentage > 0) {
      const hash = effectiveUserId 
        ? hashString(effectiveUserId + flag.key) 
        : Math.random();
      isEnabled = hash < (flag.rolloutPercentage / 100);
    }

    // Check user segments if specified (get segments separately)
    if (isEnabled && effectiveUserId) {
      const flagSegments = await (prisma as any).featureFlagUserSegment.findMany({
        where: { featureFlagId: flag.id }
      });
      
      if (flagSegments.length > 0) {
        const user = await prisma.user.findUnique({
          where: { id: effectiveUserId },
          select: { role: true }
        });

        if (user) {
          // Get user's plan from subscription
          const userSubscription = await prisma.subscription.findFirst({
            where: { userId: effectiveUserId },
            select: { plan: true } as any,
            orderBy: { createdAt: 'desc' }
          });
          
          const userPlan = userSubscription?.plan || 'free';
          const userSegmentValues = [user.role, userPlan].filter(Boolean);
          const flagSegmentNames = flagSegments.map((s: any) => s.segment);
          isEnabled = flagSegmentNames.some((segment: string) => userSegmentValues.includes(segment));
        } else {
          isEnabled = false;
        }
      }
    }

    // Log usage if enabled
    if (isEnabled && effectiveUserId) {
      try {
        await prisma.featureFlagUsage.upsert({
          where: {
            featureFlagId_userId: {
              featureFlagId: flag.id,
              userId: effectiveUserId
            }
          } as any,
          update: {
            enabled: isEnabled,
            context: {}
          } as any,
          create: {
            featureFlagId: flag.id,
            userId: effectiveUserId,
            enabled: isEnabled,
            context: {}
          } as any
        });
      } catch (error) {
        console.warn('Failed to log feature flag usage:', error);
      }
    }

    return NextResponse.json({
      flagName,
      enabled: isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
      reason: isEnabled ? 'enabled' : 'rollout_excluded'
    });

  } catch (error) {
    console.error('Feature flag get error:', error);
    return NextResponse.json(
      { error: 'Failed to get feature flag status' },
      { status: 500 }
    );
  }
}

// Simple hash function for consistent user-based rollouts
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) / Math.pow(2, 31);
}