const { Agent, Project, User } = require('../models');
const { logger } = require('../utils/logger');
const { integrationService } = require('./integrationService');
const { validationService } = require('./validationService');

class AgentService {
  async createAgent(agentData) {
    try {
      const { name, type, description, config, projectId, userId } = agentData;

      // Validate agent configuration
      const validationResult = await validationService.validateAgentConfig(config, type);
      if (!validationResult.isValid) {
        throw new Error(`Invalid agent configuration: ${validationResult.errors.join(', ')}`);
      }

      // Create agent
      const agent = await Agent.create({
        name,
        type,
        description,
        config,
        projectId,
        userId,
        status: 'inactive'
      });

      logger.info(`Agent created: ${agent.id} of type: ${type}`);
      return agent;
    } catch (error) {
      logger.error('Failed to create agent:', error);
      throw error;
    }
  }

  async updateAgent(agentId, updateData) {
    try {
      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Validate configuration if provided
      if (updateData.config) {
        const validationResult = await validationService.validateAgentConfig(updateData.config, agent.type);
        if (!validationResult.isValid) {
          throw new Error(`Invalid agent configuration: ${validationResult.errors.join(', ')}`);
        }
      }

      await agent.update(updateData);
      logger.info(`Agent updated: ${agentId}`);
      return agent;
    } catch (error) {
      logger.error('Failed to update agent:', error);
      throw error;
    }
  }

  async activateAgent(agentId) {
    try {
      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Validate agent configuration before activation
      const validationResult = await validationService.validateAgentConfig(agent.config, agent.type);
      if (!validationResult.isValid) {
        throw new Error(`Cannot activate agent: ${validationResult.errors.join(', ')}`);
      }

      await agent.update({ status: 'active' });
      logger.info(`Agent activated: ${agentId}`);
      return agent;
    } catch (error) {
      logger.error('Failed to activate agent:', error);
      throw error;
    }
  }

  async deactivateAgent(agentId) {
    try {
      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      await agent.update({ status: 'inactive' });
      logger.info(`Agent deactivated: ${agentId}`);
      return agent;
    } catch (error) {
      logger.error('Failed to deactivate agent:', error);
      throw error;
    }
  }

  async executeTask(agent, task, context = {}) {
    try {
      if (agent.status !== 'active') {
        throw new Error('Agent is not active');
      }

      const startTime = Date.now();
      let result;

      switch (agent.type) {
        case 'code':
          result = await this.executeCodeTask(agent, task, context);
          break;
        case 'chat':
          result = await this.executeChatTask(agent, task, context);
          break;
        case 'analysis':
          result = await this.executeAnalysisTask(agent, task, context);
          break;
        case 'deployment':
          result = await this.executeDeploymentTask(agent, task, context);
          break;
        default:
          throw new Error(`Unknown agent type: ${agent.type}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`Task executed by agent ${agent.id} in ${duration}ms`);

      return {
        success: true,
        result,
        duration,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Task execution failed:', error);
      throw error;
    }
  }

  async executeCodeTask(agent, task, context) {
    try {
      const { language, requirements, files } = context;
      
      // Use AI integration to generate code
      const aiResult = await integrationService.generateCode({
        model: agent.config.model || 'gpt-4',
        prompt: task,
        language,
        requirements,
        context: files
      });

      return {
        type: 'code_generation',
        code: aiResult.code,
        explanation: aiResult.explanation,
        files: aiResult.files,
        language
      };
    } catch (error) {
      logger.error('Code task execution failed:', error);
      throw error;
    }
  }

  async executeChatTask(agent, task, context) {
    try {
      const { history, user_id } = context;
      
      // Use AI integration for chat
      const aiResult = await integrationService.chat({
        model: agent.config.model || 'gpt-4',
        messages: [
          { role: 'system', content: agent.config.systemPrompt || 'You are a helpful assistant.' },
          ...(history || []),
          { role: 'user', content: task }
        ],
        temperature: agent.config.temperature || 0.7
      });

      return {
        type: 'chat_response',
        response: aiResult.response,
        tokens_used: aiResult.tokens_used
      };
    } catch (error) {
      logger.error('Chat task execution failed:', error);
      throw error;
    }
  }

  async executeAnalysisTask(agent, task, context) {
    try {
      const { data, analysis_type } = context;
      
      // Use AI integration for analysis
      const aiResult = await integrationService.analyze({
        model: agent.config.model || 'gpt-4',
        data,
        analysis_type,
        prompt: task
      });

      return {
        type: 'analysis_result',
        analysis: aiResult.analysis,
        insights: aiResult.insights,
        recommendations: aiResult.recommendations
      };
    } catch (error) {
      logger.error('Analysis task execution failed:', error);
      throw error;
    }
  }

  async executeDeploymentTask(agent, task, context) {
    try {
      const { environment, configuration } = context;
      
      // Execute deployment task
      const deploymentResult = await integrationService.deploy({
        environment,
        configuration,
        task
      });

      return {
        type: 'deployment_result',
        status: deploymentResult.status,
        url: deploymentResult.url,
        logs: deploymentResult.logs
      };
    } catch (error) {
      logger.error('Deployment task execution failed:', error);
      throw error;
    }
  }

  async getAgentMetrics(agentId) {
    try {
      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Get metrics from usage tracking
      const metrics = await this.calculateAgentMetrics(agent);

      return {
        agentId,
        totalTasks: metrics.totalTasks,
        successRate: metrics.successRate,
        averageResponseTime: metrics.averageResponseTime,
        lastActivity: metrics.lastActivity,
        uptime: metrics.uptime
      };
    } catch (error) {
      logger.error('Failed to get agent metrics:', error);
      throw error;
    }
  }

  async calculateAgentMetrics(agent) {
    // This would typically query a metrics database
    return {
      totalTasks: 0,
      successRate: 0,
      averageResponseTime: 0,
      lastActivity: null,
      uptime: 0
    };
  }

  async getAgentsByProject(projectId) {
    try {
      const agents = await Agent.findAll({
        where: { projectId },
        include: [
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'type']
          }
        ]
      });

      return agents;
    } catch (error) {
      logger.error('Failed to get agents by project:', error);
      throw error;
    }
  }

  async getAgentsByUser(userId) {
    try {
      const agents = await Agent.findAll({
        where: { userId },
        include: [
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'type']
          }
        ]
      });

      return agents;
    } catch (error) {
      logger.error('Failed to get agents by user:', error);
      throw error;
    }
  }

  async cloneAgent(agentId, newData) {
    try {
      const originalAgent = await Agent.findByPk(agentId);
      if (!originalAgent) {
        throw new Error('Agent not found');
      }

      const clonedAgent = await Agent.create({
        name: newData.name || `${originalAgent.name} (Copy)`,
        type: originalAgent.type,
        description: newData.description || originalAgent.description,
        config: { ...originalAgent.config, ...newData.config },
        projectId: newData.projectId || originalAgent.projectId,
        userId: newData.userId || originalAgent.userId,
        status: 'inactive'
      });

      logger.info(`Agent cloned: ${agentId} -> ${clonedAgent.id}`);
      return clonedAgent;
    } catch (error) {
      logger.error('Failed to clone agent:', error);
      throw error;
    }
  }

  async deleteAgent(agentId) {
    try {
      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      await agent.destroy();
      logger.info(`Agent deleted: ${agentId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete agent:', error);
      throw error;
    }
  }
}

module.exports = { agentService: new AgentService() };