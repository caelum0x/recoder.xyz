/**
 * Database operations for projects
 * Manages project storage in PostgreSQL/Neon
 */

import { neon } from '@neondatabase/serverless';

export interface Project {
  id: string;
  name: string;
  type: string;
  description?: string;
  status: string;
  config: Record<string, unknown>;
  structure?: Record<string, unknown>;
  framework?: string;
  language?: string;
  isPrivate: boolean;
  metadata: Record<string, unknown>;
  projectPath?: string;
  userId: string;
  templateId?: string;
  createdAt: Date;
  updatedAt: Date;
  // UI display properties (can be stored in metadata)
  color?: string;
  icon?: string;
  chatCount?: number;
  fileCount?: number;
  // Deployment properties
  deploymentStatus?: 'idle' | 'preparing' | 'deploying' | 'deployed' | 'failed';
  productionDeployUrl?: string;
  deployedAt?: Date;
  // Custom domain properties
  customDomain?: string;
  customDomainStatus?: 'pending' | 'verified' | 'active' | 'failed';
  customDomainVerifiedAt?: string;
  sslStatus?: 'pending' | 'pending_validation' | 'active' | 'failed';
  ownershipVerification?: string;
  // Starter template path
  starterPath?: string;
  // Knowledge base
  knowledge?: string;
  // Message history for AI context
  messageHistory?: string;
}

export interface CreateProjectData {
  name: string;
  type?: string;
  description?: string;
  framework?: string;
  language?: string;
  isPrivate?: boolean;
  userId: string;
  templateId?: string;
  starterPath?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class ProjectsDB {
  private sql: ReturnType<typeof neon>;

  constructor(databaseUrl?: string) {
    const url = databaseUrl || process.env.DATABASE_URL;
    
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }

    this.sql = neon(url);
  }

