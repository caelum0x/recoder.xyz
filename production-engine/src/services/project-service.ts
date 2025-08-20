/**
 * Project Management Service for Recoder.ai DaaS Platform
 * Handles project creation, sharing, collaboration, and deployment
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';

export interface DeveloperProject {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  teamId?: string;
  type: 'web' | 'mobile' | 'backend' | 'fullstack' | 'blockchain' | 'ai' | 'saas' | 'ecommerce';
  framework: string;
  status: 'generating' | 'ready' | 'deployed' | 'archived' | 'failed';
  visibility: 'public' | 'private' | 'team';
  
  // Generation details
  prompt: string;
  features: string[];
  aiModel: string;
  generationTime: number;
  tokensUsed: number;
  
  // Project files
  files: Array<{
    path: string;
    content: string;
    type: 'code' | 'config' | 'test' | 'documentation';
    language: string;
    size: number;
  }>;
  
  // Metadata
  tags: string[];
  readme: string;
  license: string;
  dependencies: Record<string, string>;
  buildConfig: {
    buildCommand: string;
    startCommand: string;
    installCommand: string;
    testCommand?: string;
  };
  
  // Social features
  likes: string[]; // userIds who liked
  views: number;
  forks: string[]; // userIds who forked
  comments: Array<{
    id: string;
    userId: string;
    content: string;
    createdAt: Date;
    updatedAt?: Date;
  }>;
  
  // Deployment
  deployments: Array<{
    id: string;
    platform: 'vercel' | 'netlify' | 'aws' | 'heroku' | 'github-pages';
    url: string;
    status: 'deploying' | 'deployed' | 'failed';
    deployedAt: Date;
    logs?: string[];
  }>;
  
  // Version control
  versions: Array<{
    id: string;
    version: string;
    changes: string;
    createdAt: Date;
    files: string; // Serialized file diff
  }>;
  
  // Collaboration
  collaborators: Array<{
    userId: string;
    role: 'viewer' | 'editor' | 'admin';
    invitedAt: Date;
    acceptedAt?: Date;
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  framework: string;
  type: 'web' | 'mobile' | 'backend' | 'fullstack' | 'blockchain';
  features: string[];
  tags: string[];
  prompt: string;
  estimatedTime: number; // in minutes
  popularity: number;
  thumbnailUrl: string;
  demoUrl?: string;
  createdBy: 'system' | string; // userId if user-generated
  isOfficial: boolean;
  isPremium: boolean;
  usageCount: number;
  rating: number;
  reviews: Array<{
    userId: string;
    rating: number;
    comment: string;
    createdAt: Date;
  }>;
}

export interface ProjectAnalytics {
  totalProjects: number;
  projectsByType: Record<string, number>;
  projectsByFramework: Record<string, number>;
  avgGenerationTime: number;
  totalTokensUsed: number;
  popularTemplates: Array<{ templateId: string; count: number }>;
  recentActivity: Array<{
    projectId: string;
    action: 'created' | 'updated' | 'deployed' | 'liked' | 'forked';
    timestamp: Date;
  }>;
}

export class ProjectService {
  private projects: Map<string, DeveloperProject> = new Map();
  private templates: Map<string, ProjectTemplate> = new Map();
  private userProjects: Map<string, string[]> = new Map(); // userId -> projectIds
  private publicProjects: Set<string> = new Set(); // projectIds for public gallery

  constructor() {
    this.initializeProjectService();
  }

  private initializeProjectService(): void {
    logger.info('🚀 Initializing Developer Project Service...');
    
    // Load existing project data
    this.loadProjectData();
    
    // Initialize default templates
    this.initializeTemplates();
    
    logger.info('✅ Developer Project Service initialized');
  }

  private loadProjectData(): void {
    // In production, load from database
    logger.info('📊 Loading project data...');
  }

  /**
   * Create a new project from AI generation
   */
  async createProject(
    userId: string,
    projectData: {
      name: string;
      description: string;
      type: DeveloperProject['type'];
      framework: string;
      prompt: string;
      features: string[];
      visibility: 'public' | 'private' | 'team';
      teamId?: string;
      templateId?: string;
    }
  ): Promise<{ success: boolean; project?: DeveloperProject; error?: string }> {
    try {
      // Validate user
      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Generate project ID
      const projectId = this.generateProjectId();

      // Create project
      const project: DeveloperProject = {
        id: projectId,
        name: projectData.name,
        description: projectData.description,
        ownerId: userId,
        teamId: projectData.teamId,
        type: projectData.type,
        framework: projectData.framework,
        status: 'generating',
        visibility: projectData.visibility,
        prompt: projectData.prompt,
        features: projectData.features,
        aiModel: 'auto-selected',
        generationTime: 0,
        tokensUsed: 0,
        files: [],
        tags: this.generateTags(projectData),
        readme: '',
        license: 'MIT',
        dependencies: {},
        buildConfig: {
          buildCommand: 'npm run build',
          startCommand: 'npm start',
          installCommand: 'npm install'
        },
        likes: [],
        views: 0,
        forks: [],
        comments: [],
        deployments: [],
        versions: [],
        collaborators: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store project
      this.projects.set(projectId, project);
      
      // Add to user's projects
      if (!this.userProjects.has(userId)) {
        this.userProjects.set(userId, []);
      }
      this.userProjects.get(userId)!.push(projectId);

      // Add to public gallery if public
      if (project.visibility === 'public') {
        this.publicProjects.add(projectId);
      }

      logger.info(`🚀 Project created: ${project.name} by ${user.username}`);

      return { success: true, project };

    } catch (error: any) {
      logger.error('Project creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update project with generated code
   */
  async updateProjectWithCode(
    projectId: string,
    generationResult: {
      files: Array<{ path: string; content: string; type: string }>;
      readme: string;
      tokensUsed: number;
      generationTime: number;
      aiModel: string;
    }
  ): Promise<{ success: boolean; project?: DeveloperProject; error?: string }> {
    try {
      const project = this.projects.get(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Update project with generated code
      project.files = generationResult.files.map(file => ({
        ...file,
        language: this.detectLanguage(file.path),
        size: file.content.length
      }));
      
      project.readme = generationResult.readme;
      project.tokensUsed = generationResult.tokensUsed;
      project.generationTime = generationResult.generationTime;
      project.aiModel = generationResult.aiModel;
      project.status = 'ready';
      project.updatedAt = new Date();

      // Generate dependencies from package.json if exists
      const packageJsonFile = project.files.find(f => f.path === 'package.json');
      if (packageJsonFile) {
        try {
          const packageJson = JSON.parse(packageJsonFile.content);
          project.dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies
          };
        } catch (e) {
          // Ignore JSON parse errors
        }
      }

      // Create initial version
      project.versions.push({
        id: this.generateVersionId(),
        version: '1.0.0',
        changes: 'Initial generation',
        createdAt: new Date(),
        files: JSON.stringify(project.files)
      });

      logger.info(`✅ Project updated with code: ${project.name}`);

      return { success: true, project };

    } catch (error: any) {
      logger.error('Project code update failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's projects
   */
  getUserProjects(
    userId: string,
    filters?: {
      type?: string;
      status?: string;
      visibility?: string;
      limit?: number;
      offset?: number;
    }
  ): {
    projects: DeveloperProject[];
    total: number;
  } {
    const userProjectIds = this.userProjects.get(userId) || [];
    let projects = userProjectIds
      .map(id => this.projects.get(id))
      .filter(Boolean) as DeveloperProject[];

    // Apply filters
    if (filters) {
      if (filters.type) {
        projects = projects.filter(p => p.type === filters.type);
      }
      if (filters.status) {
        projects = projects.filter(p => p.status === filters.status);
      }
      if (filters.visibility) {
        projects = projects.filter(p => p.visibility === filters.visibility);
      }
    }

    // Sort by most recent
    projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const total = projects.length;

    // Apply pagination
    if (filters?.limit) {
      const offset = filters.offset || 0;
      projects = projects.slice(offset, offset + filters.limit);
    }

    return { projects, total };
  }

  /**
   * Get public project gallery
   */
  getPublicGallery(filters?: {
    type?: string;
    framework?: string;
    tags?: string[];
    sortBy?: 'recent' | 'popular' | 'liked';
    limit?: number;
    offset?: number;
  }): {
    projects: Array<DeveloperProject & { ownerUsername: string }>;
    total: number;
  } {
    let projects = Array.from(this.publicProjects)
      .map(id => this.projects.get(id))
      .filter(Boolean) as DeveloperProject[];

    // Apply filters
    if (filters) {
      if (filters.type) {
        projects = projects.filter(p => p.type === filters.type);
      }
      if (filters.framework) {
        projects = projects.filter(p => p.framework === filters.framework);
      }
      if (filters.tags) {
        projects = projects.filter(p => 
          filters.tags!.some(tag => p.tags.includes(tag))
        );
      }
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'recent';
    switch (sortBy) {
      case 'popular':
        projects.sort((a, b) => b.views - a.views);
        break;
      case 'liked':
        projects.sort((a, b) => b.likes.length - a.likes.length);
        break;
      default: // recent
        projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    const total = projects.length;

    // Apply pagination
    if (filters?.limit) {
      const offset = filters.offset || 0;
      projects = projects.slice(offset, offset + filters.limit);
    }

    // Add owner usernames
    const projectsWithOwner = projects.map(project => {
      const owner = userService.getUserProfile(project.ownerId);
      return {
        ...project,
        ownerUsername: owner?.username || 'unknown'
      };
    });

    return { projects: projectsWithOwner, total };
  }

  /**
   * Like/unlike a project
   */
  async toggleProjectLike(
    projectId: string,
    userId: string
  ): Promise<{ success: boolean; liked: boolean; error?: string }> {
    try {
      const project = this.projects.get(projectId);
      if (!project) {
        return { success: false, liked: false, error: 'Project not found' };
      }

      const likeIndex = project.likes.indexOf(userId);
      
      if (likeIndex === -1) {
        // Add like
        project.likes.push(userId);
        project.updatedAt = new Date();
        
        logger.info(`👍 Project liked: ${project.name} by user ${userId}`);
        
        return { success: true, liked: true };
      } else {
        // Remove like
        project.likes.splice(likeIndex, 1);
        project.updatedAt = new Date();
        
        logger.info(`👎 Project unliked: ${project.name} by user ${userId}`);
        
        return { success: true, liked: false };
      }

    } catch (error: any) {
      logger.error('Toggle like failed:', error);
      return { success: false, liked: false, error: error.message };
    }
  }

  /**
   * Fork a project
   */
  async forkProject(
    projectId: string,
    userId: string,
    forkData: {
      name: string;
      description?: string;
      visibility: 'public' | 'private';
    }
  ): Promise<{ success: boolean; project?: DeveloperProject; error?: string }> {
    try {
      const originalProject = this.projects.get(projectId);
      if (!originalProject) {
        return { success: false, error: 'Original project not found' };
      }

      // Check if project is forkable
      if (originalProject.visibility === 'private' && originalProject.ownerId !== userId) {
        return { success: false, error: 'Cannot fork private project' };
      }

      // Create forked project
      const forkedProjectId = this.generateProjectId();
      const forkedProject: DeveloperProject = {
        ...originalProject,
        id: forkedProjectId,
        name: forkData.name,
        description: forkData.description || `Fork of ${originalProject.name}`,
        ownerId: userId,
        visibility: forkData.visibility,
        likes: [],
        views: 0,
        forks: [],
        comments: [],
        deployments: [],
        collaborators: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store forked project
      this.projects.set(forkedProjectId, forkedProject);
      
      // Add to user's projects
      if (!this.userProjects.has(userId)) {
        this.userProjects.set(userId, []);
      }
      this.userProjects.get(userId)!.push(forkedProjectId);

      // Add to public gallery if public
      if (forkedProject.visibility === 'public') {
        this.publicProjects.add(forkedProjectId);
      }

      // Update original project's fork list
      originalProject.forks.push(userId);
      originalProject.updatedAt = new Date();

      logger.info(`🍴 Project forked: ${originalProject.name} -> ${forkedProject.name}`);

      return { success: true, project: forkedProject };

    } catch (error: any) {
      logger.error('Fork project failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get project templates
   */
  getProjectTemplates(filters?: {
    category?: string;
    type?: string;
    difficulty?: string;
    framework?: string;
    isPremium?: boolean;
    limit?: number;
  }): ProjectTemplate[] {
    let templates = Array.from(this.templates.values());

    // Apply filters
    if (filters) {
      if (filters.category) {
        templates = templates.filter(t => t.category === filters.category);
      }
      if (filters.type) {
        templates = templates.filter(t => t.type === filters.type);
      }
      if (filters.difficulty) {
        templates = templates.filter(t => t.difficulty === filters.difficulty);
      }
      if (filters.framework) {
        templates = templates.filter(t => t.framework === filters.framework);
      }
      if (filters.isPremium !== undefined) {
        templates = templates.filter(t => t.isPremium === filters.isPremium);
      }
    }

    // Sort by popularity
    templates.sort((a, b) => b.popularity - a.popularity);

    // Apply limit
    if (filters?.limit) {
      templates = templates.slice(0, filters.limit);
    }

    return templates;
  }

  /**
   * Generate project analytics
   */
  generateProjectAnalytics(userId?: string): ProjectAnalytics {
    let projects: DeveloperProject[];

    if (userId) {
      // User-specific analytics
      const userProjectIds = this.userProjects.get(userId) || [];
      projects = userProjectIds
        .map(id => this.projects.get(id))
        .filter(Boolean) as DeveloperProject[];
    } else {
      // Platform-wide analytics
      projects = Array.from(this.projects.values());
    }

    const analytics: ProjectAnalytics = {
      totalProjects: projects.length,
      projectsByType: {},
      projectsByFramework: {},
      avgGenerationTime: 0,
      totalTokensUsed: 0,
      popularTemplates: [],
      recentActivity: []
    };

    // Calculate metrics
    projects.forEach(project => {
      // Count by type
      analytics.projectsByType[project.type] = 
        (analytics.projectsByType[project.type] || 0) + 1;

      // Count by framework
      analytics.projectsByFramework[project.framework] = 
        (analytics.projectsByFramework[project.framework] || 0) + 1;

      // Accumulate tokens and generation time
      analytics.totalTokensUsed += project.tokensUsed;
      analytics.avgGenerationTime += project.generationTime;
    });

    // Calculate averages
    if (projects.length > 0) {
      analytics.avgGenerationTime = Math.round(analytics.avgGenerationTime / projects.length);
    }

    return analytics;
  }

  private generateTags(projectData: any): string[] {
    const tags = [projectData.type, projectData.framework];
    
    // Add feature-based tags
    projectData.features.forEach((feature: string) => {
      if (feature.toLowerCase().includes('auth')) tags.push('authentication');
      if (feature.toLowerCase().includes('database')) tags.push('database');
      if (feature.toLowerCase().includes('api')) tags.push('api');
      if (feature.toLowerCase().includes('payment')) tags.push('payments');
    });

    return [...new Set(tags)]; // Remove duplicates
  }

  private detectLanguage(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'sol': 'solidity',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml'
    };
    
    return languageMap[extension || ''] || 'text';
  }

  private initializeTemplates(): void {
    // Initialize with popular templates
    const defaultTemplates: Partial<ProjectTemplate>[] = [
      {
        name: 'React Todo App',
        description: 'A complete todo application with CRUD operations',
        category: 'Web Apps',
        difficulty: 'beginner',
        framework: 'react',
        type: 'web',
        features: ['CRUD operations', 'Local storage', 'Responsive design'],
        tags: ['react', 'javascript', 'beginner', 'todo'],
        prompt: 'Create a React todo application with add, edit, delete, and mark complete functionality',
        estimatedTime: 15,
        popularity: 95,
        isOfficial: true,
        isPremium: false
      },
      {
        name: 'Next.js SaaS Starter',
        description: 'Complete SaaS application with authentication and payments',
        category: 'SaaS',
        difficulty: 'advanced',
        framework: 'nextjs',
        type: 'fullstack',
        features: ['Authentication', 'Stripe payments', 'Dashboard', 'Admin panel'],
        tags: ['nextjs', 'saas', 'stripe', 'auth'],
        prompt: 'Build a complete SaaS application with user authentication, subscription billing, and admin dashboard',
        estimatedTime: 45,
        popularity: 87,
        isOfficial: true,
        isPremium: true
      },
      {
        name: 'E-commerce Store',
        description: 'Full-featured online store with cart and payments',
        category: 'E-commerce',
        difficulty: 'intermediate',
        framework: 'react',
        type: 'fullstack',
        features: ['Product catalog', 'Shopping cart', 'Payment processing', 'Order management'],
        tags: ['ecommerce', 'shopping', 'payments', 'cart'],
        prompt: 'Create a complete e-commerce store with product listings, shopping cart, and payment integration',
        estimatedTime: 30,
        popularity: 82,
        isOfficial: true,
        isPremium: false
      }
    ];

    defaultTemplates.forEach((template, index) => {
      const templateId = `template_${index + 1}`;
      this.templates.set(templateId, {
        id: templateId,
        createdBy: 'system',
        usageCount: Math.floor(Math.random() * 1000),
        rating: 4.5 + Math.random() * 0.5,
        reviews: [],
        thumbnailUrl: `/templates/${templateId}.jpg`,
        ...template
      } as ProjectTemplate);
    });
  }

  private generateProjectId(): string {
    return 'proj_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private generateVersionId(): string {
    return 'ver_' + Math.random().toString(36).substr(2, 9);
  }
}

// Export singleton instance
export const projectService = new ProjectService();