import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { getCommercialEntitlements, isUnlimitedCommercialLimit, normalizeCommercialPlan } from '@/lib/plan-entitlements';
import { logger } from '@/lib/logger';

const CONNECTED_AGENT_STATUSES = ['active', 'connected', 'running', 'online'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const appUser = await ensureAppUserFromAuthUser(authResult.user);
    if (!appUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { spaceId } = await params;
    const space = await prisma.projects.findFirst({
      where: {
        id: spaceId,
        userId: appUser.id,
        type: 'space',
      },
      include: {
        agents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!space) {
      return NextResponse.json({ success: false, error: 'Space not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        agents: space.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          createdAt: agent.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    logger.error('Space agents GET error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to load agents' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const appUser = await ensureAppUserFromAuthUser(authResult.user);
    if (!appUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { spaceId } = await params;
    const space = await prisma.projects.findFirst({
      where: {
        id: spaceId,
        userId: appUser.id,
        type: 'space',
      },
    });

    if (!space) {
      return NextResponse.json({ success: false, error: 'Space not found' }, { status: 404 });
    }

    const plan = normalizeCommercialPlan(appUser.subscriptionPlan || appUser.subscription);
    const entitlements = getCommercialEntitlements(plan);
    const connectedAgentsCount = await prisma.agents.count({
      where: {
        userId: appUser.id,
        status: { in: [...CONNECTED_AGENT_STATUSES] },
      },
    });

    if (!isUnlimitedCommercialLimit(entitlements.connectedAgents) && connectedAgentsCount >= entitlements.connectedAgents) {
      return NextResponse.json({
        success: false,
        error: `Your ${plan} plan allows ${entitlements.connectedAgents} connected agent${entitlements.connectedAgents === 1 ? '' : 's'}. Upgrade to connect another agent.`,
      }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const type = typeof body?.type === 'string' && body.type.trim() ? body.type.trim() : 'recoder-code';
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : `${type} agent`;
    const description = typeof body?.description === 'string' ? body.description.trim() : '';

    const existing = await prisma.agents.findFirst({
      where: {
        userId: appUser.id,
        projectId: space.id,
        type,
        name,
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          agent: {
            id: existing.id,
            name: existing.name,
            type: existing.type,
            status: existing.status,
            createdAt: existing.createdAt.toISOString(),
          },
          reused: true,
        },
      });
    }

    const agent = await prisma.agents.create({
      data: {
        id: crypto.randomUUID(),
        userId: appUser.id,
        projectId: space.id,
        name,
        type,
        description: description || `Connected ${type} agent`,
        status: 'active',
        config: {
          connectedVia: 'recoder-space',
          activationMilestone: 'connect-agent',
          spaceId: space.id,
        },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          createdAt: agent.createdAt.toISOString(),
        },
        reused: false,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error('Space agents POST error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to connect agent' }, { status: 500 });
  }
}

