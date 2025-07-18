const { Template, Project, User } = require('../models');
const { logger } = require('../utils/logger');
const { structureService } = require('./structureService');

class TemplateService {
  async createTemplate(templateData) {
    try {
      const { name, category, description, structure, config, public: isPublic, userId } = templateData;

      // Validate structure
      const validationResult = await structureService.validateStructure(structure);
      if (!validationResult.isValid) {
        throw new Error(`Invalid template structure: ${validationResult.errors.join(', ')}`);
      }

      // Create template
      const template = await Template.create({
        name,
        category,
        description,
        structure,
        config: config || {},
        public: isPublic || false,
        userId,
        version: '1.0.0'
      });

      logger.info(`Template created: ${template.id} for category: ${category}`);
      return template;
    } catch (error) {
      logger.error('Failed to create template:', error);
      throw error;
    }
  }

  async updateTemplate(templateId, updateData) {
    try {
      const template = await Template.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Validate structure if provided
      if (updateData.structure) {
        const validationResult = await structureService.validateStructure(updateData.structure);
        if (!validationResult.isValid) {
          throw new Error(`Invalid template structure: ${validationResult.errors.join(', ')}`);
        }
      }

      // Increment version if structure changed
      if (updateData.structure && JSON.stringify(updateData.structure) !== JSON.stringify(template.structure)) {
        const version = template.version || '1.0.0';
        const [major, minor, patch] = version.split('.').map(Number);
        updateData.version = `${major}.${minor}.${patch + 1}`;
      }

      await template.update(updateData);
      logger.info(`Template updated: ${templateId}`);
      return template;
    } catch (error) {
      logger.error('Failed to update template:', error);
      throw error;
    }
  }

  async cloneTemplate(originalTemplate, newData) {
    try {
      const clonedTemplate = await Template.create({
        name: newData.name || `${originalTemplate.name} (Copy)`,
        category: originalTemplate.category,
        description: newData.description || originalTemplate.description,
        structure: originalTemplate.structure,
        config: { ...originalTemplate.config, ...newData.config },
        public: newData.public || false,
        userId: newData.userId,
        version: '1.0.0',
        originalTemplateId: originalTemplate.id
      });

      logger.info(`Template cloned: ${originalTemplate.id} -> ${clonedTemplate.id}`);
      return clonedTemplate;
    } catch (error) {
      logger.error('Failed to clone template:', error);
      throw error;
    }
  }

  async deleteTemplate(templateId) {
    try {
      const template = await Template.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Check if template is being used by any projects
      const projectsUsingTemplate = await Project.count({
        where: { templateId }
      });

      if (projectsUsingTemplate > 0) {
        throw new Error('Template is being used by projects and cannot be deleted');
      }

      await template.destroy();
      logger.info(`Template deleted: ${templateId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete template:', error);
      throw error;
    }
  }

  async getTemplatesByCategory(category, options = {}) {
    try {
      const { userId, publicOnly = false } = options;
      const whereClause = { category };
      
      if (publicOnly) {
        whereClause.public = true;
      } else if (userId) {
        whereClause[Op.or] = [
          { userId },
          { public: true }
        ];
      }

      const templates = await Template.findAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      return templates;
    } catch (error) {
      logger.error('Failed to get templates by category:', error);
      throw error;
    }
  }

  async getPopularTemplates(limit = 10) {
    try {
      // Get templates with most usage
      const templates = await Template.findAll({
        where: { public: true },
        include: [
          {
            model: Project,
            as: 'projects',
            attributes: ['id']
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [
          [{ model: Project, as: 'projects' }, 'createdAt', 'DESC']
        ],
        limit
      });

      // Sort by usage count
      return templates.sort((a, b) => (b.projects?.length || 0) - (a.projects?.length || 0));
    } catch (error) {
      logger.error('Failed to get popular templates:', error);
      throw error;
    }
  }

  async searchTemplates(query, options = {}) {
    try {
      const { userId, category, publicOnly = false } = options;
      const whereClause = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } }
        ]
      };

      if (category) {
        whereClause.category = category;
      }

      if (publicOnly) {
        whereClause.public = true;
      } else if (userId) {
        whereClause[Op.and] = [
          whereClause,
          {
            [Op.or]: [
              { userId },
              { public: true }
            ]
          }
        ];
      }

      const templates = await Template.findAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      return templates;
    } catch (error) {
      logger.error('Failed to search templates:', error);
      throw error;
    }
  }

  async getTemplateUsage(templateId) {
    try {
      const template = await Template.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const projectsCount = await Project.count({
        where: { templateId }
      });

      const recentProjects = await Project.findAll({
        where: { templateId },
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      return {
        templateId,
        totalProjects: projectsCount,
        recentProjects,
        lastUsed: recentProjects.length > 0 ? recentProjects[0].createdAt : null
      };
    } catch (error) {
      logger.error('Failed to get template usage:', error);
      throw error;
    }
  }

  async validateTemplate(templateId) {
    try {
      const template = await Template.findByPk(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const validationResult = await structureService.validateStructure(template.structure);
      
      return {
        templateId,
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        warnings: validationResult.warnings
      };
    } catch (error) {
      logger.error('Failed to validate template:', error);
      throw error;
    }
  }

  async exportTemplate(templateId) {
    try {
      const template = await Template.findByPk(templateId, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      if (!template) {
        throw new Error('Template not found');
      }

      return {
        name: template.name,
        category: template.category,
        description: template.description,
        structure: template.structure,
        config: template.config,
        version: template.version,
        author: template.user ? template.user.name : 'Unknown',
        exportedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to export template:', error);
      throw error;
    }
  }

  async importTemplate(templateData, userId) {
    try {
      const { name, category, description, structure, config, version } = templateData;

      // Validate imported structure
      const validationResult = await structureService.validateStructure(structure);
      if (!validationResult.isValid) {
        throw new Error(`Invalid template structure: ${validationResult.errors.join(', ')}`);
      }

      const template = await Template.create({
        name,
        category,
        description,
        structure,
        config: config || {},
        public: false,
        userId,
        version: version || '1.0.0',
        imported: true
      });

      logger.info(`Template imported: ${template.id}`);
      return template;
    } catch (error) {
      logger.error('Failed to import template:', error);
      throw error;
    }
  }
}

module.exports = { templateService: new TemplateService() };