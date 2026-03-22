/**
 * Database operations for projects
 * Manages project storage in PostgreSQL/Neon
 */

import { createSql } from './pg-pool';
import { sanitizePostgresText } from './postgres-text-safety';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsDB');

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
  knowledge?: string;
  messageHistory?: string;
}

export class ProjectsDB {
  private sql: ReturnType<typeof createSql>;

  constructor(databaseUrl?: string) {
    const url = databaseUrl || process.env.DATABASE_URL;
    
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }

    this.sql = createSql(url);
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
      logger.error('❌ [ProjectsDB.getUserProjects] Database error:', message);
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
      const safeName = sanitizePostgresText(data.name) || '';
      const safeDescription = sanitizePostgresText(data.description || '') || '';
      const safeType = sanitizePostgresText(data.type || 'web') || 'web';
      const safeFramework = sanitizePostgresText(data.framework || null);
      const safeLanguage = sanitizePostgresText(data.language || null);
      const safeKnowledge = sanitizePostgresText(data.knowledge ?? null);
      const safeMessageHistory = sanitizePostgresText(data.messageHistory ?? null);
      
      logger.info('📝 Creating project in DB:', { 
        id, 
        name: data.name, 
        userId: data.userId,
        type: data.type || 'web'
      });
      
      const result = await this.sql`
        INSERT INTO projects (
          id, name, type, description, status, config, framework, language,
          "isPrivate", metadata, "knowledge", "messageHistory", "userId", "templateId", "starterPath", "createdAt", "updatedAt"
        )
        VALUES (
          ${id},
          ${safeName},
          ${safeType},
          ${safeDescription},
          'active',
          ${JSON.stringify(data.config || {})}::jsonb,
          ${safeFramework},
          ${safeLanguage},
          ${data.isPrivate || false},
          ${JSON.stringify(data.metadata || {})}::jsonb,
          ${safeKnowledge},
          ${safeMessageHistory},
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

      logger.info('✅ Project created in DB:', result[0].id);
      return result[0];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ [ProjectsDB.createProject] Database error:', message);
      logger.error('❌ [ProjectsDB.createProject] Data:', data);
      throw new Error(`Failed to create project: ${message}`);
    }
  }

  /**
   * Update project details
   */
  async updateProject(projectId: string, data: Partial<CreateProjectData>, userId: string): Promise<Project | null> {
    try {
      const safeName = sanitizePostgresText(data.name || null);
      const safeDescription = sanitizePostgresText(data.description || null);
      const safeFramework = sanitizePostgresText(data.framework || null);
      const safeLanguage = sanitizePostgresText(data.language || null);
      const result = await this.sql`
        UPDATE projects
        SET
          name = COALESCE(${safeName}, name),
          description = COALESCE(${safeDescription}, description),
          framework = COALESCE(${safeFramework}, framework),
          language = COALESCE(${safeLanguage}, language),
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
      logger.error('❌ [ProjectsDB.updateProject] Database error:', message);
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
      logger.error('❌ [ProjectsDB.deleteProject] Database error:', message);
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
      logger.error('❌ [ProjectsDB.getProject] Database error:', message);
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
      logger.error('❌ [ProjectsDB.getPublicProjects] Database error:', message);
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
      logger.error('❌ [ProjectsDB.touchProject] Database error:', error);
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
      logger.error('❌ [ProjectsDB.linkChatToProject] Database error:', error);
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
      logger.error('❌ [ProjectsDB.getProjectChats] Database error:', error);
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
      logger.error('❌ [ProjectsDB.updateDeploymentStatus] Database error:', message);
      throw new Error(`Failed to update deployment status: ${message}`);
    }
  }

  /**
   * Update project knowledge base
   */
  async updateKnowledge(projectId: string, knowledge: string, userId: string): Promise<Project | null> {
    try {
      const safeKnowledge = sanitizePostgresText(knowledge) || '';
      const result = await this.sql`
        UPDATE projects
        SET
          knowledge = ${safeKnowledge},
          "updatedAt" = NOW()
        WHERE id = ${projectId} AND "userId" = ${userId}
        RETURNING *
      ` as unknown as Project[];

      return result && result.length > 0 ? result[0] : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ [ProjectsDB.updateKnowledge] Database error:', message);
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
      logger.error('❌ [ProjectsDB.updateCustomDomain] Database error:', message);
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
      logger.error('❌ [ProjectsDB.getProjectWithDetails] Database error:', message);
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
      logger.error('❌ [ProjectsDB.searchProjects] Database error:', message);
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
      logger.error('❌ [ProjectsDB.getProjectCount] Database error:', error);
      return 0;
    }
  }
}