  /**
   * Get all projects for a user
   */
  async getUserProjects(userId?: string): Promise<Project[]> {
    try {
      if (!userId) {
        return [];
      }

      const result = await this.sql`
        SELECT * FROM projects
        WHERE "userId" = ${userId}
        ORDER BY "updatedAt" DESC
      ` as unknown as Project[];

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.getUserProjects] Database error:', message);
      throw new Error(`Failed to get user projects: ${message}`);
    }
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData): Promise<Project> {
    try {
      const id = crypto.randomUUID();
      const now = new Date();
      
      console.log('📝 Creating project in DB:', { 
        id, 
        name: data.name, 
        userId: data.userId,
        type: data.type || 'web'
      });
      
      const result = await this.sql`
        INSERT INTO projects (
          id, name, type, description, status, config, framework, language,
          "isPrivate", metadata, "userId", "templateId", "starterPath", "createdAt", "updatedAt"
        )
        VALUES (
          ${id},
          ${data.name},
          ${data.type || 'web'},
          ${data.description || ''},
          'active',
          ${JSON.stringify(data.config || {})}::jsonb,
          ${data.framework || null},
          ${data.language || null},
          ${data.isPrivate || false},
          ${JSON.stringify(data.metadata || {})}::jsonb,
          ${data.userId},
          ${data.templateId || null},
          ${data.starterPath || null},
          ${now},
          ${now}
        )
        RETURNING *
      ` as unknown as Project[];

      if (!result || result.length === 0) {
        throw new Error('No project returned from database');
      }

      console.log('✅ Project created in DB:', result[0].id);
      return result[0];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.createProject] Database error:', message);
      console.error('❌ [ProjectsDB.createProject] Data:', data);
      throw new Error(`Failed to create project: ${message}`);
    }
  }

  /**
   * Update project details
   */
  async updateProject(projectId: string, data: Partial<CreateProjectData>, userId: string): Promise<Project | null> {
    try {
      const result = await this.sql`
        UPDATE projects
        SET
          name = COALESCE(${data.name || null}, name),
          description = COALESCE(${data.description || null}, description),
          framework = COALESCE(${data.framework || null}, framework),
          language = COALESCE(${data.language || null}, language),
          "isPrivate" = COALESCE(${data.isPrivate ?? null}, "isPrivate"),
          "templateId" = COALESCE(${data.templateId || null}, "templateId"),
          "starterPath" = COALESCE(${data.starterPath || null}, "starterPath"),
          "updatedAt" = NOW()
        WHERE id = ${projectId} AND "userId" = ${userId}
        RETURNING *
      ` as unknown as Project[];

      if (!result || result.length === 0) {
        return null;
      }

      return result[0];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.updateProject] Database error:', message);
      throw new Error(`Failed to update project: ${message}`);
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.sql`
        DELETE FROM projects
        WHERE id = ${projectId} AND "userId" = ${userId}
        RETURNING id
      ` as unknown as { id: string }[];

      return result && result.length > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.deleteProject] Database error:', message);
      throw new Error(`Failed to delete project: ${message}`);
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string, userId?: string): Promise<Project | null> {
    try {
      let result: unknown;

      if (userId) {
        result = await this.sql`
          SELECT * FROM projects
          WHERE id = ${projectId} AND "userId" = ${userId}
        `;
      } else {
        result = await this.sql`
          SELECT * FROM projects
          WHERE id = ${projectId}
        `;
      }

      const projects = result as Project[];
      if (!projects || projects.length === 0) {
        return null;
      }

      return projects[0];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.getProject] Database error:', message);
      throw new Error(`Failed to get project: ${message}`);
    }
  }

  /**
   * Get public projects (for community/explore page)
   */
  async getPublicProjects(limit: number = 20, offset: number = 0): Promise<Project[]> {
    try {
      const result = await this.sql`
        SELECT * FROM projects
        WHERE "isPrivate" = false
        ORDER BY "updatedAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as unknown as Project[];

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.getPublicProjects] Database error:', message);
      throw new Error(`Failed to get public projects: ${message}`);
    }
  }

  /**
   * Update project timestamp
   */
  async touchProject(projectId: string): Promise<void> {
    try {
      await this.sql`
        UPDATE projects 
        SET "updatedAt" = NOW()
        WHERE id = ${projectId}
      `;
    } catch (error: unknown) {
      console.error('❌ [ProjectsDB.touchProject] Database error:', error);
    }
  }

  /**
   * Link chat session to project
   */
  async linkChatToProject(projectId: string, chatSessionId: string): Promise<void> {
    try {
      await this.sql`
        UPDATE chat_sessions 
        SET "projectId" = ${projectId}
        WHERE id = ${chatSessionId}
      `;
      
      // Update project timestamp
      await this.touchProject(projectId);
    } catch (error: unknown) {
      console.error('❌ [ProjectsDB.linkChatToProject] Database error:', error);
    }
  }

  /**
   * Get project chats
   */
  async getProjectChats(projectId: string): Promise<unknown[]> {
    try {
      const result = await this.sql`
        SELECT * FROM chat_sessions
        WHERE "projectId" = ${projectId}
        ORDER BY "updatedAt" DESC
      ` as unknown as unknown[];

      return result;
    } catch (error: unknown) {
      console.error('❌ [ProjectsDB.getProjectChats] Database error:', error);
      return [];
    }
  }

  /**
   * Update project deployment status
   */
  async updateDeploymentStatus(
    projectId: string,
    status: Project['deploymentStatus'],
    productionUrl?: string
  ): Promise<Project | null> {
    try {
      const result = await this.sql`
        UPDATE projects
        SET
          "deploymentStatus" = ${status},
          "productionDeployUrl" = COALESCE(${productionUrl || null}, "productionDeployUrl"),
          "deployedAt" = CASE WHEN ${status} = 'deployed' THEN NOW() ELSE "deployedAt" END,
          "updatedAt" = NOW()
        WHERE id = ${projectId}
        RETURNING *
      ` as unknown as Project[];

      return result && result.length > 0 ? result[0] : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.updateDeploymentStatus] Database error:', message);
      throw new Error(`Failed to update deployment status: ${message}`);
    }
  }

  /**
   * Update project knowledge base
   */
  async updateKnowledge(projectId: string, knowledge: string, userId: string): Promise<Project | null> {
    try {
      const result = await this.sql`
        UPDATE projects
        SET
          knowledge = ${knowledge},
          "updatedAt" = NOW()
        WHERE id = ${projectId} AND "userId" = ${userId}
        RETURNING *
      ` as unknown as Project[];

      return result && result.length > 0 ? result[0] : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.updateKnowledge] Database error:', message);
      throw new Error(`Failed to update knowledge: ${message}`);
    }
  }

  /**
   * Update project custom domain settings
   */
  async updateCustomDomain(
    projectId: string,
    domain: string | null,
    status: Project['customDomainStatus'] | null,
    verification?: string
  ): Promise<Project | null> {
    try {
      const result = await this.sql`
        UPDATE projects
        SET
          "customDomain" = ${domain},
          "customDomainStatus" = ${status},
          "ownershipVerification" = ${verification || null},
          "customDomainVerifiedAt" = CASE WHEN ${status} = 'verified' THEN NOW()::text ELSE "customDomainVerifiedAt" END,
          "updatedAt" = NOW()
        WHERE id = ${projectId}
        RETURNING *
      ` as unknown as Project[];

      return result && result.length > 0 ? result[0] : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.updateCustomDomain] Database error:', message);
      throw new Error(`Failed to update custom domain: ${message}`);
    }
  }

  /**
   * Get project with all details including deployment and domain info
   */
  async getProjectWithDetails(projectId: string, userId?: string): Promise<Project | null> {
    try {
      let result: unknown;

      if (userId) {
        result = await this.sql`
          SELECT *,
            "deploymentStatus",
            "productionDeployUrl",
            "deployedAt",
            "customDomain",
            "customDomainStatus",
            "customDomainVerifiedAt",
            "sslStatus",
            "ownershipVerification",
            knowledge,
            "messageHistory"
          FROM projects
          WHERE id = ${projectId} AND "userId" = ${userId}
        `;
      } else {
        result = await this.sql`
          SELECT *,
            "deploymentStatus",
            "productionDeployUrl",
            "deployedAt",
            "customDomain",
            "customDomainStatus",
            "customDomainVerifiedAt",
            "sslStatus",
            "ownershipVerification",
            knowledge,
            "messageHistory"
          FROM projects
          WHERE id = ${projectId}
        `;
      }

      const projects = result as Project[];
      return projects && projects.length > 0 ? projects[0] : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.getProjectWithDetails] Database error:', message);
      throw new Error(`Failed to get project details: ${message}`);
    }
  }

  /**
   * Search projects by name
   */
  async searchProjects(userId: string, query: string, limit: number = 10): Promise<Project[]> {
    try {
      const result = await this.sql`
        SELECT * FROM projects
        WHERE "userId" = ${userId}
          AND (
            LOWER(name) LIKE LOWER(${'%' + query + '%'})
            OR LOWER(description) LIKE LOWER(${'%' + query + '%'})
          )
        ORDER BY "updatedAt" DESC
        LIMIT ${limit}
      ` as unknown as Project[];

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [ProjectsDB.searchProjects] Database error:', message);
      return [];
    }
  }

  /**
   * Get project count for user (for quota checking)
   */
  async getProjectCount(userId: string): Promise<number> {
    try {
      const result = await this.sql`
        SELECT COUNT(*) as count FROM projects
        WHERE "userId" = ${userId}
      ` as unknown as { count: string }[];

      return parseInt(result[0]?.count || '0', 10);
    } catch (error: unknown) {
      console.error('❌ [ProjectsDB.getProjectCount] Database error:', error);
      return 0;
    }
  }
}
