/**
 * Database operations for projects
 * Manages project storage in PostgreSQL/Neon
 */

import { neon } from '@neondatabase/serverless';

export interface Project {
  id: number;
  name: string;
  description?: string;
  icon: string;
  color: string;
  user_id?: string;
  anonymous_id?: string;
  chat_count: number;
  file_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  userId?: string;
  anonymousId?: string;
}

export class ProjectsDB {
  private sql: ReturnType<typeof neon>;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.sql = neon(databaseUrl);
  }

  /**
   * Get all projects for a user or anonymous session
   */
  async getUserProjects(userId?: string, anonymousId?: string): Promise<Project[]> {
    try {
      let query: string;
      let params: any[];

      if (userId) {
        query = `
          SELECT * FROM projects 
          WHERE user_id = $1 
          ORDER BY updated_at DESC
        `;
        params = [userId];
      } else if (anonymousId) {
        query = `
          SELECT * FROM projects 
          WHERE anonymous_id = $1 
          ORDER BY updated_at DESC
        `;
        params = [anonymousId];
      } else {
        // Return empty array if no user or anonymous ID
        return [];
      }

      const result = await this.sql(query, params);
      return result as Project[];

    } catch (error) {
      console.error('❌ [ProjectsDB.getUserProjects] Database error:', error);
      throw new Error(`Failed to get user projects: ${error.message}`);
    }
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData): Promise<Project> {
    try {
      const query = `
        INSERT INTO projects (name, description, icon, color, user_id, anonymous_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `;

      const params = [
        data.name,
        data.description || '',
        data.icon || '📁',
        data.color || '#3b82f6',
        data.userId || null,
        data.anonymousId || null
      ];

      const result = await this.sql(query, params);
      
      if (!result || result.length === 0) {
        throw new Error('No project returned from database');
      }

      return result[0] as Project;

    } catch (error) {
      console.error('❌ [ProjectsDB.createProject] Database error:', error);
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  /**
   * Update project details
   */
  async updateProject(projectId: number, data: Partial<CreateProjectData>, userId?: string, anonymousId?: string): Promise<Project | null> {
    try {
      // First verify ownership
      const ownership = userId 
        ? 'user_id = $2' 
        : 'anonymous_id = $2';
      
      const ownershipId = userId || anonymousId;
      
      if (!ownershipId) {
        throw new Error('No user ID or anonymous ID provided');
      }

      const updateFields = [];
      const params = [projectId, ownershipId];
      let paramIndex = 3;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIndex}`);
        params.push(data.name);
        paramIndex++;
      }

      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        params.push(data.description);
        paramIndex++;
      }

      if (data.icon !== undefined) {
        updateFields.push(`icon = $${paramIndex}`);
        params.push(data.icon);
        paramIndex++;
      }

      if (data.color !== undefined) {
        updateFields.push(`color = $${paramIndex}`);
        params.push(data.color);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push('updated_at = NOW()');

      const query = `
        UPDATE projects 
        SET ${updateFields.join(', ')}
        WHERE id = $1 AND ${ownership}
        RETURNING *
      `;

      const result = await this.sql(query, params);
      
      if (!result || result.length === 0) {
        return null;
      }

      return result[0] as Project;

    } catch (error) {
      console.error('❌ [ProjectsDB.updateProject] Database error:', error);
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: number, userId?: string, anonymousId?: string): Promise<boolean> {
    try {
      const ownership = userId 
        ? 'user_id = $2' 
        : 'anonymous_id = $2';
      
      const ownershipId = userId || anonymousId;
      
      if (!ownershipId) {
        throw new Error('No user ID or anonymous ID provided');
      }

      const query = `
        DELETE FROM projects 
        WHERE id = $1 AND ${ownership}
        RETURNING id
      `;

      const result = await this.sql(query, [projectId, ownershipId]);
      
      return result && result.length > 0;

    } catch (error) {
      console.error('❌ [ProjectsDB.deleteProject] Database error:', error);
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: number, userId?: string, anonymousId?: string): Promise<Project | null> {
    try {
      const ownership = userId 
        ? 'user_id = $2' 
        : 'anonymous_id = $2';
      
      const ownershipId = userId || anonymousId;
      
      if (!ownershipId) {
        throw new Error('No user ID or anonymous ID provided');
      }

      const query = `
        SELECT * FROM projects 
        WHERE id = $1 AND ${ownership}
      `;

      const result = await this.sql(query, [projectId, ownershipId]);
      
      if (!result || result.length === 0) {
        return null;
      }

      return result[0] as Project;

    } catch (error) {
      console.error('❌ [ProjectsDB.getProject] Database error:', error);
      throw new Error(`Failed to get project: ${error.message}`);
    }
  }

  /**
   * Update project stats (chat count, file count)
   */
  async updateProjectStats(projectId: number): Promise<void> {
    try {
      // This would need to be implemented based on how chats and files are linked to projects
      // For now, just update the timestamp
      const query = `
        UPDATE projects 
        SET updated_at = NOW()
        WHERE id = $1
      `;

      await this.sql(query, [projectId]);

    } catch (error) {
      console.error('❌ [ProjectsDB.updateProjectStats] Database error:', error);
      // Don't throw error for stats update to avoid breaking other operations
    }
  }
}
