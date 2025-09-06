// GitHub Repositories management API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const repositoryActionSchema = z.object({
  action: z.enum(['sync', 'create', 'clone', 'webhook']),
  repoData: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    private: z.boolean().default(false),
    template: z.string().optional(),
    autoInit: z.boolean().default(true)
  }).optional(),
  webhookConfig: z.object({
    events: z.array(z.string()),
    url: z.string().url(),
    secret: z.string().optional(),
    contentType: z.enum(['json', 'form']).default('json')
  }).optional()
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const per_page = parseInt(searchParams.get('per_page') || '30');
    const type = searchParams.get('type') || 'all'; // all, owner, collaborator, organization_member
    const sort = searchParams.get('sort') || 'updated'; // created, updated, pushed, full_name
    const direction = searchParams.get('direction') || 'desc';
    const affiliation = searchParams.get('affiliation') || 'owner,collaborator,organization_member';

    // Get GitHub integration
    const integration = await prisma.userIntegration.findFirst({
      where: {
        userId,
        provider: 'github',
        status: 'active'
      }
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'GitHub integration not found or inactive' },
        { status: 404 }
      );
    }

    try {
      // Fetch repositories from GitHub API
      const reposUrl = new URL('https://api.github.com/user/repos');
      reposUrl.searchParams.set('page', page.toString());
      reposUrl.searchParams.set('per_page', per_page.toString());
      reposUrl.searchParams.set('type', type);
      reposUrl.searchParams.set('sort', sort);
      reposUrl.searchParams.set('direction', direction);
      reposUrl.searchParams.set('affiliation', affiliation);

      const response = await fetch(reposUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${integration.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Recoder.xyz'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Mark integration as expired
          await prisma.userIntegration.update({
            where: { id: integration.id },
            data: { status: 'expired' }
          });
          
          return NextResponse.json(
            { error: 'GitHub token expired. Please reconnect your account.' },
            { status: 401 }
          );
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const repositories = await response.json();
      const totalCount = response.headers.get('x-ratelimit-remaining');

      // Transform repository data
      const transformedRepos = repositories.map((repo: any) => ({
        id: repo.id,
        nodeId: repo.node_id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        fork: repo.fork,
        archived: repo.archived,
        disabled: repo.disabled,
        owner: {
          login: repo.owner.login,
          id: repo.owner.id,
          avatarUrl: repo.owner.avatar_url,
          type: repo.owner.type
        },
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        gitUrl: repo.git_url,
        homepage: repo.homepage,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        watchersCount: repo.watchers_count,
        forksCount: repo.forks_count,
        openIssuesCount: repo.open_issues_count,
        hasIssues: repo.has_issues,
        hasProjects: repo.has_projects,
        hasWiki: repo.has_wiki,
        hasPages: repo.has_pages,
        hasDownloads: repo.has_downloads,
        defaultBranch: repo.default_branch,
        permissions: repo.permissions,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        size: repo.size,
        topics: repo.topics || []
      }));

      // Update integration last sync time
      await prisma.userIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() }
      });

      return NextResponse.json({
        repositories: transformedRepos,
        pagination: {
          page,
          per_page,
          total: repositories.length
        },
        rateLimitRemaining: totalCount,
        lastSyncAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('GitHub repositories fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GitHub repositories' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('GitHub repositories API error:', error);
    return NextResponse.json(
      { error: 'Failed to process repositories request' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { action, repoData, webhookConfig } = repositoryActionSchema.parse(body);

    // Get GitHub integration
    const integration = await prisma.userIntegration.findFirst({
      where: {
        userId,
        provider: 'github',
        status: 'active'
      }
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'GitHub integration not found or inactive' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'create':
        return await createRepository(userId, integration, repoData!, request);
      
      case 'webhook':
        return await createWebhook(userId, integration, webhookConfig!, request);
      
      case 'sync':
        return await syncRepositories(userId, integration, request);
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('GitHub repositories action error:', error);
    return NextResponse.json(
      { error: 'Failed to process repository action' },
      { status: 500 }
    );
  }
}

async function createRepository(
  userId: string, 
  integration: any, 
  repoData: any, 
  request: NextRequest
) {
  try {
    const createRepoPayload = {
      name: repoData.name,
      description: repoData.description || null,
      private: repoData.private,
      auto_init: repoData.autoInit,
      gitignore_template: repoData.template || null
    };

    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder.xyz'
      },
      body: JSON.stringify(createRepoPayload)
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: `Failed to create repository: ${error.message}` },
        { status: response.status }
      );
    }

    const newRepo = await response.json();

    // Log repository creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_repo_created',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          repoId: newRepo.id,
          repoName: newRepo.name,
          fullName: newRepo.full_name,
          private: newRepo.private,
          cloneUrl: newRepo.clone_url
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Repository created successfully',
      repository: {
        id: newRepo.id,
        name: newRepo.name,
        fullName: newRepo.full_name,
        description: newRepo.description,
        private: newRepo.private,
        htmlUrl: newRepo.html_url,
        cloneUrl: newRepo.clone_url,
        sshUrl: newRepo.ssh_url,
        createdAt: newRepo.created_at
      }
    });

  } catch (error) {
    console.error('GitHub repository creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create repository' },
      { status: 500 }
    );
  }
}

async function createWebhook(
  userId: string, 
  integration: any, 
  webhookConfig: any, 
  request: NextRequest
) {
  const { searchParams } = new URL(request.url);
  const repoOwner = searchParams.get('owner');
  const repoName = searchParams.get('repo');

  if (!repoOwner || !repoName) {
    return NextResponse.json(
      { error: 'Repository owner and name are required' },
      { status: 400 }
    );
  }

  try {
    const webhookPayload = {
      name: 'web',
      active: true,
      events: webhookConfig.events,
      config: {
        url: webhookConfig.url,
        content_type: webhookConfig.contentType,
        secret: webhookConfig.secret || null,
        insecure_ssl: '0'
      }
    };

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/hooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integration.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Recoder.xyz'
        },
        body: JSON.stringify(webhookPayload)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: `Failed to create webhook: ${error.message}` },
        { status: response.status }
      );
    }

    const webhook = await response.json();

    // Log webhook creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_webhook_created',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          webhookId: webhook.id,
          repoOwner,
          repoName,
          events: webhookConfig.events,
          url: webhookConfig.url
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook created successfully',
      webhook: {
        id: webhook.id,
        name: webhook.name,
        events: webhook.events,
        url: webhook.config.url,
        active: webhook.active,
        createdAt: webhook.created_at
      }
    });

  } catch (error) {
    console.error('GitHub webhook creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    );
  }
}

async function syncRepositories(
  userId: string, 
  integration: any, 
  request: NextRequest
) {
  try {
    // This could be expanded to sync repositories to a local database
    // For now, we'll just update the last sync timestamp
    await prisma.userIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() }
    });

    // Log sync action
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_repos_synced',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          integrationId: integration.id,
          syncedAt: new Date().toISOString()
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Repositories synced successfully',
      lastSyncAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('GitHub repositories sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync repositories' },
      { status: 500 }
    );
  }
}