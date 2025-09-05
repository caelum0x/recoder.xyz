import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

// Integration schema for validation
const integrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['github', 'gitlab', 'bitbucket', 'aws', 'gcp', 'azure', 'vercel', 'netlify', 'docker', 'kubernetes']),
  config: z.record(z.any()),
  isEnabled: z.boolean().optional().default(true),
});

// GET - Fetch user's integrations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const integrations = await prisma.userIntegration.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        type: true,
        isEnabled: true,
        isConnected: true,
        lastSyncAt: true,
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
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = integrationSchema.parse(body);

    // Check if integration with same name already exists
    const existingIntegration = await prisma.userIntegration.findFirst({
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
    const integration = await prisma.userIntegration.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        type: validatedData.type,
        config: validatedData.config,
        isEnabled: validatedData.isEnabled,
        isConnected: false, // Will be set to true after successful connection test
      },
      select: {
        id: true,
        name: true,
        type: true,
        isEnabled: true,
        isConnected: true,
        createdAt: true,
      },
    });

    // Create audit log entry
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: 'INTEGRATION_CREATED',
        details: {
          integrationId: integration.id,
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
    const session = await getServerSession();
    const prisma = getPrisma();
    
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
    const existingIntegration = await prisma.userIntegration.findFirst({
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
    const updatedIntegration = await prisma.userIntegration.update({
      where: { id: id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        type: true,
        isEnabled: true,
        isConnected: true,
        lastSyncAt: true,
        updatedAt: true,
      },
    });

    // Create audit log entry
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: 'INTEGRATION_UPDATED',
        details: {
          integrationId: id,
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
    const session = await getServerSession();
    const prisma = getPrisma();
    
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
    const integration = await prisma.userIntegration.findFirst({
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
    await prisma.userIntegration.delete({
      where: { id: integrationId },
    });

    // Create audit log entry
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: 'INTEGRATION_DELETED',
        details: {
          integrationId: integrationId,
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
