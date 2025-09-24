// User onboarding API endpoints
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for onboarding operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const onboardingProfileSchema = z.object({
  role: z.enum(['developer', 'designer', 'manager', 'student', 'other']).optional(),
  experience: z.enum(['beginner', 'intermediate', 'expert']).optional(),
  interests: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
  teamSize: z.enum(['solo', 'small', 'medium', 'large']).optional(),
  primaryLanguage: z.string().optional(),
  completed: z.boolean(),
});

export interface OnboardingProfile {
  role?: 'developer' | 'designer' | 'manager' | 'student' | 'other';
  experience?: 'beginner' | 'intermediate' | 'expert';
  interests?: string[];
  goals?: string[];
  teamSize?: 'solo' | 'small' | 'medium' | 'large';
  primaryLanguage?: string;
  completed: boolean;
  completedAt?: string;
}

// GET /api/user/onboarding - Get user's onboarding status
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'onboarding-check');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's onboarding status
    const onboarding = await getUserOnboardingStatus(session.user.id);

    return Response.json(onboarding);

  } catch (error) {
    console.error('Onboarding status error:', error);
    return Response.json(
      { error: 'Failed to fetch onboarding status' },
      { status: 500 }
    );
  }
}

// POST /api/user/onboarding - Complete onboarding or update profile
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'onboarding-update');
    } catch {
      return Response.json(
        { error: 'Too many update requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = onboardingProfileSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Update user's onboarding profile
    const updatedProfile = await updateUserOnboardingProfile(session.user.id, validatedData);

    // If onboarding is being completed, trigger additional setup
    if (validatedData.completed) {
      await completeUserOnboarding(session.user.id, validatedData);
    }

    // Log onboarding completion
    if (validatedData.completed) {
      await logOnboardingEvent(session.user.id, 'onboarding_completed', {
        profile: validatedData,
        timestamp: new Date().toISOString(),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent'),
      });
    }

    return Response.json({
      success: true,
      profile: updatedProfile,
      message: validatedData.completed ? 'Onboarding completed successfully!' : 'Profile updated successfully!'
    });

  } catch (error) {
    console.error('Onboarding update error:', error);
    return Response.json(
      { error: 'Failed to update onboarding profile' },
      { status: 500 }
    );
  }
}

// Helper functions
async function getUserOnboardingStatus(userId: string): Promise<OnboardingProfile> {
  try {
    // In production, this would query the user_onboarding table
    // Return default/mock data for demo
    return {
      role: undefined,
      experience: undefined,
      interests: [],
      goals: [],
      teamSize: undefined,
      primaryLanguage: undefined,
      completed: false, // Change this based on actual data
    };
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    return {
      completed: false,
      interests: [],
      goals: [],
    };
  }
}

async function updateUserOnboardingProfile(userId: string, profile: any): Promise<OnboardingProfile> {
  try {
    // In production, this would update the user_onboarding table
    const updatedProfile: OnboardingProfile = {
      ...profile,
      completedAt: profile.completed ? new Date().toISOString() : undefined,
    };

    console.log(`Onboarding profile updated for user ${userId}:`, updatedProfile);
    return updatedProfile;
  } catch (error) {
    console.error('Error updating onboarding profile:', error);
    throw error;
  }
}

async function completeUserOnboarding(userId: string, profile: any): Promise<void> {
  try {
    // Perform additional setup based on user profile
    const setupActions = [];

    // Create personalized dashboard based on role and interests
    if (profile.role === 'developer') {
      setupActions.push(createDeveloperDashboard(userId, profile));
    } else if (profile.role === 'designer') {
      setupActions.push(createDesignerDashboard(userId, profile));
    } else if (profile.role === 'manager') {
      setupActions.push(createManagerDashboard(userId, profile));
    } else if (profile.role === 'student') {
      setupActions.push(createStudentDashboard(userId, profile));
    }

    // Set up recommended integrations based on interests
    if (profile.interests?.includes('web-dev')) {
      setupActions.push(recommendWebDevIntegrations(userId));
    }
    if (profile.interests?.includes('mobile-dev')) {
      setupActions.push(recommendMobileDevIntegrations(userId));
    }
    if (profile.interests?.includes('devops')) {
      setupActions.push(recommendDevOpsIntegrations(userId));
    }

    // Create sample projects based on experience and interests
    setupActions.push(createSampleProjects(userId, profile));

    // Set up tutorials and learning path
    setupActions.push(createLearningPath(userId, profile));

    // Execute all setup actions
    await Promise.all(setupActions);

    console.log(`Onboarding completed for user ${userId} with ${setupActions.length} setup actions`);
  } catch (error) {
    console.error('Error completing user onboarding:', error);
    throw error;
  }
}

async function createDeveloperDashboard(userId: string, profile: any): Promise<void> {
  // Set up developer-specific dashboard widgets and preferences
  console.log('Creating developer dashboard for user:', userId);
}

async function createDesignerDashboard(userId: string, profile: any): Promise<void> {
  // Set up designer-specific dashboard with UI/UX tools
  console.log('Creating designer dashboard for user:', userId);
}

async function createManagerDashboard(userId: string, profile: any): Promise<void> {
  // Set up manager dashboard with team and project management tools
  console.log('Creating manager dashboard for user:', userId);
}

async function createStudentDashboard(userId: string, profile: any): Promise<void> {
  // Set up student dashboard with learning resources and tutorials
  console.log('Creating student dashboard for user:', userId);
}

async function recommendWebDevIntegrations(userId: string): Promise<void> {
  // Recommend GitHub, Vercel, Netlify integrations
  console.log('Recommending web dev integrations for user:', userId);
}

async function recommendMobileDevIntegrations(userId: string): Promise<void> {
  // Recommend mobile dev tools and services
  console.log('Recommending mobile dev integrations for user:', userId);
}

async function recommendDevOpsIntegrations(userId: string): Promise<void> {
  // Recommend AWS, GCP, Docker integrations
  console.log('Recommending DevOps integrations for user:', userId);
}

async function createSampleProjects(userId: string, profile: any): Promise<void> {
  // Create sample projects based on user interests and experience
  const projectSuggestions = [];

  if (profile.interests?.includes('web-dev')) {
    if (profile.experience === 'beginner') {
      projectSuggestions.push('Simple Todo App');
      projectSuggestions.push('Personal Portfolio Website');
    } else if (profile.experience === 'intermediate') {
      projectSuggestions.push('E-commerce Store');
      projectSuggestions.push('Blog Platform with CMS');
    } else if (profile.experience === 'expert') {
      projectSuggestions.push('Microservices Architecture');
      projectSuggestions.push('Real-time Chat Application');
    }
  }

  if (profile.interests?.includes('mobile-dev')) {
    projectSuggestions.push('Cross-platform Mobile App');
  }

  console.log(`Created ${projectSuggestions.length} sample project suggestions for user ${userId}`);
}

async function createLearningPath(userId: string, profile: any): Promise<void> {
  // Create personalized learning path based on experience and goals
  const learningModules = [];

  if (profile.experience === 'beginner') {
    learningModules.push('Programming Fundamentals');
    learningModules.push('Version Control with Git');
    learningModules.push('Basic Web Development');
  } else if (profile.experience === 'intermediate') {
    learningModules.push('Advanced JavaScript Patterns');
    learningModules.push('Database Design');
    learningModules.push('Testing and Quality Assurance');
  } else if (profile.experience === 'expert') {
    learningModules.push('System Design');
    learningModules.push('Performance Optimization');
    learningModules.push('Microservices Architecture');
  }

  // Add goal-specific modules
  if (profile.goals?.includes('Learn new programming languages')) {
    learningModules.push('Multi-language Programming Guide');
  }
  if (profile.goals?.includes('Improve code quality')) {
    learningModules.push('Clean Code Principles');
    learningModules.push('Code Review Best Practices');
  }

  console.log(`Created learning path with ${learningModules.length} modules for user ${userId}`);
}

async function logOnboardingEvent(userId: string, event: string, metadata: any): Promise<void> {
  try {
    // In production, this would write to audit log table
    console.log(`Onboarding Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log onboarding event:', error);
  }
}

export const runtime = "nodejs";