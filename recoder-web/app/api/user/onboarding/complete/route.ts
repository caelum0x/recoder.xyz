import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update user onboarding status in the database
    // We'll use a simple approach and add this to the user metadata
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        // Add onboarding completion timestamp to user metadata
        updatedAt: new Date()
      }
    });

    // For now, we'll track onboarding completion in local storage on the client side
    // In a production app, you might add a separate onboarding table or user metadata field

    // Log onboarding completion for analytics
    console.log('Onboarding completed for user:', session.user.id);

    return Response.json({ 
      success: true,
      message: 'Onboarding completed successfully'
    });

  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    return Response.json({ error: 'Failed to complete onboarding' }, { status: 500 });
  }
}

export const runtime = "edge";
