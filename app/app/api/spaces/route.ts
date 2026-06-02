import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { getCommercialEntitlements, isUnlimitedCommercialLimit, normalizeCommercialPlan } from '@/lib/plan-entitlements';
import { logger } from '@/lib/logger';

function serializeSpace(space: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: space.id,
    name: space.name,
    description: space.description,
    status: space.status,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    agents: space.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const appUser = await ensureAppUserFromAuthUser(authResult.user);

    if (!appUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const [spaces, connectedAgentsCount, shippingLoopProjects] = await Promise.all([
      prisma.projects.findMany({
        where: {
          userId: appUser.id,
          type: 'space',
        },
        include: {
          agents: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.agents.count({
        where: {
          userId: appUser.id,
          status: {
            in: ['active', 'connected', 'running', 'online'],
          },
        },
      }),
      prisma.ai_generated_projects.count({
        where: {
          userId: appUser.id,
          OR: [
            { previewUrl: { not: null } },
            { deployUrl: { not: null } },
          ],
        },
      }),
    ]);

    const plan = normalizeCommercialPlan(appUser.subscriptionPlan || appUser.subscription);
    const entitlements = getCommercialEntitlements(plan);
    const spacesCount = spaces.length;
    const hasSpace = spacesCount > 0;
    const hasConnectedAgent = connectedAgentsCount > 0;
    const hasShippingLoop = shippingLoopProjects > 0;

    return NextResponse.json({
      success: true,
      data: {
        plan,
        entitlements,
        spaces: spaces.map(serializeSpace),
        activation: {
          hasSpace,
          hasConnectedAgent,
          hasShippingLoop,
          nextStep: !hasSpace
            ? 'create-space'
            : !hasConnectedAgent
              ? 'connect-agent'
              : !hasShippingLoop
                ? 'ship-first-loop'
                : 'expand-control-plane',
        },
        usage: {
          spacesUsed: spacesCount,
          connectedAgentsUsed: connectedAgentsCount,
          previewOrDeployProjects: shippingLoopProjects,
        },
        limits: {
          canCreateSpace: isUnlimitedCommercialLimit(entitlements.workspaces) || spacesCount < entitlements.workspaces,
          canConnectAgent: isUnlimitedCommercialLimit(entitlements.connectedAgents) || connectedAgentsCount < entitlements.connectedAgents,
        },
      },
    });
  } catch (error) {
    logger.error('Spaces GET error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to load spaces' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const appUser = await ensureAppUserFromAuthUser(authResult.user);

    if (!appUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';

    if (!name) {
      return NextResponse.json({ success: false, error: 'Space name is required' }, { status: 400 });
    }

    const plan = normalizeCommercialPlan(appUser.subscriptionPlan || appUser.subscription);
    const entitlements = getCommercialEntitlements(plan);
    const currentSpaces = await prisma.projects.count({
      where: {
        userId: appUser.id,
        type: 'space',
      },
    });

    if (!isUnlimitedCommercialLimit(entitlements.workspaces) && currentSpaces >= entitlements.workspaces) {
      return NextResponse.json({
        success: false,
        error: `Your ${plan} plan allows ${entitlements.workspaces} workspace${entitlements.workspaces === 1 ? '' : 's'}. Upgrade to create another Space.`,
      }, { status: 403 });
    }

    const created = await prisma.projects.create({
      data: {
        id: crypto.randomUUID(),
        userId: appUser.id,
        name,
        description: description || 'Recoder Space',
        type: 'space',
        status: 'active',
        config: {
          kind: 'recoder-space',
          source: 'dashboard-space-create',
        },
        metadata: {
          activationFlow: 'create-space',
        },
        updatedAt: new Date(),
      },
      include: {
        agents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        space: serializeSpace(created),
        plan,
        entitlements,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error('Spaces POST error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to create space' }, { status: 500 });
  }
}

