// Team projects API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import rateLimit from '@/lib/rate-limit';

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export interface TeamProject {
  id: string;
  name: string;
  description: string;
  visibility: 'public' | 'team' | 'private';
  memberCount: number;
  lastUpdated: string;
  status: 'active' | 'archived' | 'completed';
  createdAt: string;
  ownerId: string;
  ownerName: string;
  languages: string[];
  tags: string[];
  stars: number;
  forks: number;
  repository?: {
    url: string;
    branch: string;
    lastCommit: string;
  };
}

// GET /api/teams/[teamId]/projects - Get team projects
export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 60, 'team-projects-list');
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

    const teamId = params.teamId;

    // Verify user has access to this team
    const hasAccess = await verifyTeamAccess(session.user.id, teamId);
    if (!hasAccess) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get URL parameters for filtering
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const visibility = url.searchParams.get('visibility');
    const search = url.searchParams.get('search');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Get team projects with filters
    const projects = await getTeamProjects(teamId, {
      status,
      visibility,
      search,
      limit: Math.min(limit, 100), // Max 100 projects per request
      offset,
    });

    return Response.json(projects);

  } catch (error) {
    console.error('Team projects list error:', error);
    return Response.json(
      { error: 'Failed to fetch team projects' },
      { status: 500 }
    );
  }
}

// Helper functions
async function verifyTeamAccess(userId: string, teamId: string): Promise<boolean> {
  try {
    // In production, this would check team membership in database
    // For now, return true for demo purposes
    return true;
  } catch (error) {
    console.error('Error verifying team access:', error);
    return false;
  }
}

async function getTeamProjects(
  teamId: string,
  filters: {
    status?: string | null;
    visibility?: string | null;
    search?: string | null;
    limit: number;
    offset: number;
  }
): Promise<TeamProject[]> {
  try {
    // In production, this would query team projects from database with filters
    // Return mock data for demo
    const mockProjects: TeamProject[] = [
      {
        id: 'project-1',
        name: 'AI Code Generator',
        description: 'Advanced AI-powered code generation tool with multi-language support',
        visibility: 'team',
        memberCount: 4,
        lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        ownerId: 'user-1',
        ownerName: 'John Doe',
        languages: ['TypeScript', 'Python', 'Docker'],
        tags: ['ai', 'code-generation', 'automation'],
        stars: 23,
        forks: 7,
        repository: {
          url: 'https://github.com/team/ai-code-generator',
          branch: 'main',
          lastCommit: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'project-2',
        name: 'Team Dashboard',
        description: 'Real-time team collaboration dashboard with analytics and reporting',
        visibility: 'private',
        memberCount: 3,
        lastUpdated: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        ownerId: 'user-2',
        ownerName: 'Jane Smith',
        languages: ['React', 'Node.js', 'PostgreSQL'],
        tags: ['dashboard', 'analytics', 'collaboration'],
        stars: 12,
        forks: 3,
        repository: {
          url: 'https://github.com/team/dashboard',
          branch: 'develop',
          lastCommit: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'project-3',
        name: 'Mobile App MVP',
        description: 'Cross-platform mobile application for code sharing and collaboration',
        visibility: 'public',
        memberCount: 5,
        lastUpdated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        ownerId: 'user-3',
        ownerName: 'Bob Johnson',
        languages: ['React Native', 'TypeScript', 'Firebase'],
        tags: ['mobile', 'mvp', 'cross-platform'],
        stars: 45,
        forks: 18,
        repository: {
          url: 'https://github.com/team/mobile-app',
          branch: 'release/v1.0',
          lastCommit: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'project-4',
        name: 'API Gateway Service',
        description: 'Microservices API gateway with authentication and rate limiting',
        visibility: 'team',
        memberCount: 2,
        lastUpdated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'archived',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        ownerId: 'user-4',
        ownerName: 'Alice Wilson',
        languages: ['Go', 'Docker', 'Kubernetes'],
        tags: ['api', 'microservices', 'gateway'],
        stars: 8,
        forks: 2,
        repository: {
          url: 'https://github.com/team/api-gateway',
          branch: 'main',
          lastCommit: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'project-5',
        name: 'Documentation Site',
        description: 'Interactive documentation and tutorial platform',
        visibility: 'public',
        memberCount: 6,
        lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        ownerId: 'user-1',
        ownerName: 'John Doe',
        languages: ['Next.js', 'MDX', 'Tailwind CSS'],
        tags: ['documentation', 'tutorials', 'learning'],
        stars: 67,
        forks: 25,
        repository: {
          url: 'https://github.com/team/docs-site',
          branch: 'main',
          lastCommit: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        },
      },
    ];

    // Apply filters
    let filteredProjects = mockProjects;

    if (filters.status) {
      filteredProjects = filteredProjects.filter(p => p.status === filters.status);
    }

    if (filters.visibility) {
      filteredProjects = filteredProjects.filter(p => p.visibility === filters.visibility);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredProjects = filteredProjects.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
        p.languages.some(lang => lang.toLowerCase().includes(searchLower))
      );
    }

    // Apply pagination
    const paginatedProjects = filteredProjects
      .slice(filters.offset, filters.offset + filters.limit);

    // Sort by last updated (most recent first)
    paginatedProjects.sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    return paginatedProjects;
  } catch (error) {
    console.error('Error fetching team projects:', error);
    return [];
  }
}

export const runtime = "edge";