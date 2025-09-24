const { prisma } = require('../database/prisma');
const { logger } = require('../utils/logger');
const { codeService } = require('./codeService');
const { structureService } = require('./structureService');

class ProjectService {
  async createProject(projectData) {
    try {
      const { name, type, description, config, templateId, userId } = projectData;

      // Create project using Prisma
      const project = await prisma.project.create({
        data: {
          name,
          type,
          description,
          config: config || {},
          templateId,
          userId,
          status: 'planning'
        }
      });

      // Initialize project structure if template is provided
      if (templateId) {
        await this.initializeFromTemplate(project, templateId);
      }

      logger.info(`Project created: ${project.id} of type: ${type}`);
      return project;
    } catch (error) {
      logger.error('Failed to create project:', error);
      throw error;
    }
  }

  async initializeFromTemplate(project, templateId) {
    try {
      const template = await prisma.template.findUnique({
        where: { id: templateId }
      });
      if (!template) {
        throw new Error('Template not found');
      }

      // Generate initial structure from template
      const structure = await structureService.generateFromTemplate(template.structure, project.config);
      
      // Update project with generated structure
      await prisma.project.update({
        where: { id: project.id },
        data: {
          structure,
          config: { ...project.config, templateStructure: template.structure }
        }
      });

      logger.info(`Project initialized from template: ${templateId}`);
    } catch (error) {
      logger.error('Failed to initialize project from template:', error);
      throw error;
    }
  }

  async updateProject(projectId, updateData) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (!project) {
        throw new Error('Project not found');
      }

      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: updateData
      });
      logger.info(`Project updated: ${projectId}`);
      return updatedProject;
    } catch (error) {
      logger.error('Failed to update project:', error);
      throw error;
    }
  }

  async getProjectStructure(project) {
    try {
      if (project.structure) {
        return project.structure;
      }

      // Generate structure based on project type and config
      const structure = await structureService.generateProjectStructure(project.type, project.config);
      
      // Save generated structure
      await prisma.project.update({
        where: { id: project.id },
        data: { structure }
      });
      
      return structure;
    } catch (error) {
      logger.error('Failed to get project structure:', error);
      throw error;
    }
  }

  async generateProjectCode(project, options = {}) {
    try {
      const structure = await this.getProjectStructure(project);
      
      // Generate code using code service
      const generatedCode = await codeService.generateFromStructure(structure, {
        projectType: project.type,
        projectConfig: project.config,
        ...options
      });

      // Update project with generated code metadata
      await prisma.project.update({
        where: { id: project.id },
        data: {
          lastGenerated: new Date(),
          generatedCodeMetadata: {
            filesGenerated: generatedCode.files ? generatedCode.files.length : 0,
            linesGenerated: generatedCode.totalLines || 0,
            options
          }
        }
      });

      logger.info(`Code generated for project: ${project.id}`);
      return generatedCode;
    } catch (error) {
      logger.error('Failed to generate project code:', error);
      throw error;
    }
  }

  async cloneProject(projectId, newData) {
    try {
      const originalProject = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          template: true,
          agents: true
        }
      });

      if (!originalProject) {
        throw new Error('Project not found');
      }

      const clonedProject = await prisma.project.create({
        data: {
          name: newData.name || `${originalProject.name} (Copy)`,
          type: originalProject.type,
          description: newData.description || originalProject.description,
          config: { ...originalProject.config, ...newData.config },
          structure: originalProject.structure,
          templateId: originalProject.templateId,
          userId: newData.userId || originalProject.userId,
          status: 'planning'
        }
      });

      // Clone agents if requested
      if (newData.cloneAgents && originalProject.agents) {
        for (const agent of originalProject.agents) {
          await prisma.agent.create({
            data: {
              name: agent.name,
              type: agent.type,
              description: agent.description,
              config: agent.config,
              projectId: clonedProject.id,
              userId: clonedProject.userId,
              status: 'inactive'
            }
          });
        }
      }

      logger.info(`Project cloned: ${projectId} -> ${clonedProject.id}`);
      return clonedProject;
    } catch (error) {
      logger.error('Failed to clone project:', error);
      throw error;
    }
  }

  async deleteProject(projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (!project) {
        throw new Error('Project not found');
      }

      // Delete associated agents
      await prisma.agent.deleteMany({
        where: { projectId }
      });

      // Delete project
      await prisma.project.delete({
        where: { id: projectId }
      });
      
      logger.info(`Project deleted: ${projectId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete project:', error);
      throw error;
    }
  }

  async getProjectMetrics(projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (!project) {
        throw new Error('Project not found');
      }

      const agents = await prisma.agent.findMany({
        where: { projectId }
      });
      const activeAgents = agents.filter(agent => agent.status === 'active');

      return {
        projectId,
        status: project.status,
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        lastGenerated: project.lastGenerated,
        generatedCodeMetadata: project.generatedCodeMetadata,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      };
    } catch (error) {
      logger.error('Failed to get project metrics:', error);
      throw error;
    }
  }

  async getProjectsByUser(userId, filters = {}) {
    try {
      const whereClause = { userId };
      
      if (filters.type) {
        whereClause.type = filters.type;
      }
      
      if (filters.status) {
        whereClause.status = filters.status;
      }

      const projects = await prisma.project.findMany({
        where: whereClause,
        include: {
          template: {
            select: {
              id: true,
              name: true,
              category: true
            }
          },
          agents: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return projects;
    } catch (error) {
      logger.error('Failed to get projects by user:', error);
      throw error;
    }
  }

  async updateProjectStatus(projectId, status) {
    try {
      const validStatuses = ['planning', 'active', 'completed', 'archived'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (!project) {
        throw new Error('Project not found');
      }

      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: { status }
      });
      logger.info(`Project status updated: ${projectId} -> ${status}`);
      return updatedProject;
    } catch (error) {
      logger.error('Failed to update project status:', error);
      throw error;
    }
  }
}

module.exports = { projectService: new ProjectService() };