import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { nanoid } from 'nanoid';

// Integration schema for validation
const integrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['github', 'gitlab', 'bitbucket', 'aws', 'gcp', 'azure', 'vercel', 'netlify', 'docker', 'kubernetes']),
  config: z.record(z.any()),
  status: z.string().optional().default('inactive'),
});

// GET - Fetch user's integrations
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const integrations = await prisma.integrations.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        type: true,
        provider: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Don't return sensitive config data
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

// POST - Create new integration
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = integrationSchema.parse(body);

    // Check if integration with same name already exists
    const existingIntegration = await prisma.integrations.findFirst({
      where: {
        userId: session.user.id,
        name: validatedData.name,
      },
    });

    if (existingIntegration) {
      return NextResponse.json(
        { error: 'Integration with this name already exists' },
        { status: 400 }
      );
    }

    // Create the integration
    const integration = await prisma.integrations.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        name: validatedData.name,
        type: validatedData.type,
        provider: validatedData.type,
        config: validatedData.config,
        status: validatedData.status,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        type: true,
        provider: true,
        status: true,
        createdAt: true,
      },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        action: 'INTEGRATION_CREATED',
        resource: 'integration',
        resourceId: integration.id,
        metadata: {
          integrationType: integration.type,
          integrationName: integration.name,
        },
      },
    });

    return NextResponse.json(
      { integration, message: 'Integration created successfully' },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating integration:', error);
    return NextResponse.json(
      { error: 'Failed to create integration' },
      { status: 500 }
    );
  }
}

// PUT - Update integration settings
export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    // Verify the integration belongs to the user
    const existingIntegration = await prisma.integrations.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!existingIntegration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Update the integration
    const updatedIntegration = await prisma.integrations.update({
      where: { id: id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        type: true,
        provider: true,
        status: true,
        updatedAt: true,
      },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        action: 'INTEGRATION_UPDATED',
        resource: 'integration',
        resourceId: id,
        metadata: {
          changes: updateData,
        },
      },
    });

    return NextResponse.json({
      integration: updatedIntegration,
      message: 'Integration updated successfully',
    });
  } catch (error) {
    console.error('Error updating integration:', error);
    return NextResponse.json(
      { error: 'Failed to update integration' },
      { status: 500 }
    );
  }
}

// DELETE - Remove integration
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('id');

    if (!integrationId) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    // Verify the integration belongs to the user
    const integration = await prisma.integrations.findFirst({
      where: {
        id: integrationId,
        userId: session.user.id,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Delete the integration
    await prisma.integrations.delete({
      where: { id: integrationId },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        action: 'INTEGRATION_DELETED',
        resource: 'integration',
        resourceId: integrationId,
        metadata: {
          integrationType: integration.type,
          integrationName: integration.name,
        },
      },
    });

    return NextResponse.json({
      message: 'Integration deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    );
  }
}
